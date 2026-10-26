import sharp from "sharp";
import path from "node:path";
import { existsSync } from "node:fs";
import { resolveStaticPublicDir } from "./cdnStaticDir";
import {
  coverScrimStops,
  coverPaletteColor,
  type CoverTextAlign,
  type CoverTextLayout,
} from "../../shared/lib/blogCoverText";

/**
 * 服务端渲染封面文字层。
 *
 * 页面上的文字层是真文字（DOM），分享图上的文字层是这里画出来的 ——
 * 两者用同一份 shared/lib/blogCoverText.ts 的断行结果与字号，
 * 所以「页面长这样、分享出去长这样」。
 */

/** 封面中文字库：与页面 .ink-cover-text 用的是同一套字形来源。 */
export function coverFontPath() {
  const suffix = "fonts/cover/NotoSansSC.ttf";
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
      "封面中文字库未找到，请部署 fonts/cover/NotoSansSC.ttf 后重试。",
    );
  return found;
}

/**
 * XML 转义。
 *
 * 文字是塞进 <span> 里交给 sharp 的文本渲染器解析的，
 * 所以 & < > " ' 都得转义，否则标题里一个 & 就能把整段打散。
 */
const AMP = String.fromCharCode(38);
const escape = (s: string) =>
  s
    .replace(/&/g, AMP + "amp;")
    .replace(/</g, AMP + "lt;")
    .replace(/>/g, AMP + "gt;")
    .replace(/"/g, AMP + "quot;")
    .replace(/'/g, AMP + "apos;");

type Rendered = { buffer: Buffer; width: number; height: number };

async function renderLine(
  text: string,
  size: number,
  color: string,
  tracking: number,
): Promise<Rendered> {
  const buffer = await sharp({
    text: {
      text: `<span foreground="${color}" weight="heavy">${escape(text)}</span>`,
      font: `Noto Sans SC Heavy ${size}`,
      fontfile: coverFontPath(),
      align: "left",
      dpi: 72,
      rgba: true,
      spacing: Math.round(size * tracking),
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** 遮罩：与页面 CSS 渐变同参数（shared 里定义节点）。 */
export function coverScrimSvg(
  width: number,
  height: number,
  palette: string,
  align: CoverTextAlign,
) {
  const color = coverPaletteColor(palette);
  const stops = coverScrimStops(align)
    .map(
      (s) =>
        `<stop offset="${s.offset}" stop-color="${color}" stop-opacity="${s.alpha}"/>`,
    )
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#scrim)"/></svg>`,
  );
}

/**
 * 把排版结果画成一张透明底的文字层 PNG。
 *
 * 坐标直接用 layout 里的 left/top —— 那是按容器实际尺寸算出来的，
 * 这里只负责把同样的行画到同样的位置。
 */
export async function renderCoverTextLayer(opts: {
  layout: CoverTextLayout;
  canvasWidth: number;
  canvasHeight: number;
  palette: string;
  align: CoverTextAlign;
}): Promise<Buffer> {
  const { layout } = opts;
  const composites: sharp.OverlayOptions[] = [];
  const tracking = 0.04;

  const place = async (
    lines: string[],
    size: number,
    color: string,
    lineHeight: number,
    startTop: number,
  ) => {
    let offset = startTop;
    for (const line of lines) {
      const rendered = await renderLine(line, size, color, tracking);
      const x =
        opts.align === "center"
          ? layout.left + (layout.maxWidth - rendered.width) / 2
          : opts.align === "right"
            ? layout.left + layout.maxWidth - rendered.width
            : layout.left;
      // 行高由排版决定，字形在行盒里居中。
      const y = offset + Math.max(0, (lineHeight - rendered.height) / 2);
      composites.push({
        input: rendered.buffer,
        left: Math.round(x),
        top: Math.round(y),
      });
      offset += lineHeight;
    }
  };

  await place(
    layout.titleLines,
    layout.fontSize,
    "#ffffff",
    layout.titleLineHeight,
    layout.top,
  );
  if (layout.subtitleLines.length)
    await place(
      layout.subtitleLines,
      layout.subtitleSize,
      "#ecebff",
      layout.subtitleLineHeight,
      layout.top +
        layout.titleLines.length * layout.titleLineHeight +
        layout.subtitleGap,
    );

  return sharp({
    create: {
      width: Math.max(1, opts.canvasWidth),
      height: Math.max(1, opts.canvasHeight),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/**
 * 合成一张完整封面：底图 + 遮罩 + 文字层。
 *
 * 底图由调用方先裁到目标比例 —— 这里只负责叠加。
 */
export async function composeCoverImage(opts: {
  base: Buffer;
  layout: CoverTextLayout;
  canvasWidth: number;
  canvasHeight: number;
  palette: string;
  align: CoverTextAlign;
}): Promise<Buffer> {
  const base = await sharp(opts.base)
    .resize(opts.canvasWidth, opts.canvasHeight, { fit: "cover" })
    .toBuffer();
  const scrim = coverScrimSvg(
    opts.canvasWidth,
    opts.canvasHeight,
    opts.palette,
    opts.align,
  );
  const text = await renderCoverTextLayer(opts);
  return sharp(base)
    .composite([{ input: scrim }, { input: text }])
    .webp({ quality: 92 })
    .toBuffer();
}
