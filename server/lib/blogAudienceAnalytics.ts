import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import type { AnalyticsRange } from "./blogAnalytics";

/** A visitor means an anonymous browser with a valid article read in the range. */
export async function analyticsAudience(
  db: PrismaClient,
  accountId: number,
  range: AnalyticsRange,
) {
  const base = await db.$queryRaw<any[]>`
 WITH active AS (
  SELECT "deviceId", COUNT(*)::int AS views, COUNT(DISTINCT "noteId")::int AS articles,
   COUNT(DISTINCT ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date)::int AS days,
   MAX("createdAt") AS last_seen
  FROM "blogPageView" WHERE "accountId"=${accountId} AND "createdAt">=${range.start} AND "createdAt"<${range.endExclusive}
  GROUP BY "deviceId"
 ), visitors AS (
  SELECT a.*, (SELECT MIN(p."createdAt") FROM "blogPageView" p WHERE p."accountId"=${accountId} AND p."deviceId"=a."deviceId") AS first_seen
  FROM active a
 )
 SELECT COUNT(*)::int AS total,
  COUNT(*) FILTER (WHERE first_seen >= ${range.start})::int AS new_visitors,
  COUNT(*) FILTER (WHERE first_seen < ${range.start})::int AS returning,
  COALESCE(SUM(views),0)::int AS views,
  COALESCE(AVG(articles),0)::float AS articles_per_visitor,
  COUNT(*) FILTER (WHERE days>1)::int AS multi_day
 FROM visitors`;
  const rows = await db.$queryRaw<any[]>`
 SELECT "deviceId",COUNT(*)::int AS views,COUNT(DISTINCT "noteId")::int AS articles,
 COUNT(DISTINCT ("createdAt" AT TIME ZONE 'Asia/Shanghai')::date)::int AS days,
 MAX("createdAt") AS last_seen,
 (SELECT MIN(p."createdAt") FROM "blogPageView" p WHERE p."accountId"=${accountId} AND p."deviceId"=v."deviceId") AS first_seen
 FROM "blogPageView" v WHERE "accountId"=${accountId} AND "createdAt">=${range.start} AND "createdAt"<${range.endExclusive}
 GROUP BY "deviceId" ORDER BY MAX("createdAt") DESC,"deviceId" LIMIT 20`;
  const m = base[0];
  return {
    visitors: Number(m?.total || 0),
    newVisitors: Number(m?.new_visitors || 0),
    returningVisitors: Number(m?.returning || 0),
    multiDayVisitors: Number(m?.multi_day || 0),
    viewsPerVisitor: m?.total ? Number(m.views) / Number(m.total) : null,
    articlesPerVisitor: Number(m?.articles_per_visitor || 0),
    rows: rows.map((r) => ({
      visitor: createHash("sha256")
        .update(`${accountId}:${r.deviceId}`)
        .digest("hex")
        .slice(0, 12),
      views: Number(r.views),
      articles: Number(r.articles),
      activeDays: Number(r.days),
      firstSeenAt: new Date(r.first_seen).toISOString(),
      lastSeenAt: new Date(r.last_seen).toISOString(),
      isNew: new Date(r.first_seen) >= range.start,
    })),
  };
}

/** Topic UV is DISTINCT across members; never sum article-level visitor counts. */
export async function analyticsTopics(
  db: PrismaClient,
  accountId: number,
  range: AnalyticsRange,
) {
  const rows = await db.$queryRaw<any[]>`
 WITH reads AS (
  SELECT m."topicId" AS topic,COUNT(*)::int AS views,COUNT(DISTINCT v."deviceId")::int AS visitors
  FROM "blogTopicNote" m JOIN "blogPageView" v ON v."noteId"=m."noteId"
  WHERE v."accountId"=${accountId} AND v."createdAt">=${range.start} AND v."createdAt"<${range.endExclusive} GROUP BY 1
 ), signals AS (
  SELECT m."topicId" AS topic,COUNT(*) FILTER(WHERE e.kind='impression')::int AS impressions,COUNT(*) FILTER(WHERE e.kind='click')::int AS clicks
  FROM "blogTopicNote" m JOIN notes n ON n.id=m."noteId" JOIN "blogRecommendationEvent" e ON e."publishId"=n."publishId"
  WHERE e."accountId"=${accountId} AND e.bucket>=${range.start} AND e.bucket<${range.endExclusive} AND e.kind IN ('impression','click') GROUP BY 1
 )
 SELECT t.id,t.name,t.slug,COUNT(DISTINCT m."noteId")::int AS articles,
 COALESCE(r.views,0)::int AS views,COALESCE(r.visitors,0)::int AS visitors,
 COALESCE(s.impressions,0)::int AS impressions,COALESCE(s.clicks,0)::int AS clicks
 FROM "blogTopic" t LEFT JOIN "blogTopicNote" m ON m."topicId"=t.id
 LEFT JOIN reads r ON r.topic=t.id LEFT JOIN signals s ON s.topic=t.id
 WHERE t."accountId"=${accountId}
 GROUP BY t.id,t.name,t.slug,r.views,r.visitors,s.impressions,s.clicks
 ORDER BY COALESCE(r.views,0) DESC,t.id ASC LIMIT 100`;
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      articles: Number(r.articles),
      views: Number(r.views),
      visitors: Number(r.visitors),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
      ctr: r.impressions > 0 ? Number(r.clicks) / Number(r.impressions) : null,
    })),
  };
}
