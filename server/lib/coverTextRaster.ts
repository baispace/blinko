import { parse, type Font } from "opentype.js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { resolveStaticPublicDir } from "./cdnStaticDir";

/**
 * 服务端渲染封面文字层。
 *
 * 为什么不用 sharp 自带的文字渲染（sharp → Pango → fontconfig）：
 *   - fontconfig 依赖系统配置，精简版 Linux 镜像上常常没有；
 *     这时 Pango 拿不到 fontfile，会**静默**改用系统兜底字体，
 *     导出的分享图和页面上的字完全不是一回事（字重差一档，字形也不同）。
 *   - 可变字体的字重在 Pango 里也选不准。
 *
 * 所以这里绕开 Pango：直接用 opentype.js 读字库取字形轮廓，
 * 转成 SVG 路径再交给 sharp 栅格化。路径里没有文字，
 * librsvg 不需要 fontconfig，渲染结果只取决于那份字体文件 ——
 * 和浏览器加载同一份 @font-face 得到的是同一批字形。
 */

export type CoverFontWeight = "black" | "medium";

/** 封面字库路径：标题 Black，副标题 Medium，与页面 .ink-cover-text 的两档字重一致。 */
export function coverFontPath(weight: CoverFontWeight = "black") {
  const file = weight === "black" ? "NotoSansSC-Black.ttf" : "NotoSansSC-Medium.ttf";
  const suffix = `fonts/cover/${file}`;
  const paths = [
    path.join(resolveStaticPublicDir() || "", suffix),
    path.resolve(__dirname, "../../app/public", suffix),
    path.resolve(process.cwd(), "app/public", suffix),
    path.resolve(process.cwd(), "../app/public", suffix),
    path.resolve(process.cwd(), "public", suffix),
  ];
  const found = paths.find((p) => existsSync(p));
  if (!found)
    throw new Error(
      `封面中文字库未找到，请部署 fonts/cover/${file} 后重试（可运行 python3 scripts/build-cover-font.py 生成）。`,
    );
  return found;
}

const fontCache = new Map<string, Font>();

function loadFont(file: string): Font {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const buffer = readFileSync(file);
  const font = parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  fontCache.set(file, font);
  return font;
}

export type CoverLineRender = {
  /** 栅格化后的透明底 PNG。 */
  buffer: Buffer;
  /** 画出来的宽度（px，已含横向压缩）。 */
  width: number;
  /** 画出来的高度（px，含降部溢出）。 */
  height: number;
};

/**
 * 画一行字。
 *
 * 盒模型照抄 CSS 行内盒：行高 L = size × 1.22，半行距 (L - size) / 2，
 * 基线在 (L - size) / 2 + ascent 处 —— 浏览器和服务端落笔位置一致，
 * 导出的分享图和页面上的字才会严丝合缝。
 */
export async function renderCoverLine(options: {
  text: string;
  size: number;
  color: string;
  weight?: CoverFontWeight;
  /** 字距（em）。 */
  tracking?: number;
  /** 横向压缩系数：1 = 不压缩。 */
  scaleX?: number;
  /** 行高倍数（相对字号），与 shared/lib/blogCoverText.ts 的 1.22 一致。 */
  lineHeightRatio?: number;
}): Promise<CoverLineRender> {
  const {
    text,
    size,
    color,
    weight = "black",
    tracking = 0,
    scaleX = 1,
    lineHeightRatio = 1.22,
  } = options;
  const font = loadFont(coverFontPath(weight));
  const upem = font.unitsPerEm;
  const lineHeight = size * lineHeightRatio;
  const halfLeading = (lineHeight - size) / 2;
  const baseline = halfLeading + (font.ascender / upem) * size;

  let pen = 0;
  const parts: string[] = [];
  let minY = 0;
  let maxY = 0;
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    if (!glyph) continue;
    const glyphPath = glyph.getPath(pen, 0, size);
    parts.push(glyphPath.toPathData(2));
    const box = glyphPath.getBoundingBox();
    if (box.y1 < minY) minY = box.y1;
    if (box.y2 > maxY) maxY = box.y2;
    pen += ((glyph.advanceWidth ?? upem) / upem) * size + tracking * size;
  }
  const advance = Math.max(0, pen - tracking * size);
  const width = Math.max(1, Math.ceil(advance * scaleX));
  // 降部可能探出行盒，底图要留出来，否则字的下缘会被切掉。
  const height = Math.max(1, Math.ceil(baseline + maxY));
  if (!parts.length) {
    return {
      buffer: await sharp({
        create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .png()
        .toBuffer(),
      width,
      height,
    };
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(0 ${baseline}) scale(${scaleX} 1)"><path d="${parts.join(" ")}" fill="${color}"/></g></svg>`;
  const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return { buffer, width, height };
}
