import { Prisma, type PrismaClient } from "@prisma/client";
import { readBlogSiteSettings } from "./blogSiteSettings";
import { publicPublicationWhere } from "./publication";
import {
  readPublicStatsRangeCache,
  readStalePublicStatsRangeCache,
  writePublicStatsRangeCache,
} from "./blogPublicStatsCache";
import {
  dayKeyInZone,
  formatDayText,
  formatMonthText,
  monthKeyInZone,
  safeTimeZone,
  shiftDayInZone,
  startOfDayInZone,
} from "../../shared/lib/blogTime";
import {
  STATS_RANGE_DAYS,
  STATS_RANGE_GRANULARITY,
  STATS_RANGE_LABEL,
  type PublicStatsPage,
  type StatsRange,
  type StatsTrendPoint,
} from "../../shared/lib/blogStatsPage";
import { REACTION_KINDS } from "../../shared/lib/blogInteraction";

/**
 * 公开「站点数据」页的汇总。
 *
 * 这一页和关于页那张数据卡片不是一回事：这里能按周期看一段时间里的
 * 阅读、访客与回应，所以口径要分清「累计」和「区间」两类。
 *
 * 采集侧的事实已经在库里了，这里不新建任何统计：
 *   blogPageView          一次有效阅读一行（采集时已按设备 30 分钟滑动窗口去重）
 *   blogArticleReaction   一条有效回应一行（唯一约束保证同一访客同一篇只有一种）
 *   blogPublicationHistory 每次发布一版一行（发布事件的可靠来源）
 *
 * 四条硬规矩：
 *   1. 只统计当前公开可访问的内容 —— 撤回的文章立刻退出汇总；
 *   2. 区间访客是「整段区间去重」，不是每日访客相加；
 *   3. 汇总在服务端完成，公开接口不返回任何设备标识或原始事件；
 *   4. 口径写进 notes，与实现同源 —— 说明里不写做不到的事。
 */

/** 阅读去重窗口（分钟），与采集侧一致。 */
const DEDUPE_WINDOW_MINUTES = 30;

/* -------------------------------------------------------------------------- */
/* 区间                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * 区间起点：今天在内的第 N 个自然日的 00:00（站点时区）。
 * 终点是「现在」—— 今天的数据截至本次聚合时刻。
 */
function periodStart(range: StatsRange, now: Date, timeZone: string) {
  const days = STATS_RANGE_DAYS[range];
  return shiftDayInZone(now, -(days - 1), timeZone);
}

/* -------------------------------------------------------------------------- */
/* 持续记录                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * 持续记录时长：满一个日历月按月算，不足按天算。
 *
 * 月数按日历算（不是天数除以 30），并且不因「更新发布」重置起点 ——
 * 起点取的是最早一篇公开文章的首次发布时间。
 */
export function recordSpan(
  firstPublishedAt: Date | null,
  now: Date,
  timeZone: string,
): { value: number; unit: "天" | "个月" } {
  if (!firstPublishedAt) return { value: 0, unit: "天" };
  const start = startOfDayInZone(firstPublishedAt, timeZone);
  const end = startOfDayInZone(now, timeZone);
  const days = Math.max(
    0,
    Math.round(
      (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );
  const first = dayKeyInZone(start, timeZone).split("-").map(Number);
  const last = dayKeyInZone(end, timeZone).split("-").map(Number);
  let months =
    (last[0] - first[0]) * 12 + (last[1] - first[1]);
  // 还没过完这个月的同一天，就还没满一个整月。
  if (last[2] < first[2]) months -= 1;
  if (months >= 1) return { value: months, unit: "个月" };
  return { value: days, unit: "天" };
}

/* -------------------------------------------------------------------------- */
/* 汇总                                                                       */
/* -------------------------------------------------------------------------- */

type BucketRow = { key: string; views: bigint; visitors: bigint };
type TotalRow = { views: bigint; visitors: bigint };

export async function publicStatsPage(
  db: PrismaClient,
  accountId: number,
  range: StatsRange,
): Promise<PublicStatsPage> {
  const cached = readPublicStatsRangeCache<PublicStatsPage>(accountId, range);
  if (cached) return cached;

  try {
    const payload = await aggregatePublicStatsPage(db, accountId, range);
    writePublicStatsRangeCache(accountId, range, payload);
    return payload;
  } catch (error) {
    // 聚合失败时退回上一份结果（可能已经过期），并明确标记 stale ——
    // 页面会带上那份数据的真实时间，不会把它当成实时数据。
    const fallback = readStalePublicStatsRangeCache<PublicStatsPage>(
      accountId,
      range,
    );
    if (fallback) return { ...fallback.value, stale: true };
    throw error;
  }
}

/**
 * 真正的聚合过程。
 *
 * 单独拆出来是为了让 publicStatsPage 能把「聚合失败」和「读取缓存」分开处理：
 * 读缓存失败没有降级空间，聚合失败才有（退回旧数据并标记 stale）。
 */
async function aggregatePublicStatsPage(
  db: PrismaClient,
  accountId: number,
  range: StatsRange,
): Promise<PublicStatsPage> {
  const settings = await readBlogSiteSettings(db, accountId);
  const timeZone = safeTimeZone(settings.data.timezone);
  const now = new Date();
  const from = periodStart(range, now, timeZone);
  const granularity = STATS_RANGE_GRANULARITY[range];

  // 公开内容集合：区间内的阅读、回应、热门文章都只认这些文章。
  const [totals, buckets, reactionRows, hotRows, articles, topics, updatedIn30Days, firstPublished, earliest, history] =
    await Promise.all([
      // 区间总量：访客是整段区间去重，不是每日相加。
      db.$queryRaw<TotalRow[]>`
        SELECT COUNT(*)::bigint AS "views",
               COUNT(DISTINCT v."deviceId")::bigint AS "visitors"
        FROM "blogPageView" v
        JOIN notes n ON n."id" = v."noteId"
        WHERE v."accountId" = ${accountId}
          AND v."createdAt" >= ${from}
          AND v."createdAt" <= ${now}
          AND n."accountId" = ${accountId}
          AND n."isPublished" = true
          AND n."isRecycle" = false
          AND EXISTS (SELECT 1 FROM "notePublication" p WHERE p."noteId" = n."id")
      `,
      // 趋势：按站点时区分桶，近一年按月。
      db.$queryRaw<BucketRow[]>`
        SELECT to_char(${
          granularity === "month"
            ? Prisma.sql`date_trunc('month', v."createdAt" AT TIME ZONE ${timeZone})`
            : Prisma.sql`date_trunc('day', v."createdAt" AT TIME ZONE ${timeZone})`
        }, ${
          granularity === "month" ? "YYYY-MM" : "YYYY-MM-DD"
        }) AS "key",
               COUNT(*)::bigint AS "views",
               COUNT(DISTINCT v."deviceId")::bigint AS "visitors"
        FROM "blogPageView" v
        JOIN notes n ON n."id" = v."noteId"
        WHERE v."accountId" = ${accountId}
          AND v."createdAt" >= ${from}
          AND v."createdAt" <= ${now}
          AND n."accountId" = ${accountId}
          AND n."isPublished" = true
          AND n."isRecycle" = false
          AND EXISTS (SELECT 1 FROM "notePublication" p WHERE p."noteId" = n."id")
        GROUP BY 1 ORDER BY 1
      `,
      // 回应：createdAt 是「第一次回应的时刻」—— 切换类型不刷新它，
      // 取消后重新回应会新建一行（新的创建时间）。
      db.blogArticleReaction.groupBy({
        by: ["kind"],
        where: {
          accountId,
          createdAt: { gte: from, lte: now },
          note: { ...publicPublicationWhere },
        },
        _count: { _all: true },
      }),
      // 热门文章：区间内有效阅读降序，同值按文章 id 升序（顺序稳定）。
      db.$queryRaw<{ noteId: number; views: bigint }[]>`
        SELECT v."noteId", COUNT(*)::bigint AS "views"
        FROM "blogPageView" v
        JOIN notes n ON n."id" = v."noteId"
        WHERE v."accountId" = ${accountId}
          AND v."createdAt" >= ${from}
          AND v."createdAt" <= ${now}
          AND n."accountId" = ${accountId}
          AND n."isPublished" = true
          AND n."isRecycle" = false
          AND EXISTS (SELECT 1 FROM "notePublication" p WHERE p."noteId" = n."id")
        GROUP BY v."noteId"
        ORDER BY "views" DESC, v."noteId" ASC
        LIMIT 5
      `,
      db.notes.count({ where: { ...publicPublicationWhere, accountId } }),
      db.blogTopic.count({ where: { accountId, isPublished: true } }),
      // 近 30 天更新：只认真正发布过的版本（保存草稿不写这张表）。
      db.blogPublicationHistory.findMany({
        where: {
          publishedAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            lte: now,
          },
          note: { ...publicPublicationWhere, accountId },
        },
        select: { noteId: true },
        distinct: ["noteId"],
      }),
      db.notePublication.aggregate({
        where: { note: { ...publicPublicationWhere, accountId } },
        _min: { createdAt: true },
      }),
      // 最早可统计时间：阅读与回应里更早的那个；
      // 另外单独取最早的一次阅读 —— 趋势图的「可统计窗口」按它算。
      db.$queryRaw<{ at: Date | null; viewsAt: Date | null }[]>`
        SELECT LEAST(
          (SELECT MIN("createdAt") FROM "blogPageView" WHERE "accountId" = ${accountId}),
          (SELECT MIN("createdAt") FROM "blogArticleReaction" WHERE "accountId" = ${accountId})
        ) AS "at",
        (SELECT MIN("createdAt") FROM "blogPageView" WHERE "accountId" = ${accountId}) AS "viewsAt"
      `,
      // 最近更新：发布历史是可靠的事件来源（每次发布一版一行）。
      db.blogPublicationHistory.findMany({
        where: {
          publishedAt: { lte: now },
          note: { ...publicPublicationWhere, accountId },
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: 20,
        select: {
          id: true,
          noteId: true,
          revision: true,
          title: true,
          summary: true,
          publishedAt: true,
          note: { select: { publishId: true, publication: { select: { title: true, summary: true } } } },
        },
      }),
    ]);

  /* ---------------- 趋势 ---------------- */
  const bucketMap = new Map(buckets.map((b) => [b.key, b]));
  // 最早的一次有效阅读决定「可统计窗口」：早于它的桶不是 0，而是当时还没有数据。
  const viewsSince = earliest[0]?.viewsAt ?? null;
  const coveredFromKey = viewsSince
    ? granularity === "month"
      ? monthKeyInZone(viewsSince, timeZone)
      : dayKeyInZone(viewsSince, timeZone)
    : null;
  const points: StatsTrendPoint[] = [];
  if (granularity === "day") {
    const days = STATS_RANGE_DAYS[range];
    for (let i = 0; i < days; i++) {
      const day = shiftDayInZone(from, i, timeZone);
      const key = dayKeyInZone(day, timeZone);
      const hit = bucketMap.get(key);
      points.push({
        key,
        label: formatDayText(key).slice(5).replace(".", "/"),
        views: hit ? Number(hit.views) : 0,
        visitors: hit ? Number(hit.visitors) : 0,
        covered: coveredFromKey ? key >= coveredFromKey : false,
      });
    }
  } else {
    // 近一年按月补齐：上一年同月到本月，逐月列出。
    const first = dayKeyInZone(from, timeZone).split("-").map(Number);
    const last = dayKeyInZone(now, timeZone).split("-").map(Number);
    let year = first[0];
    let month = first[1];
    const endYear = last[0];
    const endMonth = last[1];
    while (year < endYear || (year === endYear && month <= endMonth)) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      const hit = bucketMap.get(key);
      points.push({
        key,
        label: `${month}月`,
        views: hit ? Number(hit.views) : 0,
        visitors: hit ? Number(hit.visitors) : 0,
        covered: coveredFromKey ? key >= coveredFromKey : false,
      });
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  /* ---------------- 热门文章 ---------------- */
  const hotIds = hotRows.map((r) => r.noteId);
  const hotNotes = hotIds.length
    ? await db.notes.findMany({
        where: { id: { in: hotIds } },
        select: {
          id: true,
          publishId: true,
          publication: {
            select: {
              title: true,
              summary: true,
              content: true,
              createdAt: true,
              coverAttachment: { select: { path: true } },
            },
          },
          blogTopics: {
            where: { topic: { isPublished: true } },
            orderBy: { topic: { sortOrder: "asc" as const } },
            take: 1,
            select: { topic: { select: { name: true } } },
          },
        },
      })
    : [];
  const hotById = new Map(hotNotes.map((n) => [n.id, n]));
  const hot = hotRows
    .map((row) => {
      const note = hotById.get(row.noteId);
      if (!note || !note.publishId || !note.publication) return null;
      const publication = note.publication;
      const title = (
        publication.title ||
        publication.summary ||
        "无标题"
      ).trim();
      return {
        publishId: note.publishId,
        title,
        coverUrl: publication.coverAttachment?.path ?? null,
        topicName: note.blogTopics[0]?.topic.name ?? null,
        publishedAt: publication.createdAt.toISOString(),
        views: Number(row.views),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  /* ---------------- 回应分布 ---------------- */
  const counts = new Map<string, number>();
  for (const row of reactionRows) counts.set(row.kind, row._count._all);
  const reactionTotal = REACTION_KINDS.reduce(
    (sum, kind) => sum + (counts.get(kind) ?? 0),
    0,
  );
  const reactions = REACTION_KINDS.map((kind) => {
    const count = counts.get(kind) ?? 0;
    return {
      kind,
      count,
      percent: reactionTotal ? count / reactionTotal : 0,
    };
  });

  /* ---------------- 最近更新 ---------------- */
  const seenNotes = new Set<number>();
  const recent: PublicStatsPage["recent"] = [];
  for (const row of history) {
    if (seenNotes.has(row.noteId)) continue;
    seenNotes.add(row.noteId);
    const publishId = row.note.publishId;
    if (!publishId) continue;
    const title = (row.note.publication?.title || row.title || "无标题").trim();
    const summary = (row.note.publication?.summary || row.summary || "").trim();
    recent.push({
      id: row.id,
      type: row.revision <= 1 ? "publish" : "update",
      title,
      summary,
      at: row.publishedAt.toISOString(),
      href: `/blog/${publishId}`,
    });
    if (recent.length >= 3) break;
  }

  /* ---------------- 累计内容积累 ---------------- */
  const first = firstPublished._min.createdAt ?? null;
  const record = recordSpan(first, now, timeZone);
  const dataSince = earliest[0]?.at ?? null;

  const payload: PublicStatsPage = {
    range,
    rangeLabel: STATS_RANGE_LABEL[range],
    period: {
      from: formatDayText(dayKeyInZone(from, timeZone)),
      to: formatDayText(dayKeyInZone(now, timeZone)),
    },
    granularity,
    generatedAt: now.toISOString(),
    timezone: timeZone,
    stale: false,
    dataSince: dataSince ? dataSince.toISOString() : null,
    content: {
      articles,
      topics,
      updatedIn30Days: updatedIn30Days.length,
      recordValue: record.value,
      recordUnit: record.unit,
      recordSince: first ? first.toISOString() : null,
    },
    reading: {
      views: Number(totals[0]?.views ?? 0),
      visitors: Number(totals[0]?.visitors ?? 0),
      reactions: reactionTotal,
    },
    trend: { granularity, points },
    hot,
    reactions,
    recent,
    notes: statsNotes(timeZone, dataSince),
  };

  return payload;
}

/**
 * 统计说明：与服务端实现同源。
 *
 * 写在这里的每一条都必须是代码里真的做到的 ——
 * 没实现的排除规则不写，避免页面替实现吹牛。
 */
function statsNotes(timeZone: string, dataSince: Date | null) {
  return [
    {
      label: "内容",
      text: "只统计当前公开可访问的文章与专题。私有笔记、回收站里的内容与已撤回的文章都不在汇总里；保存草稿不会改变任何数字。",
    },
    {
      label: "阅读",
      text: `一次有效阅读 = 公开文章详情页被打开并被记录。同一匿名浏览器对同一篇文章 ${DEDUPE_WINDOW_MINUTES} 分钟内重复打开只记一次，刷新不重复计数；列表曝光、预加载与后台预览不计入。`,
    },
    {
      label: "访客",
      text: "独立访客 = 区间内发生过有效阅读的去重匿名浏览器标识数量。它不等于自然人人数：跨设备、跨浏览器或清理站点存储后可能被视为不同访客。区间访客是整段区间去重，不是每日访客相加。",
    },
    {
      label: "回应",
      text: "只统计「有启发 / 很实用 / 有共鸣」三类公开回应。同一访客对同一篇最多保留一种回应，切换类型不会增加总数，取消后从有效回应中扣除；私密反馈与作者回复不计入。",
    },
    {
      label: "隐私",
      text: "只公开汇总数字，不公开任何访客标识、访问明细或来源清单。开启统计的管理浏览器与本地调试默认不上报。",
    },
    {
      label: "时间",
      text: `所有区间按站点时区 ${timeZone} 的自然日切分，数据更新时间为聚合时刻${
        dataSince ? `，可统计数据自 ${formatDayText(dayKeyInZone(dataSince, timeZone))} 起` : ""
      }。汇总按分钟级缓存，撤回内容后缓存会立即失效。`,
    },
  ];
}
