import { lockBlogVisitor } from "./blogVisitor";
import { PrismaClient } from "@prisma/client";
import { publicBlogOwner } from "./blog";
import { publicPublicationWhere } from "./publication";
import { attribute, type AttributionInput } from "./blogAttribution";

/**
 * 同一设备对同一文章的去重窗口（秒）。
 *
 * 窗口内重复打开（多半是刷新）只记一次点击；窗口外再打开才算新的有效点击。
 * 用「查上一次阅读时间 + 比较」实现，是滑动窗口而不是时间桶 —— 时间桶会在
 * 桶边界上把一次刷新算成两次。
 */
export const VIEW_WINDOW_SECONDS = 30 * 60;

/** 同一设备每分钟最多上报多少次，超过就当刷量丢弃。 */
const RATE_LIMIT_PER_MINUTE = 30;

/** 浏览器端生成的设备 ID：32 位十六进制随机串。 */
const DEVICE_ID = /^[0-9a-f]{32}$/;

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID.test(value);
}

export type ArticleStats = { views: number; readers: number };
/**
 * 记一次阅读。
 *
 * 去重完全靠浏览器生成的匿名设备 ID —— 服务端拿不到 IP、UA，也没有任何指纹，
 * 所以「读者数」就是去重后的设备数。同一个设备在多篇文章上都只算一个站点用户。
 *
 * 写入分两路：
 *   blogPageView  原始事实（一次有效阅读一行）—— 判重、趋势都靠它
 *   blogPostStat  文章级计数器（原子自增）—— 读数直接读它，不实时 COUNT
 *   blogDevice    站点级设备档案 —— 站点总用户数靠它
 */
export async function trackBlogView(
  db: PrismaClient,
  input: {
    publishId: string;
    deviceId: string;
    accountId?: number;
    windowSeconds?: number;
  } & AttributionInput,
) {
  if (!isDeviceId(input.deviceId)) return null;
  const accountId = await publicBlogOwner(db, input.accountId);
  const note = await db.notes.findFirst({
    where: { ...publicPublicationWhere, accountId, publishId: input.publishId },
    select: { id: true },
  });
  if (!note) return null;
  // 来源归因在服务端统一算：只留规范化域名，不存完整来源 URL。
  const attribution = attribute(input);

  return db.$transaction(
    async (tx) => {
      // The read, dedup decision, counters and site visitor belong to one atomic unit.
      await lockBlogVisitor(tx, accountId, input.deviceId);
      const now = new Date();
      const recent = await tx.blogPageView.count({
        where: {
          accountId,
          deviceId: input.deviceId,
          createdAt: { gte: new Date(now.getTime() - 60000) },
        },
      });
      const stats = async () => {
        const value = await tx.blogPostStat.findUnique({
          where: { noteId: note.id },
          select: { views: true, readers: true },
        });
        return value || { views: 0, readers: 0 };
      };
      if (recent >= RATE_LIMIT_PER_MINUTE)
        return { counted: false, ...(await stats()) };
      const agg = await tx.blogPageView.aggregate({
        where: { noteId: note.id, deviceId: input.deviceId },
        _count: { _all: true },
        _max: { createdAt: true },
      });
      const last = agg._max.createdAt;
      if (
        last &&
        now.getTime() - last.getTime() <
          (input.windowSeconds ?? VIEW_WINDOW_SECONDS) * 1000
      )
        return { counted: false, ...(await stats()) };
      const isNewReader = agg._count._all === 0;
      await tx.blogPageView.create({
        data: {
          accountId,
          noteId: note.id,
          deviceId: input.deviceId,
          createdAt: now,
          source: attribution.source,
          referrerHost: attribution.referrerHost,
          entry: attribution.entry,
        },
      });
      const result = await tx.blogPostStat.upsert({
        where: { noteId: note.id },
        create: {
          noteId: note.id,
          accountId,
          views: 1,
          readers: isNewReader ? 1 : 0,
        },
        update: {
          views: { increment: 1 },
          readers: { increment: isNewReader ? 1 : 0 },
        },
        select: { views: true, readers: true },
      });
      await tx.blogDevice.upsert({
        where: { accountId_deviceId: { accountId, deviceId: input.deviceId } },
        create: {
          accountId,
          deviceId: input.deviceId,
          firstSeenAt: now,
          lastSeenAt: now,
        },
        update: { lastSeenAt: now },
      });
      return { counted: true, ...result };
    },
    { maxWait: 10000, timeout: 10000 },
  );
}

/** 单篇文章的点击数与读者数 —— 直接读计数器，不做聚合查询。 */
export async function articleStats(
  db: PrismaClient,
  noteId: number,
): Promise<ArticleStats> {
  const stat = await db.blogPostStat.findUnique({
    where: { noteId },
    select: { views: true, readers: true },
  });
  return { views: stat?.views ?? 0, readers: stat?.readers ?? 0 };
}

/** 批量取文章的点击数（列表页用，避免逐条查询）。 */
export async function noteViewCounts(
  db: PrismaClient,
  noteIds: number[],
): Promise<Map<number, number>> {
  const ids = [
    ...new Set(noteIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
  if (!ids.length) return new Map();
  const rows = await db.blogPostStat.findMany({
    where: { noteId: { in: ids } },
    select: { noteId: true, views: true },
  });
  return new Map(rows.map((r) => [r.noteId, r.views]));
}

export type SiteStats = {
  views: number;
  readers: number;
  byNote: { noteId: number; views: number; readers: number }[];
  daily: { day: string; views: number; readers: number }[];
};

/**
 * 站点级统计：总点击数、总用户数（去重设备）、每篇文章明细、近 N 天趋势。
 *
 * 站点总点击数 = 各文章计数器之和；站点总用户数 = 设备档案的行数（跨文章去重）；
 * 每日趋势才需要扫明细表 —— 但只扫最近 N 天。
 */
export async function siteStats(
  db: PrismaClient,
  accountId: number,
  days = 30,
): Promise<SiteStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [totals, readers, byNote, daily] = await Promise.all([
    db.blogPostStat.aggregate({
      where: { accountId },
      _sum: { views: true },
    }),
    db.blogDevice.count({ where: { accountId } }),
    db.blogPostStat.findMany({
      where: { accountId },
      select: { noteId: true, views: true, readers: true },
      orderBy: { views: "desc" },
    }),
    db.$queryRaw<{ day: Date; views: bigint; readers: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS "day",
             COUNT(*)::bigint AS "views",
             COUNT(DISTINCT "deviceId")::bigint AS "readers"
      FROM "blogPageView"
      WHERE "accountId" = ${accountId} AND "createdAt" >= ${since}
      GROUP BY 1 ORDER BY 1
    `,
  ]);
  return {
    views: totals._sum.views ?? 0,
    readers,
    byNote: byNote.map((r) => ({
      noteId: r.noteId,
      views: r.views,
      readers: r.readers,
    })),
    daily: daily.map((d) => ({
      day: new Date(d.day).toISOString().slice(0, 10),
      views: Number(d.views),
      readers: Number(d.readers),
    })),
  };
}

/** Bounded, same-period counts; event rows have already passed server-side dedup. */
export async function blogEngagement(db:PrismaClient,accountId:number,days:number){
 const since=new Date();if(days===1)since.setTime(Math.floor((Date.now()+8*3600000)/86400000)*86400000-8*3600000);else since.setTime(since.getTime()-days*86400000);
 const [signals,views,visitors]=await Promise.all([
  db.blogRecommendationEvent.groupBy({by:['publishId','kind'],where:{accountId,bucket:{gte:since},kind:{in:['impression','click']}},_count:{_all:true}}),
  db.blogPageView.groupBy({by:['noteId'],where:{accountId,createdAt:{gte:since}},_count:{_all:true}}),
  db.$queryRaw<{readers:bigint}[]>`SELECT COUNT(DISTINCT "deviceId")::bigint AS readers FROM "blogPageView" WHERE "accountId"=${accountId} AND "createdAt">=${since}`
 ]);
 const impressions=signals.filter(r=>r.kind==='impression').reduce((n,r)=>n+r._count._all,0),clicks=signals.filter(r=>r.kind==='click').reduce((n,r)=>n+r._count._all,0);
 return {impressions,clicks,ctr:impressions?clicks/impressions:0,views:views.reduce((n,r)=>n+r._count._all,0),readers:Number(visitors[0]?.readers||0),byNote:views.map(r=>({noteId:r.noteId,views:r._count._all})),signals:signals.map(r=>({publishId:r.publishId,kind:r.kind,count:r._count._all}))};
}
