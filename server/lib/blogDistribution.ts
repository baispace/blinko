import type { PrismaClient } from "@prisma/client";

/**
 * 流量分发策略。
 *
 * 公开列表的排序口径以前是写死的（fresh*2 + hot + affinity + search），
 * 运营想调整只能改代码。这里把口径与权重抽成站点级配置，一行一条：
 *
 *   recency  按发布时间（越新越靠前）
 *   clicks   按点击数（越多越靠前）
 *   ctr      按曝光点击率（点得越准越靠前）
 *   blended  综合排序：新品分 / 热度分 / 质量分 / 主题亲和 / 搜索命中 的加权和
 *
 * 权重只在 blended 口径下生效；其它三种口径是单一因子，权重不参与。
 */
export const DISTRIBUTION_MODES = [
  "recency",
  "clicks",
  "ctr",
  "blended",
] as const;
export type DistributionMode = (typeof DISTRIBUTION_MODES)[number];

export type DistributionConfig = {
  mode: DistributionMode;
  freshWeight: number;
  hotWeight: number;
  qualityWeight: number;
  affinityWeight: number;
  searchWeight: number;
  /** 新品分半衰期（天）：越老掉得越快。 */
  freshHalfLife: number;
  /** 热度分半衰期（天）。 */
  hotHalfLife: number;
  /** 手动精选的文章是否强制排在最前。 */
  featuredFirst: boolean;
};

export const DEFAULT_DISTRIBUTION: DistributionConfig = {
  mode: "blended",
  freshWeight: 2,
  hotWeight: 1,
  qualityWeight: 0,
  affinityWeight: 2,
  searchWeight: 3,
  freshHalfLife: 14,
  hotHalfLife: 60,
  featuredFirst: true,
};

/** 已被看过的文章降权：读者刚点过，就别再顶到最前面。 */
export const SEEN_PENALTY = 3;

function num(value: unknown, fallback: number, min: number, max: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeDistribution(input: Partial<DistributionConfig> | null | undefined): DistributionConfig {
  const d = { ...DEFAULT_DISTRIBUTION, ...(input ?? {}) };
  return {
    mode: DISTRIBUTION_MODES.includes(d.mode) ? d.mode : DEFAULT_DISTRIBUTION.mode,
    freshWeight: num(d.freshWeight, DEFAULT_DISTRIBUTION.freshWeight, 0, 20),
    hotWeight: num(d.hotWeight, DEFAULT_DISTRIBUTION.hotWeight, 0, 20),
    qualityWeight: num(d.qualityWeight, DEFAULT_DISTRIBUTION.qualityWeight, 0, 20),
    affinityWeight: num(d.affinityWeight, DEFAULT_DISTRIBUTION.affinityWeight, 0, 20),
    searchWeight: num(d.searchWeight, DEFAULT_DISTRIBUTION.searchWeight, 0, 20),
    freshHalfLife: num(d.freshHalfLife, DEFAULT_DISTRIBUTION.freshHalfLife, 0.5, 365),
    hotHalfLife: num(d.hotHalfLife, DEFAULT_DISTRIBUTION.hotHalfLife, 0.5, 365),
    featuredFirst: d.featuredFirst !== false,
  };
}

/** 读站点的分发配置；没配过就用默认值（不强制建行）。 */
export async function getDistribution(
  db: PrismaClient,
  accountId: number,
): Promise<DistributionConfig> {
  const row = await db.blogDistribution.findUnique({ where: { accountId } });
  if (!row) return { ...DEFAULT_DISTRIBUTION };
  return normalizeDistribution({
    mode: row.mode as DistributionMode,
    freshWeight: row.freshWeight,
    hotWeight: row.hotWeight,
    qualityWeight: row.qualityWeight,
    affinityWeight: row.affinityWeight,
    searchWeight: row.searchWeight,
    freshHalfLife: row.freshHalfLife,
    hotHalfLife: row.hotHalfLife,
    featuredFirst: row.featuredFirst,
  });
}

export async function saveDistribution(
  db: PrismaClient,
  accountId: number,
  patch: Partial<DistributionConfig>,
): Promise<DistributionConfig> {
  const next = normalizeDistribution({
    ...(await getDistribution(db, accountId)),
    ...patch,
  });
  await db.blogDistribution.upsert({
    where: { accountId },
    create: {
      accountId,
      mode: next.mode,
      freshWeight: next.freshWeight,
      hotWeight: next.hotWeight,
      qualityWeight: next.qualityWeight,
      affinityWeight: next.affinityWeight,
      searchWeight: next.searchWeight,
      freshHalfLife: next.freshHalfLife,
      hotHalfLife: next.hotHalfLife,
      featuredFirst: next.featuredFirst,
    },
    update: {
      mode: next.mode,
      freshWeight: next.freshWeight,
      hotWeight: next.hotWeight,
      qualityWeight: next.qualityWeight,
      affinityWeight: next.affinityWeight,
      searchWeight: next.searchWeight,
      freshHalfLife: next.freshHalfLife,
      hotHalfLife: next.hotHalfLife,
      featuredFirst: next.featuredFirst,
    },
  });
  return next;
}
