/**
 * 页脚的纯规则：版权年份、推广位是否该展示。
 *
 * 单独放一个文件，是为了让「过期自动隐藏」这条规则可以被单测钉死 ——
 * 它是唯一一处会随时间自动变化的展示逻辑，边界最容易写错。
 */

/** 页脚推广位的形状（与站点设置里的 footer.promo 一致）。 */
export type BlogFooterPromo = {
  enabled: boolean;
  title: string;
  text: string;
  url: string;
  startAt: string;
  endAt: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 站点时区下的今天，格式 YYYY-MM-DD。
 *
 * 用 formatToParts 拼，不依赖 en-CA 的本地化格式 —— 浏览器语言变了，
 * 日期顺序也跟着变，推广位的生效区间就会判错。
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()) {
  const safeZone = timeZone || "Asia/Shanghai";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: safeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    const parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  }
}

/**
 * 推广位此刻是否该展示。
 *
 * 规则：
 *   1. 开关打开、且有标题或文案，否则不展示；
 *   2. 起止日期按站点时区判定，留空表示不限制；
 *   3. 日期格式不对时按「不展示」处理 —— 宁可不显示，也不让一条
 *      填错的日期把推广位永远钉在页面上。
 */
export function promoVisible(
  promo: BlogFooterPromo | undefined | null,
  timeZone: string,
  now: Date = new Date(),
) {
  if (!promo?.enabled) return false;
  const title = promo.title?.trim() ?? "";
  const text = promo.text?.trim() ?? "";
  if (!title && !text) return false;
  const start = promo.startAt?.trim() ?? "";
  const end = promo.endAt?.trim() ?? "";
  if (start && !DATE_PATTERN.test(start)) return false;
  if (end && !DATE_PATTERN.test(end)) return false;
  const today = todayInTimeZone(timeZone, now);
  if (start && today < start) return false;
  if (end && today > end) return false;
  return true;
}

/**
 * 版权年份的展示文本。
 *
 * 起始年份为空或与结束年份相同 → 只显示一个年份；
 * 结束年份为空 → 用当前年份。
 */
export function copyrightYears(
  footer: { copyrightStart: number; copyrightEnd: number } | undefined | null,
  now: Date = new Date(),
) {
  const end = footer?.copyrightEnd || now.getFullYear();
  const start = footer?.copyrightStart || 0;
  if (start && end && start !== end) return `${start} – ${end}`;
  return String(end);
}
