/**
 * 公开站点数据汇总的进程内缓存。
 *
 * 单独成文件只有一个原因：它不能 import 任何业务模块。
 * 发布、撤回（server/lib/publication.ts）与表态（server/lib/blogInteraction.ts）
 * 都要在写完之后让汇总失效，而汇总本身又要 import publication 里的
 * publicPublicationWhere —— 放在同一个文件里就会形成循环引用。
 *
 * 缓存只在单个进程内有效：多实例部署时每个实例各算各的，
 * 但口径相同、数据最多差一个 TTL，不影响展示。
 */
type Entry = { at: number; value: unknown };

const CACHE_TTL_MS = 60_000;
const cache = new Map<number, Entry>();
/**
 * 按周期分键的缓存（公开「站点数据」页用）。
 *
 * 同一个站点要同时缓存「近 7 天 / 近 30 天 / 近一年」三份结果，
 * 所以这里按 accountId → key 两级存，失效时能一次清掉某个站点的全部周期。
 */
const rangeCache = new Map<number, Map<string, Entry>>();

/** 汇总结果的存活时间（毫秒）。分钟级延迟是可接受的。 */
export const PUBLIC_STATS_TTL_MS = CACHE_TTL_MS;

export function readPublicStatsCache<T>(accountId: number): T | undefined {
  const hit = cache.get(accountId);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= CACHE_TTL_MS) {
    cache.delete(accountId);
    return undefined;
  }
  return hit.value as T;
}

export function writePublicStatsCache<T>(accountId: number, value: T) {
  cache.set(accountId, { at: Date.now(), value });
}

/**
 * 过期后还能当「降级数据」保留多久。
 *
 * 聚合失败时页面宁可展示一份带明确时间的旧数据，也不要显示模拟数字；
 * 但旧数据也不能无限期留着 —— 半小时前的那份已经没有任何参考价值了。
 */
const STALE_MAX_MS = 30 * 60_000;

/**
 * 读某个站点某个周期的缓存。
 *
 * 注意：过期的条目不删 —— 它还要留着当聚合失败时的降级数据。
 */
export function readPublicStatsRangeCache<T>(
  accountId: number,
  key: string,
): T | undefined {
  const bucket = rangeCache.get(accountId);
  const hit = bucket?.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at >= CACHE_TTL_MS) return undefined;
  return hit.value as T;
}

/**
 * 取一份可能已经过期的缓存，用于聚合失败时降级。
 *
 * 返回里带着写入时刻，页面据此标明「这是 X 分钟前的数据」。
 */
export function readStalePublicStatsRangeCache<T>(
  accountId: number,
  key: string,
): { value: T; at: number } | undefined {
  const bucket = rangeCache.get(accountId);
  const hit = bucket?.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > STALE_MAX_MS) {
    bucket?.delete(key);
    return undefined;
  }
  return { value: hit.value as T, at: hit.at };
}

/** 写某个站点某个周期的缓存。 */
export function writePublicStatsRangeCache<T>(
  accountId: number,
  key: string,
  value: T,
) {
  let bucket = rangeCache.get(accountId);
  if (!bucket) {
    bucket = new Map<string, Entry>();
    rangeCache.set(accountId, bucket);
  }
  bucket.set(key, { at: Date.now(), value });
}

/**
 * 让某个站点的汇总缓存立刻失效。
 *
 * 不传 accountId 表示清空全部 —— 只在测试与维护入口用。
 */
export function invalidatePublicStats(accountId?: number) {
  if (accountId === undefined) {
    cache.clear();
    rangeCache.clear();
    return;
  }
  cache.delete(accountId);
  rangeCache.delete(accountId);
}
