import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { resolveStaticPublicDir } from "./cdnStaticDir";
import { renderCoverLine } from "./coverTextRaster";
import { coverGenerationJobs as generating } from './coverGenerationLock';
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
import { providerDefaultBaseURL } from "@shared/lib/providerDefaults";
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

import {
  coverArtPlan,
  preferCoverModels,
  COVER_ART_VERSION,
  COVER_ILLUSTRATION_COMPOSITION,
  COVER_ILLUSTRATION_COMPOSITION_REMINDER,
  COVER_ILLUSTRATION_TEXT_RULE,
  COVER_ILLUSTRATION_TREATMENT,
} from "../../shared/lib/blogCoverArt";

export type CoverStyle = "ink";

/**
 * 封面产物的两种形态。
 *
 *   icon-tile    —— 博客文章封面：模型只出一枚图标砖，渐变背景、大字、
 *                   方砖位置全由程序排（shared/lib/blogCoverText.ts）。
 *                   与站内参考封面 approved-layout.png 一致。
 *   illustration —— 独立配图（笔记配图、专题封面）：要的是一张能自己看的图，
 *                   以整幅图片的形式出现，没有文字层可叠。
 *
 * 两种形态都不让模型写字：生图模型写不对中文，烤进图里的字永远是乱的。
 */
export type CoverArtifact = "icon-tile" | "illustration";

/**
 * 入口与产物的对应关系只在这里定一次。
 *
 * 之前三条生图入口各写各的提示词与后处理，同一个「封面」在站内能有三种长相；
 * 现在入口只负责说清自己要什么产物，形态与提示词由这张表统一决定。
 */
export function coverArtifactFor(entry: "article" | "asset"): CoverArtifact {
  return "illustration";
}
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
export function isMiniMaxH3(model: { modelKey: string }) {
  return /^MiniMax-H3-Image(?:-Highspeed)?$/i.test(model.modelKey.trim());
}
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
    provider === "minimax" ||
    provider === "minimax-cn"
  )
    return "minimax";
  if (
    model.config?.imageGenerationProtocol === "openai" ||
    ["openai", "custom"].includes(provider)
  )
    return "openai";
  return null;
}

/** Keep the complete cover brief within the provider prompt limit. */
export const COVER_PROMPT_LIMIT = 1500;

export function coverPrompt(
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
) {
  const theme = publicText(title).replace(/\s+/g, " ").slice(0, 80);
  const context = publicText(content).replace(/\s+/g, " ").slice(0, 120);
  const plan = coverArtPlan(theme, context, style);
  const detail = publicText(direction || "").replace(/图片必须准确显示标题「[^」]*」/g, "").replace(/不添加任何文字/g, "").slice(0, 200);
  const subject = /复盘|总结/.test(theme) ? "白色复盘清单、一支铅笔和一张半透明图表卡片"
    : /工作流|效率|任务/.test(theme) ? "白色任务清单、蓝色勾选方块和少量彩色状态圆点"
    : /AI|工具/.test(theme) ? "三张相互靠近的圆角工具卡片，分别带有对话气泡、代码括号和星芒符号"
    : "白色圆角产品界面、蓝色功能卡片和一个鼠标指针";
  return [
    "Professional SaaS product blog cover, wide horizontal layout.",
    `Theme: ${theme}. A LARGE close-up 3D cluster in the CENTER-RIGHT, with its left edge at 45 percent of canvas width: ${subject}.`,
    "Fill 75 percent of image height and 50 percent of canvas width. Keep the cluster close to the headline zone, never at the far-right corner. Front view with slight perspective. One cohesive large cluster, not distant tiny objects. Keep important details vertically centered.",
    `The LEFT 38 percent is a clean medium-to-deep color gradient reserved for a headline. Palette: ${plan.palette}, white and one accent color.`,
    "Matte frosted materials, shallow extruded thickness, rounded corners and soft ambient shadows. Premium modern software launch graphic. Flat seamless background, no floor, no horizon.",
    "No text, words, letters, numbers, typography, logos or watermarks anywhere. No people, flowers, plants, desk props or scattered decorations.",
    `Additional visual direction: ${detail}`,
  ].join("\n").slice(0, COVER_PROMPT_LIMIT);
}

// Keep existing callers on the same design contract; no model-specific scene replacement.


/**
 * 插画底图提示词：只出画，不出字。
 *
 * 笔记配图与专题封面要的是一张能独立看的图，所以走这一条；
 * 博客封面走上面的图标砖提示词（程序负责背景与大字）。
 *
 * 标题一律由系统排版 —— 生图模型写不对中文，烤进图里的字永远是乱的，
 * 作者还改不掉。构图同样有硬要求：一个主体、留白、别堆东西。
 */
export function coverIllustrationPrompt(
  title: string,
  content: string,
  direction?: string,
) {
  const cleanTitle = publicText(title).replace(/\s+/g, " ").slice(0, 80);
  const cleanContent = publicText(content).replace(/\s+/g, " ").slice(0, 160);
  const extra = publicText(direction || "").replace(/\s+/g, " ").slice(0, 300);
  const plan = coverArtPlan(cleanTitle, cleanContent);
  const prompt = [
    COVER_ILLUSTRATION_COMPOSITION,
    /*
     * 主题与参考只给模型「懂画面」，所以明确写了「不要写进画面」——
     * 中文主题摆在提示词里，模型很容易顺手把它当成标题画上去。
     */
    `Subject theme (understand it only — NEVER draw these characters in the picture): ${cleanTitle}`,
    `Scene reference (read it only — do not render any of it as text): ${cleanContent}`,
    COVER_ILLUSTRATION_TREATMENT,
    `主体：${plan.subject}`,
    `配色：${plan.palette}`,
    COVER_ILLUSTRATION_TEXT_RULE,
    `作者补充要求（只描述画面，不要指定要出现在图上的文字）：${extra || "无额外要求，按上面的构图完成这一张底图。"}`,
    COVER_ILLUSTRATION_COMPOSITION_REMINDER,
  ].join("\n");
  return prompt.slice(0, COVER_PROMPT_LIMIT);
}

export function coverPromptForModel(
  _model: { modelKey: string } | null | undefined,
  title: string,
  content: string,
  style: CoverStyle = "ink",
  direction?: string,
  recentPrompts: string[] = [],
) {
  if (_model && isMiniMaxH3(_model)) {
    const plan = coverArtPlan(publicText(title), publicText(content), style);
    const iconFamilies = [
      {match: /推荐|搜索|召回|排序/, icons: ["三个相连的节点组成的推荐路径符号", "叠放卡片与一颗星组成的精选符号", "靶心与短箭头组成的匹配符号", "小巧指南针符号"]},
      {match: /阅读|读书|书籍|笔记/, icons: ["一本微微展开的书", "书页与书签组成的符号", "笔尖与一张便笺组成的符号", "叠放的两本书"]},
      {match: /复盘|总结|分析|数据|指标/, icons: ["圆环图与一小段上升曲线", "带有勾选标记的复盘清单", "三个高低不同的圆角柱形", "循环箭头围绕一颗小圆点"]},
      {match: /AI|智能|模型|工具/i, icons: ["简洁友好的机器人头像", "对话气泡中的一颗星芒", "三个连接节点组成的智能网络", "一枚精致的芯片"]},
      {match: /工作流|效率|任务|流程/, icons: ["三个相连的流程方块", "圆形进度环中的勾选符号", "闪电与短箭头组成的效率符号", "带有两个勾选标记的清单"]},
      {match: /产品|需求|设计|方案/, icons: ["两块相互扣合的拼图", "一枚简洁的立体灯泡", "叠放的原型界面卡片", "由三个模块构成的产品立方体"]},
      {match: /技术|代码|开发|架构|编程/, icons: ["立体代码括号", "相连的三个架构模块", "终端窗口中的提示符", "一枚精致齿轮"]},
    ];
    const family = iconFamilies.find(item => item.match.test(publicText(title)))
      ?? iconFamilies.find(item => item.match.test(publicText(content)));
    const candidates = family?.icons ?? [plan.subject];
    const usage = (value: string) => recentPrompts.reduce((count, prompt, index) => count + (prompt.includes(value) ? 1 + (recentPrompts.length - index) / recentPrompts.length : 0), 0);
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const symbol = shuffled.sort((a, b) => usage(a) - usage(b))[0];
    const colors = [plan.palette, "柔和靛蓝与浅蓝", "青绿色与薄荷色", "暖橙色与杏色", "蓝紫色与淡紫", "石墨灰与银灰"];
    const palette = [...colors].sort(() => Math.random() - 0.5).sort((a, b) => usage(a) - usage(b))[0];

    return `参考图片的固定版式设计横向博客封面。主题为${publicText(title).slice(0,80)}。${direction || "不添加任何文字"}。背景为${palette}同色系轻渐变，左右亮度接近，禁止大幅明暗渐变。中央一枚完整的圆角正方形应用图标，图标外框宽度占16:9原图约20%至22%，高度约36%至39%。裁切为宽幅卡片后，图标约占可见封面高度55%至60%，上下留白均衡。不要缩成小徽章。图标内部主题符号宽高占面板约65%至75%，内边距紧凑，不要用大面积空白包裹小符号。内部用一个与主题有关的清晰符号，本次选定的中央符号为${symbol}。作者明确指定图标时优先采用作者要求。参考图只提供版式与材质，禁止照搬参考图的放大镜。每次只画一个清晰的主题符号，允许简单浮雕、少量双色和相关物件组合，不增加外围装饰。图标材质为细腻缎面搪瓷，轻微厚度、窄薄倒角、柔和短阴影，表面平整，只保留微弱曲面反射，不要鼓包或厚重玩具感。图标与背景同色系，颜色略深或略浅，亮度差适中，避免近黑色面板。内部符号清晰。若要求标题，字体严格参考最后一张参考图的大字排版：超粗黑体、粗壮笔画、字面宽大饱满、字距紧凑，无衬线。全部文字横贯一行，占画面宽度约75%至80%，字高占16:9原图高度约25%至27%，裁成宽幅卡片后约占可见高度40%至43%，上下留白均衡。文字位于中央图标后方，允许中间部分自然遮挡，禁止为了躲开图标把字分散到两侧。文字为同色系浅色，约40%白色透明度，平面填色，没有描边、阴影或立体厚度。最后一张参考图只参考字体大小、字重与排列，不照搬其颜色、JPEG文字和文件格式符号。参考图中的主题文字和放大镜应替换为本次要求。若要求无字则移除所有文字。所有元素沿垂直中线居中，四周留白。只包含背景、中央图标和指定文字。不要额外文字、英文、水印、摄影、人物、花鸟或零散装饰。`;
  }
  return coverPrompt(title, content, style, direction);
}

export function imageRequest(
  model: ConfiguredModel,
  prompt: string,
  options?: { n?: number; style?: MinimaxStyle; referenceImages?: string[] },
) {
  const protocol = imageProtocol(model);
  const h3 = /^MiniMax-H3-Image(?:-Highspeed)?$/i.test(model.modelKey.trim());
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
  // 国内站与国际站的域名完全不同，兜底地址必须按服务商类型区分，
  // 否则 baseURL 没配时会打到旧域名 api.minimax.cn 上
  const minimaxFallbackBase =
    providerDefaultBaseURL(model.provider.provider) ?? providerDefaultBaseURL('minimax')!;
  const base = (
    model.provider.baseURL?.trim() ||
    (protocol === "minimax"
      ? minimaxFallbackBase
      : "https://api.openai.com/v1")
  ).replace(/\/+$/, "");
  const endpoint = new URL(
    base +
      (h3 && options?.referenceImages?.length ? "/images/edits" : protocol === "minimax" && !h3 ? "/image_generation" : "/images/generations"),
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
  const body = h3 ? {
    model: model.modelKey,
    prompt,
    aspect_ratio: "16:9",
    area: "1K",
    n: 1,
    response_format: "url",
    ...(!options?.referenceImages?.length ? {disable_prompt_enhanced: true} : {images: options.referenceImages.map(image_url => ({image_url}))}),
  } : protocol === "minimax"
      ? {
          model: model.modelKey,
          prompt: prompt.slice(0, 1500),
          // Request a landscape composition for the complete cover.
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
                : { size: "1024x1024", response_format: "b64_json" }),
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
  options?: { n?: number; style?: MinimaxStyle; referenceImages?: string[] },
) {
  const request = imageRequest(model, prompt, options);
  let response: Response;
  try {
    response = await fetcher(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(/^MiniMax-H3-Image/i.test(model.modelKey) ? 600000 : 180000),
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
  options?: { n?: number; style?: MinimaxStyle; referenceImages?: string[] },
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

/** Final image contains both artwork and deterministic typography. */
export async function finishGeneratedCover(raw: Buffer, direction?: string) {
  const base = await normalizeCoverBase(raw);
  const title = direction?.match(/图片必须准确显示标题「([^」]+)」/)?.[1]?.trim();
  if (!title) return base;
  const characters = Array.from(title);
  const split = Math.ceil(characters.length / 2);
  const lines = characters.length > 3
    ? [characters.slice(0, split).join(""), characters.slice(split).join("")]
    : [title];
  const size = Math.min(170, Math.floor(480 / Math.max(...lines.map(line => Array.from(line).length))));
  const rendered = await Promise.all(lines.map(text => renderCoverLine({text, size, color: "#ffffff", weight: "black", tracking: -0.02})));
  const height = rendered.reduce((sum, line) => sum + line.height, 0);
  let top = Math.round((900 - height) / 2);
  const overlays = rendered.map(line => {
    const overlay = {input: line.buffer, left: 220, top};
    top += line.height;
    return overlay;
  });
  return sharp(base).composite(overlays).webp({quality: 92}).toBuffer();
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

export async function recentCoverPrompts(db: PrismaClient, accountId: number) {
  const images = await db.attachments.findMany({where: {accountId, OR: [
    {metadata: {path: ["blogAICover", "assetKind"], equals: "complete-cover"}},
    {metadata: {path: ["aiCover", "assetKind"], equals: "complete-cover"}},
  ]}, orderBy: {id: "desc"}, take: 200, select: {metadata: true}});
  return images.map(image => {
    const metadata = image.metadata as any;
    return metadata?.blogAICover?.prompt ?? metadata?.aiCover?.prompt ?? "";
  }).filter((prompt): prompt is string => typeof prompt === "string" && !!prompt);
}

export async function coverReferenceImages(db: PrismaClient, accountId: number, model: {modelKey:string}, attachmentId?: number) {
  if (!isMiniMaxH3(model)) return undefined;
  const typographyPaths = [
    path.join(resolveStaticPublicDir() || "", "cover-reference/centered-typography.webp"),
    path.resolve(import.meta.dir, "../../app/public/cover-reference/centered-typography.webp"),
    path.resolve(process.cwd(), "../app/public/cover-reference/centered-typography.webp"),
  ];
  const typographyPath = typographyPaths.find(file => existsSync(file));
  const typography = typographyPath ? ["data:image/webp;base64," + readFileSync(typographyPath).toString("base64")] : [];

  if (!attachmentId) {
    const candidates = [
      path.join(resolveStaticPublicDir() || "", "cover-reference/centered-cover.webp"),
      path.resolve(import.meta.dir, "../../app/public/cover-reference/centered-cover.webp"),
      path.resolve(process.cwd(), "../app/public/cover-reference/centered-cover.webp"),
    ];
    const reference = candidates.find(file => existsSync(file));
    return reference ? ["data:image/webp;base64," + readFileSync(reference).toString("base64"), ...typography] : typography.length ? typography : undefined;
  }
  const image = await db.attachments.findFirst({where: {id: attachmentId, accountId}});
  if (!image || !/^image\/(png|jpeg|webp|avif)$/.test(image.type)) {
    throw new TRPCError({code: "BAD_REQUEST", message: "参考封面不存在或无权访问。"});
  }
  const bytes = await FileService.getFileBuffer(image.path);
  const normalized = await sharp(bytes).rotate().resize({width:1600,height:1600,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer();
  return ["data:image/webp;base64," + normalized.toString("base64"), ...typography];
}

export async function generateBlogCover(
  db: PrismaClient,
  accountId: number,
  input: {
    noteId: number;
    modelId: number;
    referenceAttachmentId?: number;
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
    /*
     * 形态决定提示词，也决定后处理 ——
     * 一个入口只有一条路：图标砖走抠图 + 完整性检查，插画走整幅归一化。
     */
    const history = isMiniMaxH3(model) ? await recentCoverPrompts(db, accountId) : [];
    const prompt = coverPromptForModel(model, context.title, context.content, input.style, input.direction, history);
    const artPlan = coverArtPlan(publicText(context.title), publicText(context.content), input.style);
    const referenceImages = await coverReferenceImages(db, accountId, model, input.referenceAttachmentId);
    const fetcher = await fetchWithProxy();
    // Generate the complete composition once; preserve its pixels and typography.
    const generateOnce = async (): Promise<Buffer[]> => {
      const single = dependencies?.generate;
      if (single) return [await single(model, prompt, fetcher)];
      const many = dependencies?.generateMany || generateImageBuffers;
      return many(model, prompt, fetcher, {
        n: 1,
        referenceImages,
      });
    };
    const raw = (await generateOnce())[0];
    if (!raw)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "模型没有返回图片，请调整描述或检查模型是否支持生图。",
      });
    // Save the finished editorial cover as one image.
    const upload = dependencies?.upload || ((args) => FileService.uploadFile(args));
    const image = isMiniMaxH3(model) ? await normalizeCoverBase(raw) : await finishGeneratedCover(raw, input.direction);
    const generationMode = "ai" as const;
    const dimensions = await sharp(image).metadata();
    const result = await upload({
      buffer: image,
      originalName: `ink-cover-icon-${input.noteId}-${crypto.randomUUID()}.webp`,
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
          width: dimensions.width,
          height: dimensions.height,
          assetKind: "complete-cover",
          generationMode,
          composition: null,
          compositionAttempts: 1,
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
    const uploaded = [{ id: attachment.id, path: attachment.path }];
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
      /* 形态决定前端怎么摆：图标砖压标题中间，插画整幅铺满。 */
      artwork: "image" as const,
      generationMode,
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
  const kind = (image.metadata as any)?.blogAICover?.assetKind ?? (image.metadata as any)?.aiCover?.assetKind;
  if (kind === "complete-cover") { config.mode = "full"; config.artwork = "image"; }
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
  const kind = (attachment.metadata as any)?.blogAICover?.assetKind ?? (attachment.metadata as any)?.aiCover?.assetKind;
  if (kind === "complete-cover") { config.mode = "full"; config.artwork = "image"; }
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
    (config.mode === "overlay" && config.title.trim()) || config.artwork === "icon" || config.artwork === "tile"
      ? await composeCoverImage({
          base: original,
          layout,
          // 新版式（图标砖）要的是原始文案，不是排好版的行。
          title: config.mode === "overlay" ? config.title : "",
          subtitle: config.subtitle,
          sizeScale: config.sizeScale,
          artwork: config.artwork,
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

