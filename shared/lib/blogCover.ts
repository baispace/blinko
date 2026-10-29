/**
 * 博客封面的跨布局适配：共享常量与裁切数学。
 *
 * 思路参考飞书的「底图 + 主体安全区域」：
 *   - 源图统一 1600×900，一个账号的所有展示位共用同一张源图；
 *   - 居中的 1280×450 是核心内容区（短标题 + 插画主体），
 *     任何展示位裁切都不允许切到它；
 *   - 渐变背景、几何图形、辅助装饰可以铺满画布，裁掉也不影响理解。
 *
 * 服务端合成、公开站渲染、后台预览三处共用这一份定义，
 * 免得「后台预览」和「线上效果」变成两套标准。
 *
 * 这套尺寸是本博客自己的设计约定，不是飞书的原始规范。
 */

/** 封面源图：统一 1600×900（16:9）。 */
export const COVER_SOURCE = { width: 1600, height: 900 } as const;

/** 核心内容区：源图居中的 1280×450。 */
export const COVER_SAFE = { width: 1280, height: 450 } as const;

/** 核心内容区在源图坐标里的矩形。 */
export const coverSafeRect = {
  left: (COVER_SOURCE.width - COVER_SAFE.width) / 2,
  top: (COVER_SOURCE.height - COVER_SAFE.height) / 2,
  width: COVER_SAFE.width,
  height: COVER_SAFE.height,
  get right() {
    return this.left + this.width;
  },
  get bottom() {
    return this.top + this.height;
  },
};

export type CoverPlacementKey = "double" | "single" | "banner";

export type CoverPlacement = {
  key: CoverPlacementKey;
  label: string;
  /** 展示位的宽高比（宽 / 高）。 */
  ratio: number;
  /** 这个展示位在公开站对应什么位置。 */
  hint: string;
};

/**
 * 公开站真正用到的三个展示位。
 *
 * 比例不是随便定的：
 *   double  首页两栏布局里的头条大图（.ink-lead-hero）
 *   single  卡片与列表的缩略图（.ink-post-cover）
 *   banner  顶部横幅位，窄屏沿用同一比例
 */
export const coverPlacements: Record<CoverPlacementKey, CoverPlacement> = {
  double: {
    key: "double",
    label: "双栏",
    ratio: 2.8,
    hint: "首页两栏布局的头条大图",
  },
  single: {
    key: "single",
    label: "单栏",
    ratio: 16 / 9,
    hint: "卡片与列表的缩略图",
  },
  banner: {
    key: "banner",
    label: "Banner",
    ratio: 2.9,
    hint: "顶部横幅位，窄屏沿用同一比例",
  },
};

export const coverPlacementKeys: CoverPlacementKey[] = [
  "double",
  "single",
  "banner",
];

/** 裁切位置：对应 CSS object-position 的百分比。 */
export type CoverFocusValue = { x: number; y: number };

export const defaultCoverFocus: CoverFocusValue = { x: 50, y: 50 };

/**
 * 每个展示位各存一份裁切位置。
 * sourceId 记着这份裁切是针对哪张源图调的 —— 换源图后对不上，
 * 公开站就当没调过（回到居中），后台也会显示为已重置。
 */
export type CoverFocus = {
  sourceId: number | null;
  placements: Partial<Record<CoverPlacementKey, CoverFocusValue>>;
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 某个展示位下，源图会被裁出来的那一块（源图坐标）。
 *
 * object-fit: cover 会把图缩放到盖满展示位，所以：
 *   - 展示位比源图更宽 → 整幅宽都露出来，上下裁；
 *   - 展示位比源图更高 → 整幅高都露出来，左右裁。
 */
export function coverWindow(ratio: number) {
  const sourceRatio = COVER_SOURCE.width / COVER_SOURCE.height;
  if (ratio >= sourceRatio) {
    const height = COVER_SOURCE.width / ratio;
    return {
      width: COVER_SOURCE.width,
      height,
      slackX: 0,
      slackY: COVER_SOURCE.height - height,
    };
  }
  const width = COVER_SOURCE.height * ratio;
  return {
    width,
    height: COVER_SOURCE.height,
    slackX: COVER_SOURCE.width - width,
    slackY: 0,
  };
}

/**
 * 裁切位置能拖到的范围。
 *
 * object-position 的百分比对应「可见窗口在源图里挪了多少」，
 * 所以窗口必须始终把核心内容区整个包住 —— 这就是「主体安全区域」。
 */
export function coverFocusRange(ratio: number) {
  const win = coverWindow(ratio);
  const x =
    win.slackX > 0
      ? {
          min: Math.max(
            0,
            ((coverSafeRect.right - win.width) / win.slackX) * 100,
          ),
          max: Math.min(100, (coverSafeRect.left / win.slackX) * 100),
        }
      : { min: 50, max: 50 };
  const y =
    win.slackY > 0
      ? {
          min: Math.max(
            0,
            ((coverSafeRect.bottom - win.height) / win.slackY) * 100,
          ),
          max: Math.min(100, (coverSafeRect.top / win.slackY) * 100),
        }
      : { min: 50, max: 50 };
  return { x, y };
}

/** 把拖出来的位置夹回合法范围，保证核心内容区不被切到。 */
export function clampCoverFocus(
  ratio: number,
  focus: CoverFocusValue | undefined,
): CoverFocusValue {
  const range = coverFocusRange(ratio);
  const value = focus ?? defaultCoverFocus;
  return {
    x: clamp(value.x, range.x.min, range.x.max),
    y: clamp(value.y, range.y.min, range.y.max),
  };
}

/** 读某个展示位的裁切位置；没调过就是居中。 */
export function readCoverFocus(
  focus: CoverFocus | null | undefined,
  placement: CoverPlacementKey,
): CoverFocusValue {
  return clampCoverFocus(
    coverPlacements[placement].ratio,
    focus?.placements?.[placement],
  );
}

/**
 * 拖动换算：框里挪了 dx / dy 像素（向右下为正），
 * 换算成源图里的位移，再折成 object-position 的百分比。
 *
 * 框越大、源图越小，同样的鼠标位移对应的源图位移越小 ——
 * 所以这里要按「可见窗口 ↔ 框」的比例换算，不能直接拿像素当百分比。
 */
export function coverFocusFromDrag(
  ratio: number,
  focus: CoverFocusValue,
  dx: number,
  dy: number,
  boxWidth: number,
  boxHeight: number,
): CoverFocusValue {
  const win = coverWindow(ratio);
  if (!boxWidth || !boxHeight) return focus;
  const scaleX = win.width / boxWidth;
  const scaleY = win.height / boxHeight;
  const x =
    win.slackX > 0 ? focus.x - ((dx * scaleX) / win.slackX) * 100 : focus.x;
  const y =
    win.slackY > 0 ? focus.y - ((dy * scaleY) / win.slackY) * 100 : focus.y;
  return clampCoverFocus(ratio, { x, y });
}

/** 归一化后端传进来的裁切数据，脏数据一律回落到居中。 */
export function normalizeCoverFocus(
  value: unknown,
): CoverFocus | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CoverFocus>;
  const sourceId =
    typeof raw.sourceId === "number" && Number.isFinite(raw.sourceId)
      ? raw.sourceId
      : null;
  const placements: Partial<Record<CoverPlacementKey, CoverFocusValue>> = {};
  const input = (raw.placements ?? {}) as Record<string, unknown>;
  for (const key of coverPlacementKeys) {
    const item = input[key];
    if (!item || typeof item !== "object") continue;
    const point = item as Partial<CoverFocusValue>;
    if (typeof point.x !== "number" || typeof point.y !== "number") continue;
    placements[key] = clampCoverFocus(coverPlacements[key].ratio, {
      x: point.x,
      y: point.y,
    });
  }
  return { sourceId, placements };
}
