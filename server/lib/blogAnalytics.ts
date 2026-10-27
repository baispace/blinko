import { Prisma, type PrismaClient } from "@prisma/client";
import {
  TRAFFIC_SOURCES,
  type TrafficSource,
  SOURCE_LABELS,
} from "./blogAttribution";

/**
 * 博客统计的时间口径。
 *
 * 统一用 Asia/Shanghai 展示与分日：边界是「起始日 00:00」到「结束日次日 00:00」
 * 的半开区间，所以自定义结束日期包含当天。
 *
 * 注意 Asia/Shanghai 自 1991 年起不再使用夏令时，固定 UTC+8 与真实时区一致；
 * 真正需要时区语义的地方（分日聚合）在 SQL 里用 AT TIME ZONE 让 Postgres 处理。
 */
export const ANALYTICS_TZ = "Asia/Shanghai";
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 自定义范围最多回溯一年，避免一次查询把明细表全扫一遍。 */
export const MAX_RANGE_DAYS = 366;

export type AnalyticsPreset = "today" | "7d" | "30d";
export type Granularity = "day" | "week" | "month";

export type AnalyticsRange = {
  /** 起始日（含），YYYY-MM-DD */
  from: string;
  /** 结束日（含），YYYY-MM-DD */
  to: string;
  /** 含首尾的天数 */
  days: number;
  granularity: Granularity;
  /** 起始日 00:00（UTC+8）对应的 UTC 时刻 */
  start: Date;
  /** 结束日次日 00:00（UTC+8）对应的 UTC 时刻，区间右开 */
  endExclusive: Date;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shanghaiToday(now: Date): string {
  return new Date(now.getTime() + SHANGHAI_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
}

function shiftDay(day: string, delta: number): string {
  const t = Date.parse(day + "T00:00:00Z");
  return new Date(t + delta * 86400000).toISOString().slice(0, 10);
}

function dayCount(from: string, to: string): number {
  return (
    Math.round(
      (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
        86400000,
    ) + 1
  );
}

function granularityOf(days: number): Granularity {
  if (days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

export class AnalyticsRangeError extends Error {}

/**
 * 解析时间范围。
 *
 * 预设与自定义都走同一个出口 —— 页面上顶部指标、趋势、来源、文章表
 * 共用这一份范围，不会出现「顶部是近 7 天、下面却是累计」。
 */
export function resolveAnalyticsRange(
  input: { preset?: string; from?: string; to?: string },
  now = new Date(),
): AnalyticsRange {
  const today = shanghaiToday(now);
  let from: string;
  let to: string;

  const preset = (input.preset ?? "").trim();
  if (preset) {
    if (preset === "today") {
      from = today;
      to = today;
    } else if (preset === "7d") {
      from = shiftDay(today, -6);
      to = today;
    } else if (preset === "30d") {
      from = shiftDay(today, -29);
      to = today;
    } else {
      throw new AnalyticsRangeError("不支持的时间范围");
    }
  } else {
    const rawFrom = (input.from ?? "").trim();
    const rawTo = (input.to ?? "").trim();
    if (!DATE_RE.test(rawFrom) || !DATE_RE.test(rawTo))
      throw new AnalyticsRangeError("请选择完整的开始与结束日期");
    from = rawFrom;
    to = rawTo;
    if (dayCount(from, to) <= 0)
      throw new AnalyticsRangeError("结束日期不能早于开始日期");
    if (dayCount(from, to) > MAX_RANGE_DAYS)
      throw new AnalyticsRangeError(
        `自定义范围最多 ${MAX_RANGE_DAYS} 天，请缩小区间`,
      );
  }

  const days = dayCount(from, to);
  return {
    from,
    to,
    days,
    granularity: granularityOf(days),
    start: new Date(Date.parse(from + "T00:00:00+08:00")),
    endExclusive: new Date(Date.parse(to + "T00:00:00+08:00") + 86400000),
  };
}

export type AnalyticsMetrics = {
  /** 阅读次数：公开文章详情页的有效阅读事件（服务端已按窗口去重） */
  views: number;
  /** 访客数：范围内跨文章去重的匿名浏览器数 */
  visitors: number;
  /** 列表曝光：文章在公开列表中实际可见的曝光事件 */
  impressions: number;
  /** 列表点击：从站内列表进入文章的点击事件 */
  clicks: number;
  /** 文章点击率 = 列表点击 ÷ 列表曝光；曝光为 0 时为 null（展示为「—」） */
  ctr: number | null;
};

export type TrendPoint = {
  /** 桶起始日，YYYY-MM-DD */
  bucket: string;
  views: number;
  visitors: number;
};

export type SourceBreakdown = {
  source: TrafficSource;
  label: string;
  views: number;
  visitors: number;
  /** 占全部阅读的比例（0~1） */
  share: number;
};

export type AnalyticsOverview = {
  range: {
    from: string;
    to: string;
    days: number;
    granularity: Granularity;
    timezone: string;
  };
  metrics: AnalyticsMetrics;
  trend: TrendPoint[];
  sources: SourceBreakdown[];
};

type RawCount = { views: bigint; visitors: bigint };
type RawSignal = { kind: string; cnt: bigint };
type RawTrend = { bucket: string; views: bigint; visitors: bigint };
type RawSource = { source: string; views: bigint; visitors: bigint };

const TRUNC_SQL: Record<Granularity, string> = {
  day: "date_trunc('day', \"createdAt\" AT TIME ZONE 'Asia/Shanghai')",
  week: "date_trunc('week', \"createdAt\" AT TIME ZONE 'Asia/Shanghai')",
  month: "date_trunc('month', \"createdAt\" AT TIME ZONE 'Asia/Shanghai')",
};

/**
 * 范围内的一次性聚合。
 *
 * 只做范围查询 + 聚合，不把事件明细拉到前端：
 *  - 阅读与访客来自 blogPageView（有效阅读事实）
 *  - 曝光与列表点击来自 blogRecommendationEvent（站内列表信号）
 *  - 访客数按范围内 COUNT(DISTINCT deviceId) 算，不是把每日 UV 相加
 */
export async function analyticsOverview(
  db: PrismaClient,
  accountId: number,
  range: AnalyticsRange,
): Promise<AnalyticsOverview> {
  const [reads, signals, trendRows, sourceRows] = await Promise.all([
    db.$queryRaw<RawCount[]>`
      SELECT COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "visitors"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId}
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.endExclusive}
    `,
    db.$queryRaw<RawSignal[]>`
      SELECT "kind", COUNT(*)::bigint AS "cnt"
      FROM "blogRecommendationEvent"
      WHERE "accountId" = ${accountId}
        AND "bucket" >= ${range.start}
        AND "bucket" < ${range.endExclusive}
        AND "kind" IN ('impression', 'click')
      GROUP BY 1
    `,
    db.$queryRaw<RawTrend[]>`
      SELECT to_char(${Prisma.raw(TRUNC_SQL[range.granularity])}, 'YYYY-MM-DD') AS "bucket",
             COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "visitors"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId}
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.endExclusive}
      GROUP BY 1
      ORDER BY 1
    `,
    db.$queryRaw<RawSource[]>`
      SELECT "source",
             COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "visitors"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId}
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.endExclusive}
      GROUP BY 1
    `,
  ]);

  const views = Number(reads[0]?.views ?? 0);
  const visitors = Number(reads[0]?.visitors ?? 0);
  const impressions =
    signals.find((s) => s.kind === "impression")?.cnt ?? 0n;
  const clicks = signals.find((s) => s.kind === "click")?.cnt ?? 0n;
  const impressionCount = Number(impressions);
  const clickCount = Number(clicks);

  const trend = fillTrend(range, trendRows);
  const sources = buildSources(sourceRows, views);

  return {
    range: {
      from: range.from,
      to: range.to,
      days: range.days,
      granularity: range.granularity,
      timezone: ANALYTICS_TZ,
    },
    metrics: {
      views,
      visitors,
      impressions: impressionCount,
      clicks: clickCount,
      // 曝光为 0 时不编造百分比，返回 null 由界面显示「—」。
      ctr: impressionCount > 0 ? clickCount / impressionCount : null,
    },
    trend,
    sources,
  };
}

/** 补齐没有事件的日期/周/月，趋势图上显示 0 而不是断线。 */
function fillTrend(range: AnalyticsRange, rows: RawTrend[]): TrendPoint[] {
  const map = new Map(
    rows.map((r) => [r.bucket, { views: Number(r.views), visitors: Number(r.visitors) }]),
  );
  const out: TrendPoint[] = [];
  if (range.granularity === "day") {
    for (let d = range.from; d <= range.to; d = shiftDay(d, 1))
      out.push({
        bucket: d,
        views: map.get(d)?.views ?? 0,
        visitors: map.get(d)?.visitors ?? 0,
      });
    return out;
  }
  if (range.granularity === "week") {
    // 以范围起始日所在周的周一为起点逐周推进。
    let cursor = range.from;
    const weekday = new Date(
      Date.parse(range.from + "T00:00:00Z"),
    ).getUTCDay();
    cursor = shiftDay(cursor, weekday === 0 ? -6 : 1 - weekday);
    while (cursor <= range.to) {
      const end = shiftDay(cursor, 7);
      let views = 0;
      let visitors = 0;
      const keys = [...map.keys()].filter((k) => k >= cursor && k < end);
      for (const k of keys) {
        views += map.get(k)!.views;
        visitors = Math.max(visitors, map.get(k)!.visitors);
      }
      out.push({ bucket: cursor, views, visitors });
      cursor = end;
    }
    return out;
  }
  const months = new Map<string, { views: number; visitors: number }>();
  for (const [bucket, value] of map) {
    const month = bucket.slice(0, 7) + "-01";
    const current = months.get(month) ?? { views: 0, visitors: 0 };
    current.views += value.views;
    current.visitors += value.visitors;
    months.set(month, current);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({ bucket, ...value }));
}

/**
 * 来源分布。
 *
 * 只按实际采集到的数据出分布：历史没有采集来源的行记在 unknown 下，
 * 不会为了凑满四类去推测其余来源。
 */
function buildSources(rows: RawSource[], totalViews: number): SourceBreakdown[] {
  const known = new Map<string, { views: number; visitors: number }>();
  for (const row of rows) {
    const source = (TRAFFIC_SOURCES as readonly string[]).includes(row.source)
      ? (row.source as TrafficSource)
      : "unknown";
    const current = known.get(source) ?? { views: 0, visitors: 0 };
    current.views += Number(row.views);
    current.visitors += Number(row.visitors);
    known.set(source, current);
  }
  const out: SourceBreakdown[] = [];
  for (const source of TRAFFIC_SOURCES) {
    const value = known.get(source);
    if (!value) continue;
    out.push({
      source,
      label: SOURCE_LABELS[source],
      views: value.views,
      visitors: value.visitors,
      share: totalViews > 0 ? value.views / totalViews : 0,
    });
  }
  return out.sort((a, b) => b.views - a.views);
}

export type ArticleSortKey =
  | "impressions"
  | "clicks"
  | "ctr"
  | "views"
  | "visitors";

export type ArticleRow = {
  noteId: number;
  publishId: string;
  title: string;
  /** 当前是否仍有公开版本（撤回/删除后为 false，历史统计保留） */
  hasPublication: boolean;
  impressions: number;
  clicks: number;
  ctr: number | null;
  views: number;
  visitors: number;
};

export type ArticleTable = {
  rows: ArticleRow[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

const SORT_SQL: Record<ArticleSortKey, string> = {
  impressions: "j.impressions",
  clicks: "j.clicks",
  ctr: "CASE WHEN j.impressions > 0 THEN j.clicks::numeric / j.impressions ELSE NULL END",
  views: "j.views",
  visitors: "j.visitors",
};

export const ARTICLE_SORT_KEYS: ArticleSortKey[] = [
  "impressions",
  "clicks",
  "ctr",
  "views",
  "visitors",
];

/** 转义 LIKE 通配符，用户输入的搜索词按字面量匹配。 */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => "\\" + m);
}

/**
 * 文章表现表。
 *
 * 关联键是稳定的 noteId / publishId，不是标题 —— 换公开标题不会打断历史统计。
 * 排序、搜索、分页都在数据库里做，不把全部文章拉到内存。
 */
export async function analyticsArticles(
  db: PrismaClient,
  accountId: number,
  range: AnalyticsRange,
  options: {
    page?: number;
    pageSize?: number;
    sort?: string;
    q?: string;
  } = {},
): Promise<ArticleTable> {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 10), 1), 50);
  const sortKey: ArticleSortKey = (
    ARTICLE_SORT_KEYS as string[]
  ).includes(options.sort ?? "")
    ? (options.sort as ArticleSortKey)
    : "views";
  const query = (options.q ?? "").trim().slice(0, 60);
  const like = `%${escapeLike(query)}%`;
  const page = Math.max(Math.trunc(options.page ?? 1), 1);

  const base = Prisma.sql`
    WITH events AS (
      SELECT n."id" AS note_id, e."kind" AS kind, COUNT(*)::bigint AS cnt
      FROM "blogRecommendationEvent" e
      JOIN notes n ON n."publishId" = e."publishId"
      WHERE e."accountId" = ${accountId}
        AND e."bucket" >= ${range.start}
        AND e."bucket" < ${range.endExclusive}
        AND e."kind" IN ('impression', 'click')
      GROUP BY 1, 2
    ),
    reads AS (
      SELECT "noteId" AS note_id,
             COUNT(*)::bigint AS views,
             COUNT(DISTINCT "deviceId")::bigint AS visitors
      FROM "blogPageView"
      WHERE "accountId" = ${accountId}
        AND "createdAt" >= ${range.start}
        AND "createdAt" < ${range.endExclusive}
      GROUP BY 1
    ),
    joined AS (
      SELECT n."id" AS note_id,
             COALESCE(MAX(CASE WHEN e.kind = 'impression' THEN e.cnt END), 0)::bigint AS impressions,
             COALESCE(MAX(CASE WHEN e.kind = 'click' THEN e.cnt END), 0)::bigint AS clicks,
             COALESCE(r.views, 0)::bigint AS views,
             COALESCE(r.visitors, 0)::bigint AS visitors
      FROM notes n
      LEFT JOIN events e ON e.note_id = n."id"
      LEFT JOIN reads r ON r.note_id = n."id"
      WHERE n."accountId" = ${accountId}
      GROUP BY 1, r.views, r.visitors
    )
  `;

  const filter = Prisma.sql`
    WHERE (j.impressions > 0 OR j.clicks > 0 OR j.views > 0)
      AND (
        ${query} = ''
        OR COALESCE(p."title", '') ILIKE ${like}
        OR n."publishId" ILIKE ${like}
      )
  `;

  const [rows, totalRows] = await Promise.all([
    db.$queryRaw<
      {
        note_id: number;
        publish_id: string | null;
        title: string | null;
        has_publication: boolean;
        impressions: bigint;
        clicks: bigint;
        views: bigint;
        visitors: bigint;
      }[]
    >`
      ${base}
      SELECT j.note_id AS note_id,
             COALESCE(n."publishId", '') AS publish_id,
             COALESCE(p."title", '') AS title,
             (p."noteId" IS NOT NULL) AS has_publication,
             j.impressions, j.clicks, j.views, j.visitors
      FROM joined j
      JOIN notes n ON n."id" = j.note_id
      LEFT JOIN "notePublication" p ON p."noteId" = j.note_id
      ${filter}
      ORDER BY ${Prisma.raw(SORT_SQL[sortKey])} DESC, j.note_id DESC
      LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
    `,
    db.$queryRaw<{ total: bigint }[]>`
      ${base}
      SELECT COUNT(*)::bigint AS "total"
      FROM joined j
      JOIN notes n ON n."id" = j.note_id
      LEFT JOIN "notePublication" p ON p."noteId" = j.note_id
      ${filter}
    `,
  ]);

  const total = Number(totalRows[0]?.total ?? 0);
  return {
    rows: rows.map((r) => {
      const impressions = Number(r.impressions);
      const clicks = Number(r.clicks);
      return {
        noteId: r.note_id,
        publishId: r.publish_id ?? "",
        title: r.title || "无标题",
        hasPublication: r.has_publication,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : null,
        views: Number(r.views),
        visitors: Number(r.visitors),
      };
    }),
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 单篇文章下钻：范围内的指标与趋势。 */
export async function analyticsArticleDetail(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  range: AnalyticsRange,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    select: {
      id: true,
      publishId: true,
      publication: { select: { title: true } },
      metadata: true,
    },
  });
  if (!note) return null;

  const [reads, signals, trendRows] = await Promise.all([
    db.$queryRaw<RawCount[]>`
      SELECT COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "visitors"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId} AND "noteId" = ${noteId}
        AND "createdAt" >= ${range.start} AND "createdAt" < ${range.endExclusive}
    `,
    db.$queryRaw<RawSignal[]>`
      SELECT "kind", COUNT(*)::bigint AS "cnt"
      FROM "blogRecommendationEvent" e
      JOIN notes n ON n."publishId" = e."publishId"
      WHERE e."accountId" = ${accountId} AND n."id" = ${noteId}
        AND e."bucket" >= ${range.start} AND e."bucket" < ${range.endExclusive}
        AND e."kind" IN ('impression', 'click')
      GROUP BY 1
    `,
    db.$queryRaw<RawTrend[]>`
      SELECT to_char(${Prisma.raw(TRUNC_SQL[range.granularity])}, 'YYYY-MM-DD') AS "bucket",
             COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "visitors"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId} AND "noteId" = ${noteId}
        AND "createdAt" >= ${range.start} AND "createdAt" < ${range.endExclusive}
      GROUP BY 1 ORDER BY 1
    `,
  ]);

  const views = Number(reads[0]?.views ?? 0);
  const impressions = Number(
    signals.find((s) => s.kind === "impression")?.cnt ?? 0n,
  );
  const clicks = Number(signals.find((s) => s.kind === "click")?.cnt ?? 0n);

  return {
    noteId: note.id,
    publishId: note.publishId ?? "",
    title: note.publication?.title?.trim() || "无标题",
    hasPublication: !!note.publication,
    metrics: {
      views,
      visitors: Number(reads[0]?.visitors ?? 0),
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : null,
    },
    trend: fillTrend(range, trendRows),
  };
}
