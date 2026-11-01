import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  COVER_BACKDROP_ALPHA,
  computeCoverLayouts,
  coverSupportsText,
  coverScrimCss,
  coverBackdropCss,
  normalizeCoverTextConfig,
  type CoverSceneKey,
  type CoverTextConfig,
} from "@shared/lib/blogCoverText";
import { coverIconBounds } from "@shared/lib/coverIconBounds";
import { coverFocusVars } from "./CoverImage";
import type { CoverFocusValue, CoverPlacementKey } from "@shared/lib/blogCover";
import "./cover.css";

/**
 * 统一的封面渲染：底图层 + 文字层 + 页面状态层。
 *
 * 第二版封面只有一种版式（AI 生成的封面都是「一枚图标」）：
 *   1. 背景层 —— 主题渐变，由程序铺；
 *   2. 背景大字 —— 封面短标题放大压淡，横贯画面；
 *   3. 图标砖 —— 白色圆角方块居中，图标在砖内；
 *   4. 锐利小字 —— 封面小字压在底部；
 *   5. 页面状态层 —— 置顶角标、轮播控件，由调用方自己画。
 *
 * 底图只有一张（AI 出的那枚透明图标），整幅铺满封面 ——
 * 图标砖的位置、大小、背景大字的字号都由 shared/lib/blogCoverText.ts
 * 按容器的**实际像素尺寸**算：同一个短标题在头条大图和列表缩略图里
 * 字号、行数、是否留小字都不一样。
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
  const [loaded, setLoaded] = useState(false);

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
  const withText = text.mode === "overlay" && !!text.title.trim() && coverSupportsText(box.width, placement);

  const layouts = useMemo(
    () =>
      computeCoverLayouts({
        containerWidth: box.width,
        containerHeight: box.height,
        placement,
        title: text.title,
        subtitle: text.subtitle,
        align: text.align,
        sizeScale: text.sizeScale,
        controls,
      }),
    [
      box.width,
      box.height,
      placement,
      text.title,
      text.subtitle,
      text.align,
      text.sizeScale,
      controls,
    ],
  );
  const layout = layouts.title;

  const [trimmedSource, setTrimmedSource] = useState<{src:string;url:string}|null>(null);
  const [isolatedSource, setIsolatedSource] = useState<string | null>(null);
  /**
   * 隔离图标 = 模型出的那枚透明图。
   *
   * 只有它走新版式：程序给它一块白方砖、压上一行淡化大字。
   * 作者上传的整图封面（不透明）仍旧整幅铺满，叠自己的文字层。
   */
  const isolated = text.artwork === "icon" || text.artwork === "tile" || (text.mode === "overlay" && isolatedSource === src);
  const [edgeStrip, setEdgeStrip] = useState<{src:string;url:string} | null>(null);
  const containBanner = placement === "banner" && text.mode === "overlay";
  const vars = coverFocusVars(focus) as CSSProperties;
  const scrim = withText ? coverScrimCss(text.palette, text.align) : undefined;
  const hasBox = box.width > 0 && box.height > 0;
  const tile = {...layouts.tile, inset: text.artwork === "tile" ? 0 : layouts.tile.inset};

  return (
    <div
      ref={ref}
      className={"ink-cover" + (className ? " " + className : "")}
      data-placement={placement}
      data-text={withText ? "on" : "off"}
      data-broken={broken ? "1" : undefined}
      data-fit={isolated || containBanner ? "contain" : "cover"}
      data-artwork={isolated ? "icon" : "image"}
      style={{ ...vars, ...((withText || isolated) ? { background: coverBackdropCss(text.palette) } : {}), ...style }}
    >
      {isolated && withText && hasBox && layouts.backdrop && (
        <div
          aria-hidden="true"
          className="ink-cover-backdrop"
          style={{
            left: `${layouts.backdrop.centerX}px`,
            top: `${layouts.backdrop.top}px`,
            fontSize: `${layouts.backdrop.fontSize}px`,
            lineHeight: `${layouts.backdrop.lineHeight}px`,
            color: `rgba(255,255,255,${COVER_BACKDROP_ALPHA})`,
            transform: `translateX(-50%) scaleX(${layouts.backdrop.scaleX})`,
          }}
        >
          {layouts.backdrop.text}
        </div>
      )}
      {containBanner && !isolated && edgeStrip?.src === src && <div aria-hidden="true" style={{position:'absolute',inset:0,backgroundImage:`url(${edgeStrip.url})`,backgroundSize:'100% 100%'}} />}
      {!broken && (
        <div className="ink-cover-artwork">
          {isolated && text.artwork !== "tile" && hasBox && (
            <div
              aria-hidden="true"
              className="ink-cover-tile"
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
                borderRadius: `${tile.borderRadius}px`,
              }}
            />
          )}
          <img
            className="ink-cover-base"
            src={trimmedSource?.src === src ? trimmedSource.url : src}
            crossOrigin="anonymous"
            alt={alt}
            loading={loading}
            style={{
              opacity: loaded ? 1 : 0,
              ...(isolated && hasBox
                ? {
                    objectFit: "contain",
                    objectPosition: "center",
                    left: `${tile.left + tile.inset}px`,
                    top: `${tile.top + tile.inset}px`,
                    right: "auto",
                    bottom: "auto",
                    width: `${Math.max(1, tile.size - tile.inset * 2)}px`,
                    height: `${Math.max(1, tile.size - tile.inset * 2)}px`,
                  }
                : containBanner
                  ? { objectFit: "contain", objectPosition: "right center", width: "100%" }
                  : {}),
            }}
            onLoad={(event) => {
              setLoaded(true);
              setBroken(false);
              const image=event.currentTarget;
              try {
                /*
                 * 隔离判定：整幅缩到 32×32，数透明像素占比。
                 *
                 * 口径与服务端 composeCoverImage 一致（超过 2% 才算隔离）——
                 * 两边判定不同，页面与分享图就会长成两个样子。
                 * 只看左上角一个像素是不够的：带 1px 透明边的整图封面
                 * 会被误判成图标。
                 */
                const probe=document.createElement('canvas');probe.width=32;probe.height=32;
                const ctx=probe.getContext('2d');
                if(ctx){
                  ctx.drawImage(image,0,0,32,32);
                  const pixels=ctx.getImageData(0,0,32,32).data;
                  let transparent=0;
                  for(let i=3;i<pixels.length;i+=4) if(pixels[i]<16) transparent++;
                  if(transparent/1024>0.02){
                    setIsolatedSource(src);
                    if(trimmedSource?.src!==src){
                      const full=document.createElement('canvas');full.width=image.naturalWidth;full.height=image.naturalHeight;
                      const drawing=full.getContext('2d');
                      if(drawing){drawing.drawImage(image,0,0);const b=coverIconBounds(drawing.getImageData(0,0,full.width,full.height).data,full.width,full.height);
                        if(b){const crop=document.createElement('canvas');crop.width=b.width;crop.height=b.height;crop.getContext('2d')?.drawImage(full,b.left,b.top,b.width,b.height,0,0,b.width,b.height);setTrimmedSource({src,url:crop.toDataURL('image/png')});}
                      }
                    }
                    return;
                  }
                }
                if(!containBanner)return;
                const canvas=document.createElement('canvas');canvas.width=1;canvas.height=image.naturalHeight;
                const edge=canvas.getContext('2d');if(!edge)return;
                edge.drawImage(image,0,0,1,image.naturalHeight,0,0,1,image.naturalHeight);
                setEdgeStrip({src,url:canvas.toDataURL('image/png')});
              } catch { /* External images without CORS retain the palette fallback. */ }
            }}
            {...(fetchpriority ? ({ fetchpriority } as unknown as { fetchpriority?: "high" | "low" | "auto" }) : {})}
            onError={() => { setBroken(true); onError?.(); }}
          />
        </div>
      )}
      {isolated ? null : (
        <>
          {withText && <div className="ink-cover-scrim" style={{ background: scrim }} />}
          {withText && layout && (
            <div
              className="ink-cover-text"
              style={{
                left: `${layout.left}px`,
                top: `${layout.top}px`,
                /*
                 * 容器宽度 = 标题的**布局**宽度上限。
                 * 浏览器裁切用的是布局宽度（CSS scaleX 只改视觉、不改盒子），
                 * 所以这里要放宽到 titleMaxWidth，标题才不会在未压缩的宽度上被截断。
                 */
                maxWidth: `${layout.titleMaxWidth}px`,
                fontSize: `${layout.fontSize}px`,
                lineHeight: `${layout.titleLineHeight}px`,
                textAlign: layout.align,
                // 副标题不压窄，裁切阈值就是视觉列宽。
                "--ink-cover-text-max": `${layout.maxWidth}px`,
                // 压窄的标题从哪边收：居中 / 右对齐时收在另一头，否则整体会偏。
                "--ink-cover-origin":
                  layout.align === "center"
                    ? "center center"
                    : layout.align === "right"
                      ? "right center"
                      : "left center",
              } as CSSProperties}
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
        </>
      )}
    </div>
  );
}
