import { CoverCanvas } from "./CoverCanvas";
import type { CoverTextConfig } from "@shared/lib/blogCoverText";

/**
 * 封面在各展示位上的真实预览。
 *
 * 一张底图会被裁成好几种样子，单独看一张大图判断不了：
 *   - 首页 Banner：2.9:1，标题贴左下角，底下还要给状态行让位；
 *   - 瀑布流卡片：2.8:1，封面在卡片顶部，下面是标题和摘要；
 *   - 列表行：180×96 的小缩略图，标题会缩到能读的下限，副标题直接不显示；
 *   - 分享图：1200×630，标题居中偏左。
 *
 * 所以这里不是「把同一张图缩放几次」，而是每个场景都用公开站真正的尺寸与版式
 * 把封面放回它该在的位置 —— 排版规则（字号、断行、副标题显隐）由 CoverCanvas
 * 按容器实际像素算出来，所以预览里看到的就是线上那一张。
 */

export type CoverPreviewSceneKey = "banner" | "double" | "single" | "share";

export const COVER_PREVIEW_SCENES: {
  key: CoverPreviewSceneKey;
  label: string;
  note: string;
}[] = [
  { key: "banner", label: "首页 Banner", note: "桌面首页横幅 2.9:1，标题贴左下角" },
  { key: "double", label: "瀑布流卡片", note: "首页卡片网格大图 2.8:1，封面在卡片顶部" },
  { key: "single", label: "列表行", note: "列表与相关推荐缩略图 180×96，标题缩到最小可读" },
  { key: "share", label: "分享图", note: "社交分享卡片 1200×630" },
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
export function CoverScenePreview({
  scene,
  src,
  title,
  excerpt,
  config,
}: {
  scene: CoverPreviewSceneKey;
  src: string;
  /** 卡片/列表里那篇文章的标题；封面上的大字单独由 config 决定。 */
  title?: string;
  excerpt?: string;
  config: CoverTextConfig | null;
}) {
  const cover = (ratio: string, className?: string) => (
    <div
      className={`w-full overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: ratio }}
    >
      <CoverCanvas src={src} config={config} placement={scene} loading="eager" />
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
        <div className="h-24 w-[180px] shrink-0 overflow-hidden rounded-lg">
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
