import { useState } from "react";
import { CoverCanvas } from "./CoverCanvas";
import type { CoverTextConfig } from "@shared/lib/blogCoverText";

/**
 * 封面在各展示位上的真实预览。
 *
 * 一张底图会被裁成好几种样子，单独看一张大图判断不了：
 *   - 首页 Banner：2.9:1，图标砖居中，背景大字横贯画面，底部给推荐栏与轮播点让位；
 *   - 瀑布流卡片：2.8:1，图标砖居中，背景大字压在砖后；
 *   - 列表行：180×96 的小缩略图，方砖等比缩小，大字同步收窄；
 *   - 分享图：1200×630，与页面同一套排版。
 *
 * 所以这里不是「把同一张图缩放几次」，而是每个场景都用公开站真正的尺寸与版式
 * 把封面放回它该在的位置 —— 排版规则（字号、断行、小字显隐）由 CoverCanvas
 * 按容器实际像素算出来，所以预览里看到的就是线上那一张。
 */

export type CoverPreviewSceneKey = "banner" | "double" | "single" | "share";

export const COVER_PREVIEW_SCENES: {
  key: CoverPreviewSceneKey;
  label: string;
  note: string;
}[] = [
  { key: "banner", label: "首页 Banner", note: "桌面首页横幅 2.9:1，图标砖居中，背景大字横贯画面，底部留给推荐栏与轮播点" },
  { key: "double", label: "瀑布流卡片", note: "首页卡片网格大图 2.8:1，图标砖居中，背景大字压在砖后" },
  { key: "single", label: "列表行", note: "列表与相关推荐缩略图 180×96，方砖等比缩小，背景大字同步收窄" },
  { key: "share", label: "分享图", note: "社交分享卡片 1200×630，与页面用的是同一套排版规则" },
];

export function CoverSceneSwitch({
  value,
  onChange,
  disabled,
}: {
  value: CoverPreviewSceneKey;
  onChange: (next: CoverPreviewSceneKey) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg bg-default-100 p-1"
      role="tablist"
      aria-label="预览场景"
    >
      {COVER_PREVIEW_SCENES.map((scene) => {
        const active = scene.key === value;
        return (
          <button
            key={scene.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(scene.key)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              active
                ? "bg-background font-medium text-foreground shadow-sm"
                : "text-default-500 hover:text-foreground"
            }`}
          >
            {scene.label}
          </button>
        );
      })}
    </div>
  );
}

/** 封面在某个场景里的样子（含周围的版式，不是孤零零一张图）。 */
function CoverSceneContent({
  scene,
  src,
  title,
  excerpt,
  config,
  mobile = false,
}: {
  scene: CoverPreviewSceneKey;
  src: string;
  /** 卡片/列表里那篇文章的标题；封面上的大字单独由 config 决定。 */
  title?: string;
  excerpt?: string;
  config: CoverTextConfig | null;
  mobile?: boolean;
}) {
  const cover = (ratio: string, className?: string) => (
    <div
      className={`w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: ratio }}
    >
      <CoverCanvas src={src} config={config} placement={scene} controls={scene === "banner"} loading="eager" />
    </div>
  );

  if (scene === "double")
    return (
      <div className="overflow-hidden rounded-xl border border-default-200 bg-default-50">
        {cover("2.8 / 1")}
        <div className="flex flex-col gap-1 px-4 py-3">
          <p className="truncate text-[17px] font-bold text-foreground">
            {title || "文章标题"}
          </p>
          <p className="line-clamp-2 text-[13px] leading-relaxed text-default-500">
            {excerpt || "这里显示文章摘要，两行封顶。"}
          </p>
        </div>
      </div>
    );

  if (scene === "single")
    return (
      <div className="flex items-start gap-4 rounded-xl border border-default-200 bg-default-50 p-4">
        <div className="shrink-0 overflow-hidden rounded-lg" style={{width:mobile ? 88 : 180,height:mobile ? 66 : 96}}>
          <CoverCanvas src={src} config={config} placement="single" loading="eager" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-[15px] font-bold text-foreground">
            {title || "文章标题"}
          </p>
          <p className="line-clamp-2 text-[12px] leading-relaxed text-default-500">
            {excerpt || "这里显示文章摘要，两行封顶。"}
          </p>
        </div>
      </div>
    );

  if (scene === "share")
    return (
      <div className="overflow-hidden rounded-xl border border-default-200">
        {cover("1200 / 630")}
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-default-200">
      {cover("2.9 / 1")}
    </div>
  );
}

export function CoverScenePreview(props: Parameters<typeof CoverSceneContent>[0]) {
  const [mobile, setMobile] = useState(false);
  return <div className="space-y-3">
    <div className="flex items-center gap-1 text-xs" role="group" aria-label="预览设备">
      {[false,true].map(value => <button key={String(value)} type="button" aria-pressed={mobile === value}
        onClick={() => setMobile(value)} className={`rounded-md px-3 py-1.5 ${mobile === value ? "bg-default-200 text-foreground" : "text-default-500"}`}>
        {value ? "手机" : "桌面"}
      </button>)}
      {mobile && props.scene === "single" && <span className="ml-2 text-default-500">极小图隐藏叠字，保留旁侧文章标题</span>}
    </div>
    <div className="mx-auto w-full" style={{maxWidth:mobile ? 360 : undefined}}>
      <CoverSceneContent {...props} mobile={mobile} />
    </div>
  </div>;
}
