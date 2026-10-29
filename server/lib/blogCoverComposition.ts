import sharp from "sharp";
import {
  coverScrimStops,
  coverBackdropColors,
  COVER_TITLE_SCALE_X,
  coverPaletteColor,
  type CoverTextAlign,
  type CoverTextLayout,
} from "../../shared/lib/blogCoverText";
import { renderCoverLine, type CoverFontWeight } from "./coverTextRaster";

/**
 * 服务端渲染封面文字层。
 *
 * 页面上的文字层是真文字（DOM），分享图上的文字层是这里画出来的 ——
 * 两者用同一份 shared/lib/blogCoverText.ts 的断行结果与字号，
 * 所以「页面长这样、分享出去长这样」。
 *
 * 字形来源见 coverTextRaster.ts：不走 Pango，绕开 fontconfig 依赖，
 * 页面与导出用的是同一份字库文件。
 */

/** XML 转义在旧的 Pango 方案里需要；现在文字走 SVG 路径，用不上了。 */

type Rendered = { buffer: Buffer; width: number; height: number };

/**
 * 画一行字。
 *
 * tracking 与 scaleX 必须和 shared/lib/blogCoverText.ts 的排版参数一致：
 * 页面上是 CSS 的 letter-spacing / scaleX，这里是几何上的等价物。
 */
async function renderLine(
  text: string,
  size: number,
  color: string,
  tracking: number,
  weight: CoverFontWeight,
  scaleX: number,
): Promise<Rendered> {
  const line = await renderCoverLine({
    text,
    size,
    color,
    weight,
    tracking,
    scaleX,
  });
  return { buffer: line.buffer, width: line.width, height: line.height };
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
  // 字距与 shared/lib/blogCoverText.ts 的 TRACKING 一致（页面是 CSS letter-spacing）。
  const tracking = -0.02;

  const place = async (
    lines: string[],
    size: number,
    color: string,
    lineHeight: number,
    startTop: number,
    weight: CoverFontWeight,
    scaleX: number,
  ) => {
    let offset = startTop;
    for (const line of lines) {
      let rendered = await renderLine(line, size, color, tracking, weight, scaleX);
      if (rendered.width > layout.maxWidth) {
        rendered = { ...rendered, width: layout.maxWidth,
          buffer: await sharp(rendered.buffer).extract({ left: 0, top: 0, width: layout.maxWidth, height: rendered.height }).png().toBuffer() };
      }
      const x =
        opts.align === "center"
          ? layout.left + (layout.maxWidth - rendered.width) / 2
          : opts.align === "right"
            ? layout.left + layout.maxWidth - rendered.width
            : layout.left;
      /*
       * 行盒顶就是行位（baseline 在盒内 1.27em 处），
       * 栅格化时按同一套盒模型落的基线，所以这里直接贴顶，
       * 不要再按「字形在行盒里居中」二次偏移。
       */
      composites.push({
        input: rendered.buffer,
        left: Math.round(x),
        top: Math.round(offset),
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
    "black",
    COVER_TITLE_SCALE_X,
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
      "medium",
      1,
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
 * 底图整幅铺满画布（object-fit: cover 的等价物），与页面一致：
 * 底图左侧留干净底色给标题，右侧那组插画被画框裁掉。
 * 调用方不能先裁切主体 —— 主体在源图里的位置就是它在封面里的位置。
 */
export async function composeCoverImage(opts: {
  base: Buffer;
  layout: CoverTextLayout;
  canvasWidth: number;
  canvasHeight: number;
  palette: string;
  align: CoverTextAlign;
}): Promise<Buffer> {
  const colors = coverBackdropColors(opts.palette);
  const background = Buffer.from(`<svg width="${opts.canvasWidth}" height="${opts.canvasHeight}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg"><stop stop-color="${colors.left}"/><stop offset="1" stop-color="${colors.right}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#bg)"/></svg>`);
  /*
   * 整幅铺满：源图是 16:9，封面比它更宽 —— 整幅宽都露出来，上下裁。
   * 这与页面 object-fit: cover + 各展示位的裁切位置是同一套数学。
   */
  const artwork = await sharp(opts.base)
    .resize(opts.canvasWidth, opts.canvasHeight, {
      fit: "cover",
      position: "centre",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const base = await sharp(background).composite([{ input: artwork, left: 0, top: 0 }]).png().toBuffer();
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
