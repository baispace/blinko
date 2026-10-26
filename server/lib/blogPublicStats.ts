import type { PrismaClient } from "@prisma/client";
import { publicPublicationWhere } from "./publication";
import { VIEW_WINDOW_SECONDS } from "./blogStats";
import {
  PUBLIC_STATS_TTL_MS,
  invalidatePublicStats,
  readPublicStatsCache,
  writePublicStatsCache,
} from "./blogPublicStatsCache";

/**
 * 关于页「站点数据」汇总。
 *
 * 口径全部锁在公开范围内：只统计当前已发布、公开可访问的文章。
 * 撤回、转私有、删除的文章会立刻退出汇总 —— 它们的计数行还在库里，
 * 但这里按 note 的公开状态过滤掉了。
 *
 * 四项指标与它们的来源：
 *
 *   累计阅读  blogPostStat.views 之和
 *             —— 「有效阅读次数」，不是曝光、不是点击数、也不是独立读者数。
 *             采集侧（server/lib/blogStats.ts）已经按设备 30 分钟滑动窗口去重，
 *             所以这里是「去重后的阅读次数」。
 *
 *   读者回应  blogArticleReaction 行数
 *             —— 公开文章收到的「有启发 / 很实用 / 有共鸣」三类回应总数。
 *             唯一约束 (accountId, noteId, deviceId) 保证同一访客对同一篇
 *             只留一种回应，所以计数天然等于有效互动数，不会被连点放大。
 *             私密反馈（blogArticleFeedback）与作者回复不在这里。
 *
 *   公开文章  当前公开可访问的文章数量。
 *             系统没有可靠的「原创」标记，所以这里只能叫「公开文章」——
 *             不能把所有文章都算成原创。
 *
 *   持续分享  从最早一篇公开文章的首次发布时间到今天的自然日数。
 *             notePublication.createdAt 只在首次发布时写入，「更新发布」不会
 *             重置它，所以更新文章不会把这段时长归零。
 *             它不表示连续每天更新，只是「从第一次公开到现在」的自然日跨度。
 */

/** 口径版本：统计口径发生变化时 +1，客户端据此判断结果是否同源。 */
export const PUBLIC_STATS_VERSION = "v1";

/** 自然日按 UTC+8 切分，与既有统计（server/lib/blogStats.ts）保持同一套偏移。 */
const DAY_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function dayIndex(at: Date) {
  return Math.floor((at.getTime() + DAY_OFFSET_MS) / DAY_MS);
}

/**
 * 持续分享的自然日数。
 *
 * 没有公开文章（firstPublishedAt 为空）时返回 0 ——
 * 不是 1，也不是「刚刚开始」，就是 0 天。
 * 这是自然日跨度，不表示连续每天更新。
 */
export function sharingDays(firstPublishedAt: Date | null, now = new Date()) {
  if (!firstPublishedAt) return 0;
  return Math.max(0, dayIndex(now) - dayIndex(firstPublishedAt));
}

export type PublicSiteStats = {
  /** 累计阅读：有效阅读次数。 */
  views: number;
  /** 读者回应：公开文章收到的有效互动总数。 */
  reactions: number;
  /** 公开文章数。 */
  articles: number;
  /** 持续分享：自然日数。 */
  days: number;
  /** 最早一篇公开文章的首次发布时间（ISO）。没有公开文章时为 null。 */
  firstPublishedAt: string | null;
  /** 这份汇总的计算时间（ISO）。 */
  updatedAt: string;
  /** 口径版本。 */
  version: string;
  /** 阅读去重窗口（分钟），供「统计说明」展示。 */
  dedupeWindowMinutes: number;
};

/**
 * 汇总一个站点的公开数据。
 *
 * 结果按分钟级缓存：打开关于页不该每次都去扫计数表。
 * 发布、撤回、表态之后会主动失效缓存（见 server/lib/blogPublicStatsCache.ts）。
 */
export async function publicSiteStats(
  db: PrismaClient,
  accountId: number,
): Promise<PublicSiteStats> {
  const cached = readPublicStatsCache<PublicSiteStats>(accountId);
  if (cached) return cached;

  const [articles, firstPublished, views, reactions] = await Promise.all([
    db.notes.count({ where: { ...publicPublicationWhere, accountId } }),
    db.notePublication.aggregate({
      where: { note: { ...publicPublicationWhere, accountId } },
      _min: { createdAt: true },
    }),
    // 阅读数直接读计数器，不扫 blogPageView 明细表。
    db.blogPostStat.aggregate({
      where: { accountId, note: { ...publicPublicationWhere } },
      _sum: { views: true },
    }),
    db.blogArticleReaction.count({
      where: { accountId, note: { ...publicPublicationWhere } },
    }),
  ]);

  const first = firstPublished._min.createdAt ?? null;
  const stats: PublicSiteStats = {
    views: views._sum.views ?? 0,
    reactions,
    articles,
    days: sharingDays(first),
    firstPublishedAt: first ? first.toISOString() : null,
    updatedAt: new Date().toISOString(),
    version: PUBLIC_STATS_VERSION,
    dedupeWindowMinutes: Math.round(VIEW_WINDOW_SECONDS / 60),
  };
  writePublicStatsCache(accountId, stats);
  return stats;
}

/** 汇总的失效入口转出：发布、撤回、表态之后调用它让缓存立刻作废。 */
export { invalidatePublicStats, PUBLIC_STATS_TTL_MS };
