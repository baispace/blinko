/**
 * 公开接口的滑动窗口限流。
 *
 * 只用来源 IP 做键 —— 不采集更细的指纹，也不读浏览器特征。
 * 计数在内存里，服务重启后归零：这是防误触发的护栏，不是安全边界。
 */
const WINDOWS = new Map<string, number[]>();

/** 顺手清掉过期的键，避免长期运行后无限增长。 */
function sweep(now: number) {
  if (WINDOWS.size <= 2000) return;
  for (const [key, hits] of WINDOWS) {
    if (!hits.some((t) => now - t < 60 * 60 * 1000)) WINDOWS.delete(key);
  }
}

/**
 * 记一次命中。返回 0 表示放行，否则返回还需等待的秒数。
 */
export function hitRateWindow(
  key: string,
  limit: number,
  windowMs: number,
): number {
  const now = Date.now();
  const hits = (WINDOWS.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    WINDOWS.set(key, hits);
    return Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
  }
  hits.push(now);
  WINDOWS.set(key, hits);
  sweep(now);
  return 0;
}
