import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  computeCoverTextLayout,
  coverScrimCss,
  coverBackdropCss,
  normalizeCoverTextConfig,
  type CoverSceneKey,
  type CoverTextConfig,
} from "@shared/lib/blogCoverText";
import { coverFocusVars } from "./CoverImage";
import type { CoverFocusValue, CoverPlacementKey } from "@shared/lib/blogCover";
import "./cover.css";

/**
 * 统一的封面渲染：底图层 + 文字层 + 页面状态层。
 *
 * 底图只有一张（1600×900），整幅铺满封面 —— 底图左侧留干净底色，
 * 右侧那组插画被画框裁掉，标题压在左侧留白上。
 * 不再把标题烤进图片，也不按场景各存一张图。
 * 排版按容器的**实际像素尺寸**算：同一个短标题在头条大图和列表缩略图里
 * 字号、行数、是否留副标题都不一样。
 *
 * 页面状态层（置顶角标、轮播控件）由调用方自己画。
 * 角标现在统一贴在封面右上角、标题在左边，两边不碰，
 * 所以排版器不用再为角标让位（标题位置与分享图完全一致）。
 */
export type CoverCanvasProps = {
  src: string;
  alt?: string;
  /** 文字层配置；null 或「完整图片封面」时只显示底图，不叠字。 */
  config?: CoverTextConfig | null;
  /** 各展示位的裁切位置。 */
  focus?: Partial<Record<CoverPlacementKey, CoverFocusValue>> | null;
  /** 这个容器是哪个展示位：决定排版规则与用哪份裁切位置。 */
  placement: CoverSceneKey;
  /** 底部是否有轮播 / 分页控件。 */
  controls?: boolean;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  fetchpriority?: "high" | "low" | "auto";
  onError?: () => void;
};

export function CoverCanvas({
  src,
  alt = "",
  config,
  focus,
  placement,
  controls = false,
  className,
  style,
  loading = "lazy",
  fetchpriority,
  onError,
}: CoverCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [broken, setBroken] = useState(false);

  // 首帧就量一次：useLayoutEffect 在绘制前跑，文字不会出现「先空后闪」。
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // 用 clientWidth/Height 而不是 getBoundingClientRect：
    // 后者会被 CSS transform 影响（后台把 1200×630 的分享图缩放展示时就会量错）。
    const measure = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      setBox((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setBox((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const text = useMemo(() => normalizeCoverTextConfig(config), [config]);
  const withText = text.mode === "overlay" && !!text.title.trim();

  const layout = useMemo(() => {
    if (!withText || !box.width || !box.height) return null;
    return computeCoverTextLayout({
      containerWidth: box.width,
      containerHeight: box.height,
      placement,
      title: text.title,
      subtitle: text.subtitle,
      align: text.align,
      sizeScale: text.sizeScale,
      controls,
    });
  }, [
    withText,
    box.width,
    box.height,
    placement,
    text.title,
    text.subtitle,
    text.align,
    text.sizeScale,
    controls,
  ]);

  const vars = coverFocusVars(focus) as CSSProperties;
  const scrim = withText ? coverScrimCss(text.palette, text.align) : undefined;

  return (
    <div
      ref={ref}
      className={"ink-cover" + (className ? " " + className : "")}
      data-placement={placement}
      data-text={withText ? "on" : "off"}
      data-broken={broken ? "1" : undefined}
      style={{ ...vars, ...(withText ? { background: coverBackdropCss(text.palette) } : {}), ...style }}
    >
      {!broken && (
        <div className="ink-cover-artwork">
          <img
            className="ink-cover-base"
            src={src}
            alt={alt}
            loading={loading}
            {...(fetchpriority ? ({ fetchpriority } as unknown as { fetchpriority?: "high" | "low" | "auto" }) : {})}
            onError={() => { setBroken(true); onError?.(); }}
          />
        </div>
      )}
      {withText && <div className="ink-cover-scrim" style={{ background: scrim }} />}
      {withText && layout && (
        <div
          className="ink-cover-text"
          style={{
            left: `${layout.left}px`,
            top: `${layout.top}px`,
            maxWidth: `${layout.maxWidth}px`,
            fontSize: `${layout.fontSize}px`,
            lineHeight: `${layout.titleLineHeight}px`,
            textAlign: layout.align,
          }}
          data-overflow={layout.overflow ? "1" : undefined}
        >
          {layout.titleLines.map((line, index) => (
            <span className="ink-cover-line" key={index}>
              {line}
            </span>
          ))}
          {layout.subtitleLines.map((line, index) => (
            <span
              className="ink-cover-line ink-cover-subtitle"
              key={"sub-" + index}
              style={{
                fontSize: `${layout.subtitleSize}px`,
                lineHeight: `${layout.subtitleLineHeight}px`,
                marginTop:
                  index === 0 ? `${layout.subtitleGap}px` : undefined,
              }}
            >
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
