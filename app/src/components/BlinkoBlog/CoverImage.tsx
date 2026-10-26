import type { CSSProperties, ImgHTMLAttributes } from "react";
import {
  clampCoverFocus,
  coverPlacementKeys,
  coverPlacements,
  type CoverFocusValue,
  type CoverPlacementKey,
} from "@shared/lib/blogCover";

/**
 * 封面在某个展示位上的裁切位置，写成 CSS 变量。
 *
 * 三个展示位各写一份变量，具体用哪一份由 CSS 决定 ——
 * 比如头条大图在桌面用双栏那份、窄屏用 Banner 那份，
 * 这样不用在 JS 里判断断点，CSS 媒体查询直接换。
 */
export function coverFocusVars(
  focus?: Partial<Record<CoverPlacementKey, CoverFocusValue>> | null,
): CSSProperties {
  const vars: Record<string, string> = {};
  for (const key of coverPlacementKeys) {
    const value = clampCoverFocus(coverPlacements[key].ratio, focus?.[key]);
    vars[`--ink-cover-${key}-x`] = `${value.x}%`;
    vars[`--ink-cover-${key}-y`] = `${value.y}%`;
  }
  return vars as CSSProperties;
}

/**
 * 公开站与后台预览共用同一套渲染。
 *
 * 后台预览要跟线上长得一模一样，所以两边都用这个组件：
 * 变量怎么写、CSS 怎么取，公开站和后台不会走两套。
 */
export function CoverImage({
  src,
  alt = "",
  focus,
  className,
  style,
  ...rest
}: {
  src: string;
  alt?: string;
  /** 各展示位存下来的裁切位置。 */
  focus?: Partial<Record<CoverPlacementKey, CoverFocusValue>> | null;
  className?: string;
  style?: CSSProperties;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "style">) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ ...coverFocusVars(focus), ...style }}
      {...rest}
    />
  );
}
