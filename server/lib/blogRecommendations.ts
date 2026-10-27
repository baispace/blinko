import { lockBlogVisitor } from "./blogVisitor";
import { isDeviceId } from "./blogStats";
import { PrismaClient } from "@prisma/client";
import { publicBlogOwner } from "./blog";
import { publicPublicationWhere } from "./publication";
import { publicCard, publicPostSelect, BLOG_PAGE_SIZE, normalizePage, publicText } from "./publicBlog";
import { noteViewCounts } from "./blogStats";
import { attribute, type AttributionInput } from "./blogAttribution";
import {
  DEFAULT_DISTRIBUTION,
  SEEN_PENALTY,
  getDistribution,
  type DistributionConfig,
} from "./blogDistribution";

// Process-local abuse guard; the database unique key also deduplicates across workers.
const lastCleanup = new Map<number, number>();
const limits = new Map<string, { at: number; count: number }>();
export async function recordRecommendationEvent(
  db: PrismaClient,
  input: {
    deviceId: string;
    kind: string;
    publishId: string;
    term: string;
    accountId?: number;
  } & AttributionInput,
) {
  if (
    !isDeviceId(input.deviceId) ||
    !["impression", "click", "search"].includes(input.kind)
  )
    return { recorded: false };
  input = {
    ...input,
    term: input.term
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase()
      .slice(0, 80),
  };
  if (limits.size >= 5000)
    for (const [key, value] of limits)
      if (Date.now() - value.at > 60000) limits.delete(key);
  if (limits.size >= 5000 && !limits.has(input.deviceId))
    return { recorded: false };
  const now = Date.now(),
    old = limits.get(input.deviceId);
  if (old && now - old.at < 60000 && old.count >= 60)
    return { recorded: false };
  limits.set(
    input.deviceId,
    old && now - old.at < 60000
      ? { ...old, count: old.count + 1 }
      : { at: now, count: 1 },
  );
  if (limits.size > 5000)
    for (const [key, value] of limits)
      if (now - value.at > 60000) limits.delete(key);
  const accountId = await publicBlogOwner(db, input.accountId);
  if (!accountId) return { recorded: false };
  if (input.kind === "search" && !input.term.trim()) return { recorded: false };
  if (
    input.kind !== "search" &&
    !(await db.notes.findFirst({
      where: {
        ...publicPublicationWhere,
        accountId,
        publishId: input.publishId,
      },
      select: { id: true },
    }))
  )
    return { recorded: false };
  const recorded = await db.$transaction(
    async (tx) => {
      await lockBlogVisitor(tx, accountId, input.deviceId);
      const identity = {
        accountId,
        deviceId: input.deviceId,
        kind: input.kind,
        publishId: input.kind === "search" ? "" : input.publishId,
        term: input.kind === "search" ? input.term : "",
      };
      const latest = await tx.blogRecommendationEvent.findFirst({
        where: identity,
        orderBy: { bucket: "desc" },
        select: { bucket: true },
      });
      // Store actual event time, not an hour bucket: no double count at 12:59/13:00.
      const bucket = new Date();
      if (latest && bucket.getTime() - latest.bucket.getTime() < 3600000)
        return false;
      // 来源归因与阅读埋点同一套规则，服务端统一计算。
      const attribution = attribute(input);
      const result = await tx.blogRecommendationEvent.createMany({
        data: [
          {
            ...identity,
            bucket,
            source: attribution.source,
            referrerHost: attribution.referrerHost,
            entry: attribution.entry,
          },
        ],
        skipDuplicates: true,
      });
      return result.count > 0;
    },
    { maxWait: 10000, timeout: 10000 },
  );
  // Retain at most 30 days; indexed range deletion, no private source content stored.
  if (now - (lastCleanup.get(accountId) || 0) > 3600000) {
    lastCleanup.set(accountId, now);
    await db.blogRecommendationEvent.deleteMany({
      where: { accountId, bucket: { lt: new Date(now - 30 * 86400000) } },
    });
  }
  return { recorded };
}
/**
 * 质量分：内容本身「值不值得推」。
 *
 * 只看运营配置，不看流量 —— 一篇没封面、标题是「无标题」的文章，
 * 流量再高也不该被当成好内容推出去。满分 5。
 */
export function qualityScore(post: {
  title: string;
  hasCover?: boolean;
  hasSummary?: boolean;
  contentLength?: number;
  topicCount?: number;
}) {
  let score = 0;
  if (post.hasCover) score += 1;
  const titleLength = [...(post.title || "")].length;
  if (titleLength >= 8 && titleLength <= 40) score += 1;
  if (post.hasSummary) score += 1;
  if ((post.contentLength ?? 0) >= 600) score += 1;
  if ((post.topicCount ?? 0) >= 1) score += 1;
  return score;
}

export function recommendationScore(
  post: {
    createdAt: Date;
    updatedAt: Date;
    topics: { id: number }[];
    title: string;
    excerpt: string;
    publishId: string;
    hasCover?: boolean;
    hasSummary?: boolean;
    contentLength?: number;
  },
  signals: {
    views: number;
    impressions: number;
    clicks: number;
    topics: Set<number>;
    terms: string[];
    seen: Set<string>;
  },
  now = Date.now(),
  config: DistributionConfig = DEFAULT_DISTRIBUTION,
) {
  const age = Math.max(
    0,
    (now - new Date(post.createdAt).getTime()) / 86400000,
  );
  // 新品分：越新越高，按半衰期衰减。
  const fresh = 1 / (1 + age / config.freshHalfLife);
  // 点击率：分母加 20 平滑，小样本不会一票否决。
  const ctr = (3 * (signals.clicks + 1)) / (signals.impressions + 20);
  // 热度分：点击量 + 点击率，同样按半衰期衰减。
  const hot =
    (Math.log1p(signals.views) + ctr) / (1 + age / config.hotHalfLife);
  const quality = qualityScore({
    title: post.title,
    hasCover: post.hasCover,
    hasSummary: post.hasSummary,
    contentLength: post.contentLength,
    topicCount: post.topics.length,
  });
  const affinity = post.topics.some((t) => signals.topics.has(t.id)) ? 1 : 0;
  const text = (post.title + " " + post.excerpt).toLocaleLowerCase();
  const search = signals.terms.some((t) => text.includes(t.toLocaleLowerCase()))
    ? 1
    : 0;
  // 口径决定用什么排序：单一因子口径只看那一个因子，权重不参与。
  let score: number;
  switch (config.mode) {
    case "recency":
      score = fresh;
      break;
    case "clicks":
      score = Math.log1p(signals.views);
      break;
    case "ctr":
      score = ctr;
      break;
    default:
      score =
        fresh * config.freshWeight +
        hot * config.hotWeight +
        quality * config.qualityWeight +
        affinity * config.affinityWeight +
        search * config.searchWeight;
  }
  // 读者刚点过的，降权：别再顶到最前面。
  return score - (signals.seen.has(post.publishId) ? SEEN_PENALTY : 0);
}
export async function recommendationFeed(
  db: PrismaClient,
  input: {
    deviceId?: string;
    topicSlug?: string;
    page?: number;
    accountId?: number;
  },
) {
  const accountId = await publicBlogOwner(db, input.accountId);
  const where = {
    ...publicPublicationWhere,
    accountId,
    ...(input.topicSlug
      ? {
          blogTopics: {
            some: { topic: { slug: input.topicSlug, isPublished: true } },
          },
        }
      : {}),
  };
  // Bound candidate work. Separate fresh/popular recalls ensure older popular posts remain eligible.
  const [fresh, popular, events] = await Promise.all([
    db.notes.findMany({
      where,
      select: publicPostSelect,
      orderBy: { publication: { createdAt: "desc" } },
      take: 120,
    }),
    db.blogPostStat.findMany({
      where: { accountId },
      orderBy: { views: "desc" },
      take: 120,
    }),
    db.blogRecommendationEvent.findMany({
      where: {
        accountId,
        bucket: { gte: new Date(Date.now() - 30 * 86400000) },
      },
      orderBy: { bucket: "desc" },
      take: 3000,
    }),
  ]);
  const extra = await db.notes.findMany({
    where: { ...where, id: { in: popular.map((p) => p.noteId) } },
    select: publicPostSelect,
    take: 120,
  });

  const personal = input.deviceId
    ? await db.blogRecommendationEvent.findMany({
        where: {
          accountId,
          deviceId: input.deviceId,
          kind: { in: ["click", "search"] },
          bucket: { gte: new Date(Date.now() - 30 * 86400000) },
        },
        orderBy: { bucket: "desc" },
        take: 100,
      })
    : [];
  const seen = new Set(
    personal.filter((e) => e.kind === "click").map((e) => e.publishId),
  );
  const seeds = await db.notes.findMany({
    where: {
      ...publicPublicationWhere,
      accountId,
      publishId: { in: [...seen].slice(0, 20) },
    },
    select: publicPostSelect,
  });
  const topics = new Set(
    seeds.flatMap((p) => p.blogTopics.map((t) => t.topic.id)),
  );
  const terms = [
    ...new Set(personal.filter((e) => e.kind === "search").map((e) => e.term)),
  ].slice(0, 8);
  const related =
    topics.size || terms.length
      ? await db.notes.findMany({
          where: {
            ...where,
            AND: [
              {
                OR: [
                  ...(topics.size
                    ? [
                        {
                          blogTopics: {
                            some: {
                              topicId: { in: [...topics] },
                              topic: { isPublished: true },
                            },
                          },
                        },
                      ]
                    : []),
                  ...terms.map((term) => ({
                    publication: {
                      is: {
                        OR: [
                          {
                            title: {
                              contains: term,
                              mode: "insensitive" as const,
                            },
                          },
                          {
                            summary: {
                              contains: term,
                              mode: "insensitive" as const,
                            },
                          },
                        ],
                      },
                    },
                  })),
                ],
              },
            ],
          },
          select: publicPostSelect,
          orderBy: { publication: { updatedAt: "desc" } },
          take: 80,
        })
      : [];
  const rows = [
    ...new Map([...fresh, ...extra, ...related].map((p) => [p.id, p])).values(),
  ];
  const impressions = new Map<string, number>(),
    clicks = new Map<string, number>();
  for (const e of events) {
    const map =
      e.kind === "impression"
        ? impressions
        : e.kind === "click"
          ? clicks
          : null;
    if (map) map.set(e.publishId, (map.get(e.publishId) || 0) + 1);
  }
  const counts = await noteViewCounts(
    db,
    rows.map((p) => p.id),
  );
  // 分发口径与权重来自站点配置（未配置则用默认值）。
  const config = await getDistribution(db, accountId);
  /**
   * 置顶块：作者标了「推荐置顶」的文章，独立成块。
   *
   * 排序按 featuredOrder —— 多篇可以自己调顺序。
   * 直接查库而不是从候选池里捞：老文章也可能被作者置顶，
   * 候选池只召回最近/最热的一批，捞不到就等于置顶失效。
   *
   * 专题视图里置顶不生效：置顶是作者给全站推荐流排的队，
   * 专题里的顺序该由推荐分和专题编排决定。置顶块也不该跨专题插队 ——
   * 否则专题页第一屏全是别的专题的文章，专题筛选等于白做。
   * 专题里的置顶文章当普通文章参与排序：既不插队，也不沉底。
   */
  const topicMode = !!input.topicSlug;
  const pinnedRows = await db.notes.findMany({
    where: {
      ...publicPublicationWhere,
      accountId,
      publication: { isFeatured: true },
    },
    orderBy: [{ publication: { featuredOrder: "asc" } }, { id: "asc" }],
    select: publicPostSelect,
  });
  const pinnedCounts = await noteViewCounts(
    db,
    pinnedRows.map((p) => p.id),
  );
  /**
   * banner 池：推荐页顶部已经展示过的文章，列表里不再重复出现一次。
   *
   * 只在没有专题筛选时排除 —— banner 只在「全部文章」视图下展示，
   * 筛选态根本没有 banner，剔了就是白白少文章。
   */
  const bannerIds = input.topicSlug
    ? new Set<number>()
    : new Set(
        (
          await db.notes.findMany({
            where: {
              ...publicPublicationWhere,
              accountId,
              publication: { isBanner: true },
            },
            select: { id: true },
          })
        ).map((n) => n.id),
      );
  const pinnedIds = new Set(pinnedRows.map((p) => p.id));
  const posts = rows.map((row) => publicCard(row, counts.get(row.id) || 0));
  const normal = posts
    .map((p, i) => {
      const row = rows[i];
      return {
        post: p,
        score: recommendationScore(
          {
            ...p,
            hasCover: !!row.publication?.coverAttachment?.path,
            hasSummary: !!row.publication?.summary?.trim(),
            contentLength: publicText(row.publication?.content ?? "").length,
          },
          {
            views: p.views,
            impressions: impressions.get(p.publishId) || 0,
            clicks: clicks.get(p.publishId) || 0,
            topics,
            terms,
            seen,
          },
          Date.now(),
          config,
        ),
      };
    })
    // 普通候选里不留置顶与 banner 的文章：同一篇不在两处重复出现。
    // 专题视图没有置顶块，置顶文章照常留在候选里参与排序。
    .filter(
      (item) =>
        (topicMode || !pinnedIds.has(item.post.id)) &&
        !bannerIds.has(item.post.id),
    )
    // 按分数 → 再按 id 兜底，保证顺序稳定。
    .sort((a, b) => b.score - a.score || b.post.id - a.post.id)
    .map((item) => item.post);
  const pinned = pinnedRows.map(
    (row) => publicCard(row, pinnedCounts.get(row.id) || 0),
  );
  /**
   * 「精选优先」关掉时，置顶文章不提到最前 —— 但它们仍要在列表里，
   * 只是按普通候选的分数排（召回池捞不到的那几篇排在末尾）。
   * 直接丢弃等于「置顶 = 文章消失」，那不是关掉置顶该有的结果。
   */
  const normalIds = new Set(normal.map((p) => p.id));
  const merged = topicMode
    ? normal
    : config.featuredFirst
      ? [...pinned, ...normal]
      : [
          ...normal,
          ...pinned.filter((p) => !normalIds.has(p.id)),
        ];
  const pageCount = Math.max(1, Math.ceil(merged.length / BLOG_PAGE_SIZE));
  // 页码越界收敛回最后一页，跟 publicIndex 同一套口径。
  const page = Math.min(normalizePage(input.page), pageCount);
  return {
    // 分页切在合并后的序列上：置顶不会在第 2 页又冒出来，页数也与其它 feed 一致。
    posts: merged.slice((page - 1) * BLOG_PAGE_SIZE, page * BLOG_PAGE_SIZE),
    page,
    pageCount,
    personalized: personal.some((e) => e.kind !== "impression"),
    // 对外报当前口径，便于排查「为什么这篇排前面」。
    strategy: config.mode,
  };
}
