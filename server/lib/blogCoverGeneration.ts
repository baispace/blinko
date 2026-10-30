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
import { generateGuardedCoverBase } from "./coverCompositionGuard";

import { coverArtPlan, preferCoverModels, COVER_ART_VERSION } from "../../shared/lib/blogCoverArt";

export type CoverStyle = "ink";
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

/** Provider-specific capabilities remain in the adapter, not the visual brief. */
export function isMiniMaxLiveModel(model: { modelKey: string }) {
  return /^image-01-live$/i.test(model.modelKey.trim());
}
export type MinimaxStyle = { style_type: "漫画" | "元气" | "中世纪" | "水彩"; style_weight: number };

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
 * 生图提示词的长度上限。
 *
 * MiniMax 的生图接口按 1500 字符截断 —— 超了不是报错，是悄悄丢掉尾部。
 * 尾部恰好是「无文字 / 无地面 / 不要低饱和粉紫摄影棚」这些硬约束，
 * 丢了就等于白写。所以提示词按预算拼装，不是拼完再祈祷它够短。
 */
export const COVER_PROMPT_LIMIT = 1500;

/** Same visual contract for every model. Keep the complete brief below MiniMax's limit. */
export function coverPrompt(
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  const cleanTitle = publicText(title).replace(/\s+/g, " ").slice(0, 80);
  const cleanContent = publicText(content).replace(/\s+/g, " ");
  const plan = coverArtPlan(cleanTitle, cleanContent, style);
  const extra = publicText(direction || "").replace(/\s+/g, " ").slice(0, 100);

  /*
   * 提示词按优先级分块，超预算时从最不重要的块开始让位：
   *   1. 风格契约（构图、画法、配色、主体、材质、画幅）—— 永远完整；
   *   2. 主题参考（标题）—— 永远完整，主题词库主要靠它命中；
   *   3. 内容参考（正文摘要）—— 先让位，标题的权重本就是正文的五倍；
   *   4. 作者的画面要求 —— 最后让位，按剩余字符截短。
   * 硬约束尾巴任何情况下都不动。
   *
   * 构图规则写在契约的**最前面**、并在收尾再重申一次：实测同一条规则放在
   * 契约中段时构图合格率只有 1/3，提到最前面并收尾重申后是 3/3，
   * 主体水平中心从 58% 推到 74%（详见 shared/lib/blogCoverArt.ts）。
   */
  const contract = `${plan.composition}
${plan.treatment}
Palette: ${plan.palette} — the backdrop uses exactly this gradient, deep and rich; background panels barely visible.
Subject: ${plan.subject}.
Matte premium materials, not plastic: no neon halos, no candy saturation, no lens flare, no heavy blur. Surfaces solid white and pale grey-blue; glyphs flat 2D line-art marks; one vivid accent only; no duplicate copies.
16:9 illustration asset, 1600x900, used as the full cover background with the title printed on the empty left part.
${plan.compositionReminder}`;

  // 硬约束尾巴：任何情况下都不能被截断。
  const tail = `No text, letters, numbers, logos, watermark or fake writing. UI content is geometric bars and blocks only. No floor, tabletop, pedestal, platform, circular hub, room, miniature scene. 禁止：低饱和粉紫摄影棚。`;

  const titleLine = `主题参考：${cleanTitle}`;
  const contentLine = `内容参考：${cleanContent.slice(0, 48)}`;
  const detailLabel = "Optional detail: ";
  const budget = COVER_PROMPT_LIMIT - tail.length - 1;

  // 依次尝试：带正文 → 不带正文 → 只留风格契约。主题命中主要靠标题，
  // 而「Subject」那一行已经把主题写进提示词了，所以最后一步也还能用。
  let fixed = [`[${COVER_ART_VERSION}]`, titleLine, contentLine, contract].join("\n");
  if (fixed.length > budget)
    fixed = [`[${COVER_ART_VERSION}]`, titleLine, contract].join("\n");
  if (fixed.length > budget)
    fixed = [`[${COVER_ART_VERSION}]`, contract].join("\n");

  const room = budget - fixed.length - detailLabel.length - 1;
  const detail =
    extra && room > 0 ? `\n${detailLabel}${extra.slice(0, room)}` : "";
  return `${fixed}${detail}\n${tail}`;
}

// Keep existing callers on the same design contract; no model-specific scene replacement.
export function coverPromptForModel(
  _model: { modelKey: string } | null | undefined,
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  return coverPrompt(title, content, style, direction);
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
        "MiniMax M 系列用于对话与视觉理解，无法通过勾选能力变成生图模型；请添加 Image-01 或 Image-01-Live。",
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
          // This workflow intentionally requests one candidate to bound cost.
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
 * The provider adapter supports n; the cover workflow defaults to one image.
 * Historical candidates stay available without being selected automatically.
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
  const ordered = preferCoverModels(models);
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
  // Report the actual default model alongside the shared visual brief.
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
    artPlan: coverArtPlan(publicText(coverTitle), publicText(coverContent), style),
    modelTitle: preferred?.title || "",
    modelKey: preferred?.modelKey || "",
    candidateCount: 1,
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
     * 服务端统一组装视觉模板和主题方案，不额外调用文本模型。
     * 作者的画面要求只作增补，不替换无字和安全区约束。
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
    const artPlan = coverArtPlan(publicText(context.title), publicText(context.content), input.style);
    const fetcher = await fetchWithProxy();
    /*
     * 构图护栏：底图的插画必须待在右半区，左边才有干净的底色给标题。
     *
     * 提示词里已经反复强调「主体推到右边缘」，但生图模型并不总是听话 ——
     * 同一句提示词的构图合格率只有四成上下，剩下的整幅铺满之后插画就压到
     * 标题底下，看起来「图偏中间」。所以生完立刻量一次主体位置，
     * 不合格就换一张重来，试满上限取最好的那张。
     */
    const generateOnce = async (): Promise<Buffer[]> => {
      const single = dependencies?.generate;
      if (single) return [await single(model, prompt, fetcher)];
      const many = dependencies?.generateMany || generateImageBuffers;
      return many(model, prompt, fetcher, {
        n: 1,
      });
    };
    const guarded = await generateGuardedCoverBase({ attempt: generateOnce });
    const raws = guarded ? [guarded.buffer] : [];
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
            artVersion: COVER_ART_VERSION,
            artPlan,
            style: input.style,
            sourceRevision: input.revision,
            width: COVER_SOURCE.width,
            height: COVER_SOURCE.height,
            /** 构图体检结果：主体落在画面哪里、试了几次才抽到。 */
            composition: guarded?.composition,
            compositionAttempts: guarded?.attempts,
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
      coverPalette: artPlan.overlayPalette,
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
          base: original,
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

