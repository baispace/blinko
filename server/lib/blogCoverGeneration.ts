import { readDraftBody } from "./blogPublishCheck";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { publicText } from "./publicBlog";
import { FileService } from "./files";
import { fetchWithProxy } from "./proxy";
import { attachBlogCover } from "./blog";
import { COVER_SOURCE, type CoverFocusValue } from "../../shared/lib/blogCover";
import {
  computeCoverTextLayout,
  normalizeCoverTextConfig,
  type CoverSceneKey,
  type CoverTextConfig,
} from "../../shared/lib/blogCoverText";
import {
  normalizeCoverConfig,
  readDraftCoverConfig,
  writeDraftCoverConfig,
  type CoverConfig,
} from "./blogCoverConfig";
import { composeCoverImage } from "./blogCoverComposition";

export const coverStyles = {
  ink: "原型封面风格：饱和紫蓝渐变背景，精致圆角立体图标、白色悬浮卡片、玻璃与软质材质，强对比和清晰体积感；主体集中在右侧55%，左侧留白给站点排版标题。",
  minimal:
    "极简编辑插画：低饱和配色，少量几何物件，干净背景，突出一个核心意象。",
  editorial: "杂志风格摄影：自然光，真实材质，有叙事感，构图简洁，不堆砌元素。",
} as const;
export type CoverStyle = keyof typeof coverStyles;
type ConfiguredModel = {
  id: number;
  title: string;
  modelKey: string;
  capabilities: any;
  config?: any;
  provider: {
    provider: string;
    title?: string;
    apiKey?: string | null;
    baseURL?: string | null;
  };
};
function isMiniMaxTextModel(model: ConfiguredModel) {
  return /^minimax-m[23](?:[._-]|$)/i.test(model.modelKey);
}

/**
 * image-01-live：MiniMax 生图的低延迟变体。
 *
 * 与 image-01 的差异（官方 OpenAPI）：
 *   - 支持画风增强 style（image-01 不认，传了直接报参数异常）；
 *   - 只认 aspect_ratio，不支持 width/height，也不支持 21:9；
 *   - 16:9 输出 1456×816，比 image-01 的 1280×720 更接近封面源图 1600×900。
 */
export function isMiniMaxLiveModel(model: { modelKey: string }) {
  return /^image-01-live$/i.test(model.modelKey.trim());
}

/** MiniMax 画风增强的取值（仅 image-01-live 支持）。 */
export const minimaxStyleTypes = ["漫画", "元气", "中世纪", "水彩"] as const;
export type MinimaxStyleType = (typeof minimaxStyleTypes)[number];
export type MinimaxStyle = { style_type: MinimaxStyleType; style_weight: number };

/**
 * 博客封面风格 → MiniMax 画风 + 权重。
 *
 * 实测（同一段描述，同一个模型）：
 *   - 不下发 style：配色失控，容易跑成暗调微缩场景。
 *   - 漫画 0.4：紫蓝渐变铺满 + 3D 立体物件 + 零文字，最贴合博客封面。
 *   - 元气：主体居中，没有左侧标题位，只适合极简封面。
 * 权重压到 0.4 以下：画风只做点缀，不至于盖掉构图。
 */
const minimaxStyleByCoverStyle: Record<CoverStyle, MinimaxStyle> = {
  ink: { style_type: "漫画", style_weight: 0.4 },
  minimal: { style_type: "元气", style_weight: 0.35 },
  editorial: { style_type: "漫画", style_weight: 0.25 },
};

export function minimaxStyleFor(style: CoverStyle = "ink"): MinimaxStyle {
  return minimaxStyleByCoverStyle[style] ?? minimaxStyleByCoverStyle.ink;
}

/** 一次生成几张候选底图。live 够快，多出几张几乎不占等待时间。 */
function imageCandidateCount(model: { modelKey: string }) {
  return isMiniMaxLiveModel(model) ? 3 : 1;
}
export function imageProtocol(
  model: ConfiguredModel,
): "openai" | "minimax" | null {
  if (!model.capabilities?.imageGeneration || isMiniMaxTextModel(model))
    return null;
  const provider = model.provider.provider.toLowerCase();
  if (
    model.config?.imageGenerationProtocol === "minimax" ||
    provider === "minimax"
  )
    return "minimax";
  if (
    model.config?.imageGenerationProtocol === "openai" ||
    ["openai", "custom"].includes(provider)
  )
    return "openai";
  return null;
}

/**
 * 底图提示词。
 *
 * 底图 = 不含任何文字的画面：背景、插画、装饰。
 * 短标题由站点用系统字体排上去，所以这里必须反复强调「不要画字」，
 * 否则模型很容易顺手写几个假字或一段像文字的纹理。
 */
export function coverPrompt(
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  /*
   * 主题放在最前面：MiniMax 协议会把提示词截到 1500 字，
   * 主题放在末尾会被截掉 —— 那就等于白说了。
   */
  const extra = userDirection(direction);
  return `主题参考：${publicText(title).slice(0, 80)}
内容参考：${publicText(content).slice(0, 260)}
${extra}绘制一张用于中文个人博客的高品质产品设计插画配图，不是海报，也不是实物摄影。横向16:9，1600×900。
视觉目标：鲜明、饱和的紫蓝/亮蓝/青绿渐变铺满画面，清晰的明暗层次；精致的2.5D圆角界面卡片、图表、流程节点或工具图标。物体有厚度、细腻高光、轻微半透明叠层和短阴影，像产品功能发布封面，简洁而有分量。
构图：左侧45%干净留给系统后期添加大标题；右侧55%用2–3个较大的主题物件组成紧凑、错落的插画。根据内容选意象：分析用图表/仪表板，方法用卡片/步骤，复盘用清单/笔，阅读用书页。允许白色界面卡片，避免每篇都用同一个图标。主体约占右侧可用区域80%，不能缩成小摆件。
裁切安全区：1600×900画布的中心1280×450区域保留主体，关键物件位于x=800–1440、y=225–675。上下只延伸渐变、光影和几何装饰，适配2.8:1及2.9:1横幅裁切。左侧与主体保持自然衔接，不画硬分割线。
${coverStyles[style]}
Wordless artwork only. No text, Chinese characters, letters, numbers, logos, watermark or fake writing. Cards and screens contain only geometric bars, circles and blocks, no labels. 标题由站点独立排版，绝对不要画字。
禁止：低饱和浅粉浅紫摄影棚、地面和地平线、手机产品摆拍、黏土玩具、软萌公仔、孤零零的小物件、杂乱场景。`;

}

/**
 * 作者自己写的「想要什么画面」。
 *
 * 它是增补，不是替换 —— 底图无字、左侧留白这些硬约束不能被用户输入顶掉。
 */
function userDirection(direction?: string) {
  const text = publicText(direction ?? "").trim();
  if (!text) return "";
  return `画面要求：${text.slice(0, 200)}\n`;
}

/**
 * image-01-live 专用底图提示词。
 *
 * 实测（同篇文章、同一段描述，两个模型各出一次）：
 *   - image-01 对长中文指令跟随得好：出「紫蓝渐变 + 2.5D 立体卡片」。
 *   - image-01-live 明显更弱：同一段中文提示词会跑成水墨山水或四格漫画，
 *     还自带假文字。
 *   - image-01-live 换成结构化英文 + 画风增强后最稳：
 *     紫蓝渐变铺满、3D 立体物件、零文字。
 * 所以 live 走独立的一套提示词，不复用中文长稿。
 */
export function coverPromptLive(
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  const scene = {
    ink: "On the right: large rounded 3D product UI elements — a chunky bar chart, stacked glass cards, connected flow nodes — arranged as one compact cluster.",
    minimal: "On the right: only a few simple rounded 3D blocks and one sphere, sparse minimal composition, lots of open space.",
    editorial: "On the right: a sculptural still life of soft matte blocks and one glossy sphere, natural window light, muted neutral backdrop.",
  }[style];
  /*
   * 内容也带上：只给标题的话，模型不知道该画图表还是画清单，
   * 出来的东西千篇一律。内容只当「画什么」的提示，不当指令。
   */
  const extra = userDirection(direction);
  return `Theme hint: ${publicText(title).slice(0, 60)}
Subject hint: ${publicText(content).slice(0, 160)}
${extra}3D glossy illustration on a smooth purple-to-blue gradient background that fills the entire frame, saturated and luminous.
${scene}
The left 40 percent of the frame stays a completely empty smooth gradient area, nothing in it.
Glossy plastic and frosted glass material, clean studio lighting, soft short shadows, premium product launch poster quality.
Plain solid shapes only, no text, no letters, no numbers, no labels, no screens, no logos, no watermark, no people, no scenery.`;
}

/**
 * 按模型选提示词。
 *
 * image-01-live 与 image-01 的指令遵循度差很多，提示词不能通用。
 */
export function coverPromptForModel(
  model: { modelKey: string } | null | undefined,
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  return model && isMiniMaxLiveModel(model)
    ? coverPromptLive(title, content, style, direction)
    : coverPrompt(title, content, style, direction);
}

export function imageRequest(
  model: ConfiguredModel,
  prompt: string,
  options?: { n?: number; style?: MinimaxStyle },
) {
  const protocol = imageProtocol(model);
  if (isMiniMaxTextModel(model))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "MiniMax M 系列用于对话与视觉理解，无法通过勾选能力变成生图模型；请添加 Image-01-Live（低延迟，支持画风增强）或 Image-01。",
    });
  if (!protocol)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "所选模型不支持当前图片生成接口，请选择已启用生图能力的 OpenAI 兼容或 MiniMax 模型。",
    });
  if (!model.provider.apiKey?.trim())
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "该模型的服务商尚未配置 API Key，请先到模型设置完善配置。",
    });
  const base = (
    model.provider.baseURL?.trim() ||
    (protocol === "minimax"
      ? "https://api.minimax.cn/v1"
      : "https://api.openai.com/v1")
  ).replace(/\/+$/, "");
  const endpoint = new URL(
    base +
      (protocol === "minimax" ? "/image_generation" : "/images/generations"),
  );
  if (
    !/^https?:$/.test(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password
  )
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "模型服务地址无效，请检查服务商配置。",
    });
  const body =
    protocol === "minimax"
      ? {
          model: model.modelKey,
          prompt: prompt.slice(0, 1500),
          /*
           * 只用 aspect_ratio：
           *   - width/height 只有 image-01 认，image-01-live 会静默忽略，
           *     所以这里永远不发自定义尺寸，别指望改它能生效；
           *   - 21:9 只有 image-01 支持，live 不认 —— 博客封面统一 16:9。
           */
          aspect_ratio: "16:9",
          n: Math.max(1, Math.min(9, options?.n ?? 1)),
          response_format: "url",
          // 提示词里带「绝对不要画字」这类硬约束，优化器改写会把约束丢掉。
          prompt_optimizer: false,
          // 画风增强只有 image-01-live 认：image-01 传 style 会报参数异常。
          ...(isMiniMaxLiveModel(model) && options?.style
            ? { style: options.style }
            : {}),
        }
      : {
          model: model.modelKey,
          prompt,
          // OpenAI 兼容接口一次只出一张（dall-e-3 / gpt-image-1 也只收 n=1），
          // 多候选是 live 的能力，不往这边带。
          n: 1,
          ...(/^dall-e-2$/.test(model.modelKey)
            ? { size: "1024x1024", response_format: "b64_json" }
            : /^dall-e-3$/.test(model.modelKey)
              ? { size: "1792x1024", response_format: "b64_json" }
              : /^gpt-image/.test(model.modelKey)
                ? { size: "1536x1024" }
                : { size: "1536x1024", response_format: "b64_json" }),
        };
  return {
    url: endpoint.href,
    body,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + model.provider.apiKey,
    },
  };
}
export function publicImageIP(address: string) {
  if (isIP(address) === 6) return /^[23][0-9a-f]{0,3}:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
async function checkedImageURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("图片地址无效");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicImageIP(a.address)))
    throw new Error("图片地址不可访问");
  return url;
}
async function limitedBytes(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new Error("图片或响应超过大小限制");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("未收到图片");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error("图片或响应超过大小限制");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
/**
 * 调生图接口，取回若干张图。
 *
 * 一次请求可以要多张（MiniMax 的 n）：image-01-live 够快，
 * 一次出 3 张几乎不增加等待，作者还能挑构图更合适的那张。
 */
export async function generateImageBuffers(
  model: ConfiguredModel,
  prompt: string,
  fetcher: typeof fetch = fetch,
  options?: { n?: number; style?: MinimaxStyle },
) {
  const request = imageRequest(model, prompt, options);
  let response: Response;
  try {
    response = await fetcher(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(180000),
      redirect: "error",
    });
  } catch {
    throw new TRPCError({
      code: "TIMEOUT",
      message: "图片生成连接失败或超时，请检查服务地址后重试。",
    });
  }
  if (!response.ok)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        response.status === 401 || response.status === 403
          ? "图片服务鉴权失败，请检查 API Key 与生图权限。"
          : response.status === 429
            ? "图片服务限流或余额不足，请稍后重试。"
            : `图片服务返回错误（${response.status}），请检查所选模型与生图接口是否匹配。`,
    });
  const json = JSON.parse(
    (await limitedBytes(response, 30 * 1024 * 1024)).toString(),
  ) as any;
  if (json.base_resp?.status_code)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "图片服务未成功生成图片，请检查账户权限、额度或调整提示词。",
    });
  // 三种返回形状都见过：data 数组、image_base64 数组、image_urls 数组。
  const items: { b64?: unknown; url?: unknown }[] = [];
  if (Array.isArray(json.data))
    items.push(...json.data.map((item: any) => ({ b64: item?.b64_json, url: item?.url })));
  else if (Array.isArray(json.data?.image_base64))
    items.push(...json.data.image_base64.map((b64: unknown) => ({ b64 })));
  else if (Array.isArray(json.data?.image_urls))
    items.push(...json.data.image_urls.map((url: unknown) => ({ url })));
  if (!items.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "模型没有返回图片，请调整描述或检查模型是否支持生图。",
    });
  const buffers: Buffer[] = [];
  for (const item of items) {
    const b64 = item.b64;
    let buffer: Buffer;
    if (typeof b64 === "string") {
      const raw = b64.replace(/^data:image\/[\w+.-]+;base64,/, "");
      if (raw.length > 28 * 1024 * 1024 || !/^[A-Za-z0-9+/=\s]+$/.test(raw))
        throw new Error("图片编码无效或过大");
      buffer = Buffer.from(raw, "base64");
    } else {
      const remote = item.url;
      if (typeof remote !== "string")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "模型没有返回图片，请调整描述或检查模型是否支持生图。",
        });
      let url = await checkedImageURL(remote);
      let imageResponse: Response | undefined;
      for (let i = 0; i < 4; i++) {
        imageResponse = await fetcher(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        });
        if (imageResponse.status >= 300 && imageResponse.status < 400) {
          const location = imageResponse.headers.get("location");
          await imageResponse.body?.cancel();
          if (!location || i === 3) throw new Error("图片下载重定向失败");
          url = await checkedImageURL(new URL(location, url).href);
          continue;
        }
        break;
      }
      if (!imageResponse?.ok) throw new Error("生成成功，但图片下载失败，请重试");
      buffer = await limitedBytes(imageResponse, 20 * 1024 * 1024);
    }
    // Decode actual pixels, reject markup, strip metadata, and persist a bounded image.
    buffers.push(
      await sharp(buffer, { limitInputPixels: 40000000, animated: false })
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 90 })
        .toBuffer(),
    );
  }
  return buffers;
}

/** 只要一张的场合（老调用方、测试注入）。 */
export async function generateImageBytes(
  model: ConfiguredModel,
  prompt: string,
  fetcher: typeof fetch = fetch,
  options?: { n?: number; style?: MinimaxStyle },
) {
  const buffers = await generateImageBuffers(model, prompt, fetcher, options);
  return buffers[0];
}

/**
 * 底图归一化：统一成 1600×900（16:9）。
 *
 * 模型不一定给 16:9（OpenAI 常用 1536×1024），这里按比例裁切而不是拉伸 ——
 * 拉伸会把插画压变形。所有展示位共用这一张源图。
 */
export async function normalizeCoverBase(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer, { limitInputPixels: 40000000 })
    .rotate()
    .resize(COVER_SOURCE.width, COVER_SOURCE.height, {
      fit: "cover",
      position: "centre",
    })
    .webp({ quality: 92 })
    .toBuffer();
}

/**
 * 封面提示词要用的文章上下文：标题 + 正文。
 *
 * 正文只取公开内容 —— 草稿里的私货不能进提示词（会跟着图片存进附件）。
 */
function coverContext(
  note: { content: string; metadata: any },
  publication: { title: string | null; content: string; revision: number },
) {
  const draftBody = readDraftBody(note.metadata, note.content);
  // For a live article, do not silently include later private-note additions.
  // Explicitly adopted publishing drafts and first-publication drafts are eligible.
  const content =
    draftBody.forked || publication.revision === 0
      ? draftBody.content
      : publication.content;
  const title = (note.metadata as any)?.title || publication.title || "文章封面";
  return { title, content };
}

export async function coverGenerationOptions(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  style: CoverStyle = "ink",
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    include: { publication: true },
  });
  if (!note?.publication)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章不存在，请先发布正文。",
    });
  const models = await db.aiModels.findMany({
    include: { provider: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  /*
   * image-01-live 排前面。
   *
   * 它比 image-01 快一半，还多一个画风增强参数，出图更稳 ——
   * 前端取第一个可用模型，所以顺序就是默认选择。
   */
  const ordered = [...models].sort(
    (a, b) =>
      Number(isMiniMaxLiveModel(b)) - Number(isMiniMaxLiveModel(a)),
  );
  const images = await db.attachments.findMany({
    where: {
      accountId,
      noteId,
      metadata: { path: ["blogAICover", "noteId"], equals: noteId },
    },
    orderBy: { id: "desc" },
    take: 20,
    select: { id: true, path: true, metadata: true },
  });
  const candidates = images
    .filter((image) => {
      const info = (image.metadata as any)?.blogAICover;
      return (
        info &&
        !info.sourceId &&
        info.sourceRevision === note.publication!.revision
      );
    })
    .slice(0, 6)
    .map((image) => ({
      id: image.id,
      path: image.path,
      revision: note.publication!.revision,
    }));
  const draftConfig = readDraftCoverConfig(note.metadata);
  const { title: coverTitle, content: coverContent } = coverContext(note, note.publication);
  const imageModels = ordered.filter((m) => (m.capabilities as any)?.imageGeneration);
  // 提示词跟着「将被选中的那个模型」走：live 与 image-01 的写法不通用。
  const preferred = imageModels.find(
    (m) => imageProtocol(m) && !!m.provider.apiKey?.trim(),
  );
  return {
    candidates,
    suggestedTitle: (
      note.publication.title ||
      publicText(note.publication.content).slice(0, 24)
    ).slice(0, 24),
    prompt: coverPromptForModel(preferred, coverTitle, coverContent, style),
    revision: note.publication.revision,
    /** 草稿里的封面配置：面板据此回填，改字不会重新生图。 */
    draftCover: draftConfig,
    models: imageModels.map((m) => ({
      id: m.id,
      title: m.title,
      providerTitle: m.provider.title,
      available: !!imageProtocol(m) && !!m.provider.apiKey?.trim(),
      reason: isMiniMaxTextModel(m)
        ? "这是对话模型；生图请添加 Image-01-Live"
        : !imageProtocol(m)
          ? "暂不支持该服务商的生图协议"
          : !m.provider.apiKey?.trim()
            ? "请配置 API Key"
            : "",
    })),
  };
}
const generating = new Set<number>();
export async function generateBlogCover(
  db: PrismaClient,
  accountId: number,
  input: {
    noteId: number;
    modelId: number;
    /** 作者写的「想要什么画面」；留空就按模型默认模板生成。 */
    direction?: string;
    style: CoverStyle;
    revision: number;
  },
  dependencies?: {
    generate?: typeof generateImageBytes;
    generateMany?: typeof generateImageBuffers;
    upload?: typeof FileService.uploadFile;
  },
) {
  if (generating.has(accountId))
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "已有封面正在生成，请等待完成后再试。",
    });
  generating.add(accountId);
  try {
    const options = await coverGenerationOptions(
      db,
      accountId,
      input.noteId,
      input.style,
    );
    if (options.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "公开文章已更新，请重新读取内容后生成封面。",
      });
    if (!options.models.some((m) => m.id === input.modelId && m.available))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "请选择已配置并支持生图的模型。",
      });
    const model = await db.aiModels.findUniqueOrThrow({
      where: { id: input.modelId },
      include: { provider: true },
    });
    /*
     * 提示词由服务端统一组装：模型决定写法（live 与 image-01 不通用），
     * 作者的「画面要求」只作增补，底图无字、左侧留白这些硬约束不被顶掉。
     */
    const source = await db.notes.findFirst({
      where: { id: input.noteId, accountId, isRecycle: false },
      include: { publication: true },
    });
    if (!source?.publication)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "文章不存在，请先发布正文。",
      });
    const context = coverContext(source, source.publication);
    const prompt = coverPromptForModel(
      model,
      context.title,
      context.content,
      input.style,
      input.direction,
    );
    const live = isMiniMaxLiveModel(model);
    const count = imageCandidateCount(model);
    const fetcher = await fetchWithProxy();
    const raws = dependencies?.generate
      ? [await dependencies.generate(model, prompt, fetcher)]
      : await (
          dependencies?.generateMany ||
          generateImageBuffers
        )(model, prompt, fetcher, {
          n: count,
          ...(live ? { style: minimaxStyleFor(input.style) } : {}),
        });
    // 底图统一成 1600×900：不拉伸，只按比例裁切。
    const upload = dependencies?.upload || ((args) => FileService.uploadFile(args));
    const uploaded: { id: number; path: string }[] = [];
    for (const raw of raws) {
      const image = await normalizeCoverBase(raw);
      const result = await upload({
        buffer: image,
        originalName: `ink-cover-base-${input.noteId}-${crypto.randomUUID()}.webp`,
        type: "image/webp",
        accountId,
        metadata: {
          blogAICover: {
            noteId: input.noteId,
            modelId: input.modelId,
            prompt,
            style: input.style,
            sourceRevision: input.revision,
            width: COVER_SOURCE.width,
            height: COVER_SOURCE.height,
          },
        },
      });
      const attachment = await db.attachments.findFirstOrThrow({
        where: { path: result.filePath, accountId },
      });
      await db.attachments.update({
        where: { id: attachment.id },
        data: { noteId: input.noteId },
      });
      uploaded.push({ id: attachment.id, path: attachment.path });
    }
    if (!uploaded.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "模型没有返回图片，请调整描述或检查模型是否支持生图。",
      });
    // Recheck ownership after a slow provider call. Never select/publish automatically.
    const note = await db.notes.findFirst({
      where: { id: input.noteId, accountId, isRecycle: false },
      select: { id: true },
    });
    if (!note)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "文章已删除，生成图片已保存在资源库。",
      });
    return {
      id: uploaded[0].id,
      path: uploaded[0].path,
      revision: input.revision,
      /** 本次一起出图的候选底图：作者挑一张，别的留在附件里。 */
      candidates: uploaded,
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "封面生成或保存失败，请检查模型与存储配置后重试。",
    });
  } finally {
    generating.delete(accountId);
  }
}

/**
 * 把底图与文字配置应用到「发布草稿」。
 *
 * 只动草稿：draftCoverAttachmentId 指向底图，文字配置写进 notes.metadata。
 * 公开快照（coverAttachmentId / coverConfig）一概不动 ——
 * 要等作者点「更新发布」，底图和文字才一起进公开版本。
 */
export async function applyCoverToDraft(
  db: PrismaClient,
  accountId: number,
  input: {
    noteId: number;
    attachmentId?: number;
    /** 刚上传的底图（还没挂到笔记上）：按路径认领。 */
    path?: string;
    config: CoverTextConfig & { focus?: unknown };
    expectedRevision?: number;
  },
) {
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    include: { publication: true },
  });
  if (!note?.publication)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "文章不存在，请先发布正文。",
    });
  const image = input.attachmentId
    ? await db.attachments.findFirst({
        where: { id: input.attachmentId, accountId },
      })
    : input.path
      ? await db.attachments.findFirst({
          where: { path: input.path, accountId },
        })
      : null;
  if (!image)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "底图不存在或不属于此账号。",
    });
  if (!/^image\/(?:png|jpeg|webp|gif|avif)$/.test(image.type))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "底图必须是 PNG、JPEG、WebP、GIF 或 AVIF 图片。",
    });
  if (Number(image.size) > 10 * 1024 * 1024)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "底图不能超过 10MB。",
    });
  const config: CoverConfig = normalizeCoverConfig({
    ...normalizeCoverTextConfig(input.config),
    focus: input.config?.focus ?? null,
  });
  // 换底图 = 之前的裁切位置对不上，重置回居中。
  if (config.focus) config.focus.sourceId = image.id;
  await db.notes.update({
    where: { id: note.id },
    data: {
      metadata: writeDraftCoverConfig(note.metadata, config) as unknown as Prisma.InputJsonValue,
    },
  });
  const attached = await attachBlogCover(
    db,
    accountId,
    input.noteId,
    image.path,
    input.expectedRevision,
  );
  return {
    noteId: input.noteId,
    config,
    ...attached,
  };
}

/**
 * 导出当前封面（按场景比例合成一张整图）。
 *
 * 用的是同一套排版规则：页面上的文字层和这里的文字层来自同一个
 * shared/lib/blogCoverText.ts，导出的图和线上看到的一致。
 */
export async function exportCoverImage(
  db: PrismaClient,
  accountId: number,
  input: {
    noteId: number;
    placement: CoverSceneKey;
    width: number;
    height: number;
    config?: CoverTextConfig;
    focus?: CoverFocusValue | null;
  },
) {
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    include: { publication: { include: { coverAttachment: true } } },
  });
  const attachmentId =
    note?.publication?.draftCoverAttachmentId ??
    note?.publication?.coverAttachmentId ??
    null;
  if (!note?.publication || !attachmentId)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "这篇文章还没有封面。",
    });
  const attachment = await db.attachments.findFirst({
    where: { id: attachmentId, accountId },
  });
  if (!attachment)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "封面文件不存在。",
    });
  const config = normalizeCoverTextConfig(
    input.config ?? readDraftCoverConfig(note.metadata) ?? {},
  );
  const original = await FileService.getFileBuffer(attachment.path);
  const cropped = await cropCoverToRatio(original, {
    width: input.width,
    height: input.height,
    focus: input.focus ?? null,
  });
  const layout = computeCoverTextLayout({
    containerWidth: input.width,
    containerHeight: input.height,
    placement: input.placement,
    title: config.title,
    subtitle: config.subtitle,
    align: config.align,
    sizeScale: config.sizeScale,
  });
  const buffer =
    config.mode === "overlay" && config.title.trim()
      ? await composeCoverImage({
          base: cropped,
          layout,
          canvasWidth: input.width,
          canvasHeight: input.height,
          palette: config.palette,
          align: config.align,
        })
      : await sharp(cropped)
          .webp({ quality: 92 })
          .toBuffer();
  const slug =
    (note.publication.title || `cover-${input.noteId}`)
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `cover-${input.noteId}`;
  return {
    name: `${slug}-${input.placement}.webp`,
    mime: "image/webp",
    dataURL: "data:image/webp;base64," + buffer.toString("base64"),
  };
}

/**
 * 按目标比例裁切，裁切位置与页面上 object-position 的百分比一致。
 *
 * 页面是 CSS 裁的，服务端要出分享图就得用同一套算法裁一遍，
 * 否则分享图和页面看到的不是同一个构图。
 */
export async function cropCoverToRatio(
  buffer: Buffer,
  {
    width,
    height,
    focus,
  }: { width: number; height: number; focus?: CoverFocusValue | null },
) {
  const oriented = await sharp(buffer, { limitInputPixels: 40000000 })
    .rotate()
    .toBuffer();
  const { width: sourceWidth, height: sourceHeight } =
    await sharp(oriented).metadata();
  if (!sourceWidth || !sourceHeight) throw new Error("图片无效");
  const targetRatio = width / height;
  const sourceRatio = sourceWidth / sourceHeight;
  const w = Math.max(
    1,
    Math.round(sourceRatio > targetRatio ? sourceHeight * targetRatio : sourceWidth),
  );
  const h = Math.max(1, Math.round(w / targetRatio));
  const x = Math.min(100, Math.max(0, focus?.x ?? 50));
  const y = Math.min(100, Math.max(0, focus?.y ?? 50));
  const left = Math.round(((sourceWidth - w) * x) / 100);
  const top = Math.round(((sourceHeight - h) * y) / 100);
  return sharp(oriented)
    .extract({
      left: Math.max(0, Math.min(left, sourceWidth - w)),
      top: Math.max(0, Math.min(top, sourceHeight - h)),
      width: w,
      height: h,
    })
    .resize(width, height)
    .toBuffer();
}

