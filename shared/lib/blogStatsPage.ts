/**
 * 公开「站点数据」页的周期口径。
 *
 * 页面上的三个周期是一组固定选项，前后端共用这一份定义：
 * 前端用它渲染切换器，后端用它算区间起点。
 *
 * 天数含今天：近 7 天 = 今天在内的 7 个自然日。
 * 区间按站点时区切分，边界由服务端算好后下发，前端不自己推算。
 */

export const STATS_RANGES = ["7d", "30d", "1y"] as const;

export type StatsRange = (typeof STATS_RANGES)[number];

/** 切换器上的文案。 */
export const STATS_RANGE_LABEL: Record<StatsRange, string> = {
  "7d": "近 7 天",
  "30d": "近 30 天",
  "1y": "近一年",
};

/** 每个周期覆盖的自然日数（含今天）。 */
export const STATS_RANGE_DAYS: Record<StatsRange, number> = {
  "7d": 7,
  "30d": 30,
  "1y": 365,
};

/** 趋势图的聚合粒度：近一年按月，其余按日。 */
export const STATS_RANGE_GRANULARITY: Record<StatsRange, "day" | "month"> = {
  "7d": "day",
  "30d": "day",
  "1y": "month",
};

export function isStatsRange(value: unknown): value is StatsRange {
  return (
    typeof value === "string" &&
    (STATS_RANGES as readonly string[]).includes(value)
  );
}

/** 三类回应的展示顺序与名称（与 shared/lib/blogInteraction 的取值一致）。 */
export const STATS_REACTION_LABEL: Record<string, string> = {
  inspired: "有启发",
  useful: "很实用",
  resonant: "有共鸣",
};

/** 三类回应在页面上的图标（本地图标库里有，且都在 tabler 集合内）。 */
export const STATS_REACTION_ICON: Record<string, string> = {
  inspired: "tabler:bulb",
  useful: "tabler:circle-check",
  resonant: "tabler:heart",
};

/* -------------------------------------------------------------------------- */
/* 公开汇总的数据形状                                                         */
/* -------------------------------------------------------------------------- */

/**
 * 趋势图上的一个点。
 *
 * 类型放在 shared 里，前后端共用一份 ——
 * 服务端负责填，前端负责画，两边不会各写各的。
 */
export type StatsTrendPoint = {
  /** "2026-10-25"（按日）或 "2026-10"（按月）。 */
  key: string;
  /** 图表上的短标签。 */
  label: string;
  /** 该时间桶内的有效阅读次数。 */
  views: number;
  /** 该时间桶内去重后的匿名访客数。 */
  visitors: number;
  /**
   * 这个时间桶是否落在「可统计窗口」内。
   *
   * false 表示这个桶早于最早一条统计数据 —— 那不是「0 次阅读」，
   * 而是「当时还没有数据」。图表据此断开曲线，不拿 0 去冒充。
   */
  covered: boolean;
};

/** 公开「站点数据」接口返回的汇总。 */
export type PublicStatsPage = {
  range: StatsRange;
  rangeLabel: string;
  /** 区间起止（站点时区的自然日）。 */
  period: { from: string; to: string };
  /** 趋势粒度。 */
  granularity: "day" | "month";
  /** 这份汇总的计算时间（ISO）。 */
  generatedAt: string;
  /** 站点时区。 */
  timezone: string;
  /** 结果来自过期缓存（展示的是旧数据，但带明确时间）。 */
  stale: boolean;
  /** 最早可统计的事件时间（ISO）—— 早于它没有数据，不补零。 */
  dataSince: string | null;
  /** 累计内容积累（不随周期切换）。 */
  content: {
    articles: number;
    topics: number;
    updatedIn30Days: number;
    /** 持续记录：不足一个月显示天数，满一个月显示日历月数。 */
    recordValue: number;
    recordUnit: "天" | "个月";
    recordSince: string | null;
  };
  /** 区间内的阅读与互动。 */
  reading: {
    views: number;
    visitors: number;
    reactions: number;
  };
  trend: { granularity: "day" | "month"; points: StatsTrendPoint[] };
  /** 区间内读得最多的文章（最多 5 篇）。 */
  hot: {
    publishId: string;
    title: string;
    coverUrl: string | null;
    topicName: string | null;
    publishedAt: string;
    views: number;
  }[];
  /** 三类回应的数量与占比。 */
  reactions: {
    kind: "inspired" | "useful" | "resonant";
    count: number;
    percent: number;
  }[];
  /** 最近 3 条真实公开更新记录。 */
  recent: {
    id: number;
    type: "publish" | "update";
    title: string;
    summary: string;
    at: string;
    href: string;
  }[];
  /** 统计说明（与服务端实现同源，不会写着做不到的事）。 */
  notes: { label: string; text: string }[];
};
