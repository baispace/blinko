/**
 * 封面主色采样。
 *
 * 思路借自 QQ 音乐：专辑封面的主色决定播放器页面的底色，界面因此和内容
 * 天然是一套。这里做同一件事 —— 文章页顶部的背景色由自己的封面图采样得到，
 * 而不是全站一个紫色。
 *
 * 采样用的是「量化直方图取主色」，不是「所有像素求平均」：
 * 平均色会被大面积背景和主体互相稀释，往往得到一个既不像背景也不像主体的
 * 灰调；先量化到 4bit/通道做直方图、取占比最高的色桶再取桶内均值，得到的
 * 才是画面真正的主色。
 *
 * 任何一步失败（跨域导致 canvas 被污染、图片加载失败、浏览器不支持）都返回
 * null，调用方回退到默认底色 —— 采样是锦上添花，不该让页面挂掉。
 */

export type CoverPalette = {
  /** 采样到的原始主色（十六进制） */
  base: string;
  /** 亮色主题下的底色：压暗到白字对比度 ≥ 4.5:1 */
  light: string;
  /** 亮色主题下的渐变暗端：再沉一档，给顶部横向渐变用 */
  lightDeep: string;
  /** 暗色主题下的底色：更沉，避免夜里刺眼 */
  dark: string;
  /** 暗色主题下的渐变暗端 */
  darkDeep: string;
};

/** 采样分辨率：32×32 = 1024 个像素，够抓主色，又不至于因细节噪声跑偏。 */
const SAMPLE_SIZE = 32;

type RGB = { r: number; g: number; b: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toHex({ r, g, b }: RGB) {
  const part = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** sRGB 相对亮度（WCAG 2.x 定义）。 */
export function relativeLuminance({ r, g, b }: RGB) {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 这个色块上放白字的对比度。 */
export function contrastWithWhite(rgb: RGB) {
  return 1.05 / (relativeLuminance(rgb) + 0.05);
}

function scale(rgb: RGB, k: number): RGB {
  return { r: rgb.r * k, g: rgb.g * k, b: rgb.b * k };
}

/**
 * 整体压暗，直到白字压在上面对比度达标（默认 4.5:1）。
 *
 * 不能用 HSL 的 lightness 来约束：同样是 L=42%，黄色的相对亮度有 0.25，
 * 白字只有 3.5:1 不达标；紫色同样 L 却只有 0.05，白字对比度 10:1 很安全。
 * 主色是从封面里量化出来的，可能是任何颜色，所以只能按相对亮度来卡。
 */
export function darkenForWhiteText(rgb: RGB, minContrast = 4.5): RGB {
  if (contrastWithWhite(rgb) >= minContrast) return rgb;
  // 二分找「尽可能亮但仍然达标」的缩放系数
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (contrastWithWhite(scale(rgb, mid)) >= minContrast) lo = mid;
    else hi = mid;
  }
  return scale(rgb, lo);
}

/** 从像素里找主色。返回 null 表示没有可用像素（全透明 / 空图）。 */
function dominantColor(pixels: Uint8ClampedArray): RGB | null {
  // 量化到 4bit/通道（16 级），同一色块会落进同一个桶。
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3];
    if (a < 125) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count += 1;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
  }
  if (!buckets.size) return null;
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  return {
    r: best.r / best.count,
    g: best.g / best.count,
    b: best.b / best.count,
  };
}

/** 同一张封面只采一次，翻页回来不用重画。 */
const cache = new Map<string, CoverPalette | null>();

/**
 * 采样封面主色，返回可直接喂给 CSS 的调色板。
 * 失败返回 null —— 调用方保留默认底色即可。
 */
export function sampleCoverPalette(src: string): Promise<CoverPalette | null> {
  if (!src) return Promise.resolve(null);
  if (typeof document === "undefined") return Promise.resolve(null);
  const cached = cache.get(src);
  if (cached !== undefined) return Promise.resolve(cached);

  const failed = (): null => {
    cache.set(src, null);
    return null;
  };

  return new Promise<CoverPalette | null>((resolve) => {
    const image = new Image();
    // 同源图片不需要 CORS；带上 crossOrigin 可以在跨域时拿到真实像素，
    // 拿不到就回落到 null（不抛错）。
    image.crossOrigin = "anonymous";
    const timer = setTimeout(() => {
      image.src = "";
      resolve(failed());
    }, 8000);
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_SIZE;
        canvas.height = SAMPLE_SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(failed());
        ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const color = dominantColor(data);
        if (!color) return resolve(failed());
        // 白字压在上面对比度必须达标，按相对亮度压暗而不是按 HSL 明度。
        const light = darkenForWhiteText(color, 4.5);
        const dark = scale(light, 0.55);
        const palette: CoverPalette = {
          base: toHex(color),
          light: toHex(light),
          lightDeep: toHex(scale(light, 0.8)),
          dark: toHex(dark),
          darkDeep: toHex(scale(dark, 0.78)),
        };
        cache.set(src, palette);
        resolve(palette);
      } catch {
        // 跨域图片会让 canvas 被污染，getImageData 抛错 —— 当作采样失败。
        resolve(failed());
      }
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(failed());
    };
    image.src = src;
  });
}
