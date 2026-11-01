import sharp from "sharp";
import {prepareCoverIllustration} from "./coverIllustration";
import {
  coverTileSvgMarkup,
  COVER_BACKDROP_ALPHA,
  COVER_TITLE_SCALE_X,
  computeCoverBackdropLayout,
  computeCoverCaptionLayout,
  computeCoverTileLayout,
  coverBackdropColors,
  coverScrimStops,
  coverTileScrimStops,
  coverPaletteColor,
  type CoverBackdropLayout,
  type CoverCaptionLayout,
  type CoverTextAlign,
  type CoverTextLayout,
  type CoverTileLayout,
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
  const color = align === "left" ? "#000000" : coverPaletteColor(palette);
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
 * 图标砖版的遮罩：自下而上压一条。
 *
 * 旧版式靠左侧渐变托住标题；新版式的大字在画面中间、小字在底部，
 * 压左侧会把参考封面的渐变洗白，所以这里只压底部。
 */
export function coverTileScrimSvg(width: number, height: number) {
  const stops = coverTileScrimStops()
    .map(
      (s) =>
        `<stop offset="${s.offset}" stop-color="#000000" stop-opacity="${s.alpha}"/>`,
    )
    .join("");
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="scrim" x1="0" y1="1" x2="0" y2="0">${stops}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#scrim)"/></svg>`,
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
          buffer: await sharp(rendered.buffer).resize({ width: layout.maxWidth, height: rendered.height, fit: "fill" }).png().toBuffer() };
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
 * 背景大字层：封面短标题放大压淡，横贯画面。
 *
 * 这一层在图标砖**下面** —— 参考封面就是字在后面、方块压在上面。
 * 透明度与页面 CSS 用同一个常量，两边不会一深一浅。
 */
export async function renderCoverBackdropLayer(opts: {
  layout: CoverBackdropLayout;
  canvasWidth: number;
  canvasHeight: number;
}): Promise<Buffer> {
  const { layout } = opts;
  const rawLine = await renderLine(
    layout.text,
    layout.fontSize,
    `rgba(255,255,255,${COVER_BACKDROP_ALPHA})`,
    -0.02,
    "black",
    layout.scaleX,
  );
  const buffer = await sharp(rawLine.buffer).trim({threshold: 1}).png().toBuffer();
  const meta = await sharp(buffer).metadata();
  const line = {buffer, width: meta.width!, height: meta.height!};
  const left = Math.max(0, Math.round(layout.centerX - line.width / 2));
  const top = Math.max(0, Math.round((opts.canvasHeight - line.height) / 2));
  return sharp({
    create: {
      width: Math.max(1, opts.canvasWidth),
      height: Math.max(1, opts.canvasHeight),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: line.buffer, left, top }])
    .png()
    .toBuffer();
}

/** 锐利小字层：封面小字，压在画面底部。 */
export async function renderCoverCaptionLayer(opts: {
  layout: CoverCaptionLayout;
  canvasWidth: number;
  canvasHeight: number;
  align: CoverTextAlign;
}): Promise<Buffer> {
  const { layout } = opts;
  const composites: sharp.OverlayOptions[] = [];
  let offset = layout.top;
  for (const line of layout.lines) {
    const rendered = await renderLine(line, layout.fontSize, "#ffffff", -0.02, "medium", 1);
    const x =
      opts.align === "center"
        ? layout.left + (layout.maxWidth - rendered.width) / 2
        : opts.align === "right"
          ? layout.left + layout.maxWidth - rendered.width
          : layout.left;
    composites.push({
      input: rendered.buffer,
      left: Math.max(0, Math.round(x)),
      top: Math.max(0, Math.round(offset)),
    });
    offset += layout.lineHeight;
  }
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

/** 图标砖：白色圆角方块。 */
function coverTileSvg(tile: CoverTileLayout) {
  return Buffer.from(coverTileSvgMarkup(tile));
}

/**
 * 新版式封面：主题渐变 + 标题分割 + 居中图标砖 + 底部小字。
 *
 * 参考封面风格：标题文字被图标砖分割成左右两部分，
 * 左侧文字 + 图标砖 + 右侧文字，形成「文字围绕图标」的视觉效果。
 *
 * 模型只出图标（透明底），背景、大字、方块、位置全部在这里排 ——
 * 所以同一枚图标放进任何场景都长成同一个版式。
 */
export async function composeTileCoverImage(opts: {
  icon: Buffer;
  tileAsset?: boolean;
  backdrop: CoverBackdropLayout | null;
  caption: CoverCaptionLayout | null;
  tile: CoverTileLayout;
  canvasWidth: number;
  canvasHeight: number;
  palette: string;
  align: CoverTextAlign;
  /** 用于分割布局的标题（参考封面风格）。 */
  title?: string;
}): Promise<Buffer> {
  const w = Math.max(1, opts.canvasWidth);
  const h = Math.max(1, opts.canvasHeight);
  const colors = coverBackdropColors(opts.palette);
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${colors.left}"/><stop offset="1" stop-color="${colors.right}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );

  const layers: sharp.OverlayOptions[] = [];
  const tile = opts.tile;

  if (opts.backdrop) layers.push({
    input: await renderCoverBackdropLayer({layout: opts.backdrop, canvasWidth: w, canvasHeight: h}),
    left: 0, top: 0,
  });

  // 2. 图标砖与砖内的图标（压在文字上方）。
  const inset = opts.tileAsset ? 0 : tile.inset;
  const inner = Math.max(1, tile.size - inset * 2);
  const normalizedIcon = await isIsolatedAsset(opts.icon) ? await prepareCoverIllustration(opts.icon, opts.tileAsset ? {kind:"tile"} : {}) : opts.icon;
  const art = await sharp(normalizedIcon)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  if (!opts.tileAsset) layers.push({ input: coverTileSvg(tile), left: tile.left, top: tile.top });
  layers.push({
    input: art,
    left: tile.left + inset,
    top: tile.top + inset,
  });

  return sharp(bg).composite(layers).webp({ quality: 92 }).toBuffer();
}

/**
 * 这张图是不是「隔离图标」（模型出的那枚透明图）。
 *
 * 判定口径与页面一致：缩到 32×32 后透明像素超过 2% 才算隔离。
 *
 * 为什么不用「有没有一个透明像素」：作者上传的 PNG 常常带 1px 透明边，
 * 那种图其实是一张整图封面，不该被塞进图标砖里。
 * 两边必须用同一套判定，否则页面与分享图会长成两个样子。
 */
async function isIsolatedAsset(buffer: Buffer) {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .resize(32, 32, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0;
  const total = info.width * info.height;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) transparent++;
  return total > 0 && transparent / total > 0.02;
}

/**
 * 合成一张完整封面。
 *
 * 两套版式，按底图自己决定：
 *   - 隔离图标（AI 生成的那枚）→ 新版式：图标砖 + 背景大字；
 *   - 整张图片（作者上传的）→ 旧版式：底图 + 遮罩 + 文字层。
 */
export async function composeCoverImage(opts: {
  base: Buffer;
  layout: CoverTextLayout;
  /** 新版式要用的原始文案（不是排好版的行）。 */
  title?: string;
  subtitle?: string;
  sizeScale?: number;
  artwork?: "icon" | "tile" | "image";
  canvasWidth: number;
  canvasHeight: number;
  palette: string;
  align: CoverTextAlign;
}): Promise<Buffer> {
  const w = opts.canvasWidth;
  const h = opts.canvasHeight;
  const placement = opts.layout.placement;

  if (opts.artwork === "icon" || opts.artwork === "tile" || await isIsolatedAsset(opts.base)) {
    return composeTileCoverImage({
      icon: opts.base,
      tileAsset: opts.artwork === "tile",
      backdrop: computeCoverBackdropLayout({
        containerWidth: w,
        containerHeight: h,
        placement,
        title: opts.title ?? "",
      }),
      caption: computeCoverCaptionLayout({
        containerWidth: w,
        containerHeight: h,
        placement,
        subtitle: opts.subtitle ?? "",
        align: opts.align,
        sizeScale: opts.sizeScale,
      }),
      tile: computeCoverTileLayout({ containerWidth: w, containerHeight: h }),
      canvasWidth: w,
      canvasHeight: h,
      palette: opts.palette,
      align: opts.align,
      title: opts.title,
    });
  }

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
  let base = artwork;
  if (placement === "banner") {
    const meta = await sharp(opts.base).metadata();
    const edge = await sharp(opts.base).extract({left:0,top:0,width:1,height:meta.height!}).resize(opts.canvasWidth,opts.canvasHeight,{fit:"fill"}).png().toBuffer();
    const contained = await sharp(opts.base).resize(opts.canvasWidth,opts.canvasHeight,{fit:"contain",position:"right",background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    base = await sharp(edge).composite([{input:contained,left:0,top:0}]).png().toBuffer();
  }
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
