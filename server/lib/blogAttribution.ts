/**
 * 流量来源归因。
 *
 * 口径只有这一处实现，埋点接口与统计查询都调它 —— 不然「来源分布」和
 * 「来源埋点」会长成两套互不一致的分类。
 *
 * 三条硬规则：
 *   1. 外部访问来源（direct / search / referral）与站内入口（entry）分开记录。
 *      站内推荐、专题、搜索都算站内，不该被算成一次「新的外部来源」。
 *   2. 同站页面跳转不误判成外部来源：referrer 主机与站点主机相同即站内。
 *   3. 浏览器不给 referrer（隐私策略、扩展拦截、Referrer-Policy）时不能一律
 *      算成「直接访问」—— 只有导航类型确实是全新导航才归 direct，其余归 unknown。
 *
 * 只保留规范化后的来源域名，不存完整来源 URL：查询串里可能带搜索词、token
 * 之类的东西，不该进库。
 */

/** 来源分类。unknown 表示「无法识别」，不代表直接访问。 */
export const TRAFFIC_SOURCES = [
  "direct",
  "search",
  "referral",
  "internal",
  "unknown",
] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

/** 站内入口标识：用户是从站里哪个位置进来的。 */
export const TRAFFIC_ENTRIES = [
  "home",
  "topic",
  "search",
  "recommend",
  "detail",
  "topics",
  "about",
  "unknown",
] as const;
export type TrafficEntry = (typeof TRAFFIC_ENTRIES)[number];

/** 搜索引擎主机。命中即算「搜索引擎」，而不是「外部链接」。 */
const SEARCH_HOSTS = [
  "google.com",
  "google.com.hk",
  "google.co.jp",
  "google.co.uk",
  "google.de",
  "google.fr",
  "bing.com",
  "baidu.com",
  "sogou.com",
  "so.com",
  "sm.cn",
  "duckduckgo.com",
  "yahoo.com",
  "yahoo.co.jp",
  "yandex.ru",
  "ecosia.org",
  "search.brave.com",
  "startpage.com",
  "msn.com",
  "aol.com",
  "ask.com",
  "naver.com",
  "quark.sm.cn",
  "toutiao.com",
  "szse.cn",
  "so.toutiao.com",
];

function isSearchHost(host: string) {
  return SEARCH_HOSTS.some(
    (known) => host === known || host.endsWith("." + known),
  );
}

/** 主机名归一化：去协议、去 www、去端口、转小写。 */
export function normalizeHost(value: string): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  let host = raw;
  try {
    // 允许直接传完整 URL，也允许只传 host。
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) host = new URL(raw).host;
  } catch {
    host = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0];
  }
  host = host.split("@").pop() ?? host;
  host = host.split(":")[0];
  host = host.toLowerCase().replace(/^www\./, "");
  return host.slice(0, 120);
}

/** 站内入口白名单化：非法值一律降级为 unknown，不接受任意字符串。 */
export function normalizeEntry(value: unknown): TrafficEntry {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (TRAFFIC_ENTRIES as readonly string[]).includes(raw)
    ? (raw as TrafficEntry)
    : "unknown";
}

export type AttributionInput = {
  /** 浏览器给出的完整 referrer，服务端只留主机部分。 */
  referrer?: string;
  /** 站内入口标识。 */
  entry?: unknown;
  /** 导航类型：navigate / reload / back_forward / prerender。 */
  navigationType?: string;
  /** 站点自身主机（客户端取 location.hostname）。 */
  siteHost?: string;
  /** 服务端配置里的公开域名主机，可选，作为同站判定补充。 */
  configuredHost?: string;
  /**
   * 客户端明确标记「这是站内跳转过来的」。
   *
   * SPA 的 pushState 不会更新 document.referrer —— 用户在站内点进文章时，
   * referrer 仍是进入列表页之前那个来源。不带这个标记，服务端只能靠 referrer
   * 判断，站内点击会被算成外部来源。
   */
  internalNav?: boolean;
};

export type Attribution = {
  source: TrafficSource;
  referrerHost: string;
  entry: TrafficEntry;
};

/**
 * 归类一次访问。
 *
 * 顺序很重要：
 *   1. 客户端明确的站内跳转最可信 —— 站内推荐、专题、站内搜索都算站内。
 *   2. referrer 指向本站 = 站内跳转。
 *   3. referrer 是搜索引擎 = 搜索引擎；其余外部主机 = 外部链接。
 *   4. referrer 为空时，只有「全新导航」才算直接访问。刷新、前进后退、
 *      预渲染都拿不到 referrer，属于常态，归未知而不是直接访问。
 */
export function attribute(input: AttributionInput): Attribution {
  const entry = normalizeEntry(input.entry);
  const referrerHost = normalizeHost(input.referrer ?? "");
  const siteHost = normalizeHost(input.siteHost ?? "");
  const configured = normalizeHost(input.configuredHost ?? "");

  if (input.internalNav)
    return { source: "internal", referrerHost, entry };
  if (!referrerHost) {
    const nav = (input.navigationType ?? "").trim().toLowerCase();
    const direct = nav === "navigate";
    return {
      source: direct ? "direct" : "unknown",
      referrerHost: "",
      entry,
    };
  }
  if (
    (siteHost && referrerHost === siteHost) ||
    (configured && referrerHost === configured)
  ) {
    // 同站页面跳转：算站内，不是新的外部来源。
    return { source: "internal", referrerHost, entry };
  }
  if (isSearchHost(referrerHost))
    return { source: "search", referrerHost, entry };
  return { source: "referral", referrerHost, entry };
}

/** 来源的中文标签，用于后台展示。 */
export const SOURCE_LABELS: Record<TrafficSource, string> = {
  direct: "直接访问",
  search: "搜索引擎",
  referral: "外部链接",
  internal: "站内跳转",
  unknown: "未知来源",
};
