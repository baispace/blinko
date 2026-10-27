import {
  BRAND_MARK_RATIO,
  BRAND_MARK_VIEWBOX,
  BRAND_PATH_BODY,
  BRAND_PATH_CREASE,
  BRAND_PATH_FRAGMENT,
} from './brandGeometry';

/**
 * How the mark is painted.
 *
 * `primary` is the product purple for light backgrounds and steps up to the
 * light lavender on dark backgrounds, `soft` / `light` are the lighter steps
 * for dark backgrounds, `ink` is the near-black used on printed material and
 * `current` simply inherits the surrounding text colour.
 */
export type BrandTone = 'primary' | 'soft' | 'light' | 'ink' | 'current';

/**
 * The fill is painted through `currentColor` so the default tone can follow
 * the theme: brand purple on light surfaces, light lavender on dark ones.
 *
 * The colour has to sit on the class of the `<svg>` — a `fill` attribute on
 * the paths would win over an inherited CSS fill and pin the mark to one
 * tone.
 */
const TONE_FILL_CLASS: Record<Exclude<BrandTone, 'gradient'>, string> = {
  primary: 'text-[#5F40FD] dark:text-[#CABEFC]',
  soft: 'text-[#A791FE]',
  light: 'text-[#CABEFC]',
  ink: 'text-[#101229]',
  current: '',
};

export interface BrandMarkProps {
  /** Height of the mark in pixels; the width follows the 64:100 viewBox. */
  size?: number;
  tone?: BrandTone;
  /**
   * Fill the hairline crease between hook and stem. Below ~24px the crease
   * collapses into a smudge, so small icons use the solid silhouette.
   */
  simplified?: boolean;
  /** Accessible name. Without it the mark is decorative and hidden from AT. */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The Jomio mark.
 *
 * Always inline SVG: the mark has to stay crisp at 16px and pick up the
 * current theme without an extra request.
 */
export const BrandMark = ({
  size = 32,
  tone = 'primary',
  simplified = false,
  title,
  className,
  style,
}: BrandMarkProps) => {
  const height = size;
  const width = Math.round(size * BRAND_MARK_RATIO * 100) / 100;

  return (
    <svg
      viewBox={BRAND_MARK_VIEWBOX}
      width={width}
      height={height}
      className={`${TONE_FILL_CLASS[tone]} ${className ?? ''}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={BRAND_PATH_FRAGMENT} fill="currentColor" />
      <path d={BRAND_PATH_BODY} fill="currentColor" />
      {simplified && <path d={BRAND_PATH_CREASE} fill="currentColor" />}
    </svg>
  );
};
