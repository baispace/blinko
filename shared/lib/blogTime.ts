/**
 * 公开站的时间口径工具。
 *
 * 月份边界按「站点配置时区」判定，而不是服务器本地时区 ——
 * 服务器可能跑在 UTC，站点作者在 Asia/Shanghai，跨月的那条动态就该按作者所在时区归月。
 *
 * 服务端没有 dayjs，这里用 Intl.DateTimeFormat 自己算偏移，前后端共用同一份实现，
 * 避免「接口按 UTC 分月、页面按本地时区分月」这类对不上的问题。
 */

/** 站点没有配置时区时的兜底值。 */
export const DEFAULT_BLOG_TIMEZONE = "Asia/Shanghai";

/** 时区是否被运行时认识。 */
export function isValidTimeZone(timeZone: string) {
  if (!timeZone || typeof timeZone !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** 站点时区名（非法值退回默认）。 */
export function safeTimeZone(timeZone: string | undefined | null) {
  return timeZone && isValidTimeZone(timeZone) ? timeZone : DEFAULT_BLOG_TIMEZONE;
}

/** 某个瞬间在指定时区的 UTC 偏移（毫秒）。 */
export function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  // hour 可能是 "24"（午夜），按 0 处理。
  const hour = Number(map.hour) % 24;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/**
 * 站点时区下的「年-月」，例如 "2026-10"。
 */
export function monthKeyInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}`;
}

/**
 * 站点时区下某年某月 1 日 00:00 对应的 UTC 瞬间。
 *
 * month 是 1-12。先按 UTC 猜一个瞬间，再用该瞬间的真实偏移修正回去；
 * 两次之内就能收敛（真实时区里没有「午夜整点不存在的」这类边界问题）。
 */
export function startOfMonthInZone(year: number, month: number, timeZone: string) {
  const base = Date.UTC(year, month - 1, 1, 0, 0, 0, 0);
  let guess = base;
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMs(new Date(guess), timeZone);
    const next = base - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/** 下一个月的起点（用于「左闭右开」的区间查询）。 */
export function startOfNextMonthInZone(
  year: number,
  month: number,
  timeZone: string,
) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return startOfMonthInZone(nextYear, nextMonth, timeZone);
}

/** "2026-10" → { year: 2026, month: 10 }；不合法返回 null。 */
export function parseMonthKey(key: string) {
  const m = /^(\d{4})-(\d{2})$/.exec((key || "").trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * 站点时区下的「年-月-日」，例如 "2026-10-25"。
 */
export function dayKeyInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) map[part.type] = part.value;
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * 站点时区下某一天 00:00 对应的 UTC 瞬间。
 *
 * 与 startOfMonthInZone 同一套做法：先按 UTC 猜一个瞬间，
 * 再用该瞬间的真实偏移修正回去，两三次之内收敛。
 */
export function startOfDayInZone(date: Date, timeZone: string) {
  const key = dayKeyInZone(date, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let guess = base;
  for (let i = 0; i < 3; i++) {
    const offset = timeZoneOffsetMs(new Date(guess), timeZone);
    const next = base - offset;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

/**
 * 在站点时区的日历上前后平移若干天，返回那一天的 00:00。
 *
 * 先取时区里的日历日期，在日历上做加减，再换回那一天的起点 ——
 * 直接减 24 小时会在跨夏令时的时区里偏出一个小时。
 */
export function shiftDayInZone(date: Date, days: number, timeZone: string) {
  const key = dayKeyInZone(date, timeZone);
  const [year, month, day] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return startOfDayInZone(shifted, timeZone);
}

/** "2026-10-25" → "2026.10.25"（页面上的日期展示）。 */
export function formatDayText(key: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

/** "2026-10" → "2026.10"。 */
export function formatMonthText(key: string) {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `${parsed.year}.${String(parsed.month).padStart(2, "0")}`;
}

/** "2026-10" → "2026年10月"。 */
export function formatMonthLabel(key: string) {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `${parsed.year}年${parsed.month}月`;
}
