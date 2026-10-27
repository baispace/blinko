/**
 * 作者卡顶部胶囊的动态短句。
 *
 * 这块胶囊过去只放一句静态身份标签（取自 tagline 的前段），信息量很低，
 * 而且跟卡片底部的介绍句读起来像同一句话拆成两半。现在它改成一句会变的短句：
 * 固定的鼓励文案打底，再按读者本地时间补一条「此刻才成立」的提示
 * （深夜提示休息、清晨问候、午间歇一歇）。
 *
 * 规则保持简单：
 *   · 纯前端文案池，不落库 —— 换一句话不需要迁移数据，也不用给后台加入口；
 *   · 与统计实现一样只说真话 —— 这里全是写死的文案，不假装是站点数据；
 *   · 纯函数，便于单测与复用。
 */

/**
 * 与时间无关的固定文案，任何时候都在池子里。
 *
 * 保持短句：胶囊只有一行宽，太长会被截断，也会把卡片顶得更高。
 */
export const AUTHOR_STATUS_QUOTES: readonly string[] = [
  "如果遇到困难，尝试再坚持一次",
  "已经没了，就这些了",
  "保持好奇，持续记录",
];

/** 一条轮播周期（毫秒）。 */
export const AUTHOR_STATUS_INTERVAL = 6000;

/**
 * 按小时挑一条只在此刻成立的提示；不属于任何时段时返回 null。
 *
 * @param hour 读者本地小时（0-23）
 */
export function authorStatusForHour(hour: number): string | null {
  if (hour < 5) return "这么晚了，读完就去睡";
  if (hour < 9) return "早，先读一篇再开始";
  if (hour >= 12 && hour < 14) return "中午了，先去吃点东西";
  if (hour >= 22) return "很晚了，读完这篇就休息";
  return null;
}

/**
 * 当前轮播文案序列：时段提示排前面，其余是固定池。
 *
 * 每次切句时重新取一次 —— 页面开着跨过整点，时段提示会自己换掉。
 */
export function authorStatusPool(now: Date = new Date()): string[] {
  const timed = authorStatusForHour(now.getHours());
  return timed ? [timed, ...AUTHOR_STATUS_QUOTES] : [...AUTHOR_STATUS_QUOTES];
}
