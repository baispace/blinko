/**
 * Jomio · 拾成 — brand geometry.
 *
 * Single source of truth for the J mark. The React components in this folder
 * and the static assets under `app/public/brand` are both generated from the
 * path data below, so the mark is never hand-drawn twice.
 *
 * The outlines were traced from the brand reference sheet and re-fitted as
 * cubic Béziers (IoU 97% against the reference raster), so the paths stay
 * short enough to read while matching the original silhouette, the folded
 * hook and the crease that separates hook from stem.
 *
 * Coordinates live in a 64 x 100 viewBox: the mark is noticeably taller than
 * wide, and the fragment sits above the J's shoulder.
 */

/** viewBox of the mark itself (fragment + body). */
export const BRAND_MARK_VIEWBOX = '0 0 64 100';

/** width / height of the mark viewBox. */
export const BRAND_MARK_RATIO = 64 / 100;

/** The small note fragment that settles above the J. */
export const BRAND_PATH_FRAGMENT =
  'M 47.35 1.49 C 52.69 3.26 53.00 5.14 53.00 5.14 C 53.81 18.66 52.77 20.12 52.77 20.12 ' +
  'C 51.19 24.90 48.18 25.29 48.18 25.29 L 32.10 31.59 C 29.18 32.67 27.36 31.23 27.36 31.23 ' +
  'C 26.00 30.44 25.56 28.87 25.56 28.87 L 25.39 14.49 C 25.57 10.48 28.85 8.64 28.85 8.64 ' +
  'C 42.60 1.95 47.35 1.49 47.35 1.49 Z';

/** The J body: diagonal shoulder, stem and the folded hook at the bottom. */
export const BRAND_PATH_BODY =
  'M 58.21 29.87 L 62.25 31.88 C 62.70 61.30 61.87 68.44 61.87 68.44 ' +
  'C 60.91 76.14 58.93 79.17 58.93 79.17 C 55.11 87.01 51.23 88.74 51.23 88.74 ' +
  'C 50.94 92.36 47.72 91.33 47.72 91.33 L 39.46 95.59 C 33.46 97.90 26.25 98.27 26.25 98.27 ' +
  'C 22.47 98.64 16.57 97.17 16.57 97.17 L 12.15 95.18 L 11.10 94.67 C 5.20 91.38 7.39 91.90 7.39 91.90 ' +
  'L 4.78 88.08 L 2.92 84.59 C 0.84 77.10 2.21 77.51 2.21 77.51 C 2.41 76.79 4.35 75.40 4.32 75.41 ' +
  'C 29.23 66.15 32.08 66.37 32.08 66.37 L 32.38 76.14 C 32.05 83.02 30.24 86.69 30.24 86.69 ' +
  'C 29.44 88.79 29.57 88.11 29.57 88.11 L 28.97 88.94 L 28.26 89.95 L 26.89 91.60 ' +
  'C 26.89 91.60 25.57 93.19 25.57 93.19 C 28.94 91.10 30.70 88.37 30.70 88.37 ' +
  'C 34.13 83.69 34.41 78.67 34.41 78.67 L 34.85 43.43 C 36.02 39.33 37.57 38.84 37.57 38.84 ' +
  'C 40.58 35.86 41.89 36.41 41.89 36.41 L 45.11 35.13 C 58.79 29.76 58.21 29.87 58.21 29.87 Z';

/**
 * The crease between the folded hook and the stem.
 *
 * It is a hairline gap in the reference (about 2.5 units at the top, closing
 * to a point at the bottom). Below 24px it collapses into a smudge, so the
 * small-size variant fills it and keeps the silhouette solid.
 */
export const BRAND_PATH_CREASE =
  'M 32.08 66.37 L 34.56 66.37 L 34.41 78.67 L 30.70 88.37 L 25.57 93.19 ' +
  'L 26.89 91.60 L 28.26 89.95 L 29.57 88.11 L 30.24 86.69 L 32.38 76.14 Z';

/**
 * Brand palette.
 *
 * `primary` is the product purple; `soft` / `light` are the lighter steps used
 * on dark backgrounds and in the app icon gradient.
 */
export const BRAND_COLOR = {
  primary: '#5F40FD',
  soft: '#A791FE',
  light: '#CABEFC',
  ink: '#101229',
  muted: '#88899D',
} as const;

/**
 * Product name, Chinese name and tagline. */
export const BRAND_NAME = {
  en: 'Jomio',
  zh: '拾成',
  tagline: '拾起想法，让它成形。',
} as const;

/**
 * Wordmark of the running deployment.
 *
 * The Chinese name belongs to the default brand only: a deployment that
 * renamed the product keeps its own name and is not forced to carry 拾成.
 */
export const resolveBrandName = (customTitle?: string | null) => {
  const name = customTitle?.trim() || BRAND_NAME.en;
  return {
    name,
    showChinese: name.toLowerCase() === BRAND_NAME.en.toLowerCase(),
  };
};

/**
 * Version of the shipped brand assets.
 *
 * Files in `app/public` are served with `immutable` caching for a week, so
 * every reference to a brand asset carries `?v=<version>`. Bump this number
 * whenever the mark or the icons change and every browser picks up the new
 * files without a manual cache clear.
 */
export const BRAND_ASSET_VERSION = '1';

/**
 * Font stack used by the wordmark.
 *
 * Only fonts the project already ships or the platform provides are listed —
 * no third-party or commercial typeface is pulled in.
 */
export const BRAND_FONT_STACK =
  '"Noto Sans SC", "Roboto", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
