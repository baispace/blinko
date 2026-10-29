/**
 * 公开博客的来源采集。
 *
 * 采集边界（刻意做窄）：
 *   - 只取 referrer 的**主机名**，不上传完整来源 URL。查询串里可能带搜索词、
 *     会话标识之类的东西，不该离开浏览器。
 *   - 不采集 IP、UA、任何浏览器指纹。访客身份只用那个本地生成的随机设备 ID。
 *   - 站内跳转靠 sessionStorage 记一小段上下文：SPA 的 pushState 不会更新
 *     document.referrer，只靠 referrer 会把站内点击误判成外部来源。
 */

const ENTRY_KEY = "ink-blog-entry";
/** 站内入口上下文的有效期：半小时，够走完一次阅读，又不会跨天误用。 */
const ENTRY_TTL = 30 * 60 * 1000;

export type BlogEntry = {
  entry: string;
  at: number;
};

/** 访客所在站点的主机名。 */
export function blogSiteHost(): string {
  try {
    return location.hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** referrer 的主机名；没有 referrer 就是空串。 */
export function blogReferrerHost(): string {
  try {
    const ref = document.referrer;
    if (!ref) return "";
    const url = new URL(ref);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * 导航类型。
 *
 * navigate = 全新导航（直接输入地址、书签、分享链接）
 * reload / back_forward = 刷新或前进后退，这时 referrer 通常拿不到
 */
export function blogNavigationType(): string {
  try {
    const entries = performance.getEntriesByType("navigation");
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    return nav?.type ?? "";
  } catch {
    return "";
  }
}

/** 记下「用户是从站内哪个位置点过来的」。 */
export function rememberBlogEntry(entry: string) {
  try {
    sessionStorage.setItem(
      ENTRY_KEY,
      JSON.stringify({ entry, at: Date.now() }),
    );
  } catch {
    /* 隐私模式下写不了就算了，服务端会退回 referrer 判定 */
  }
}

/** 读取上一次的站内入口上下文。 */
export function readBlogEntry(): BlogEntry | null {
  try {
    const raw = sessionStorage.getItem(ENTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BlogEntry;
    if (
      !parsed ||
      typeof parsed.at !== "number" ||
      Date.now() - parsed.at > ENTRY_TTL
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 组装上报用的来源线索。
 *
 * internalNav 为真表示「这次是站内点过来的」，服务端会直接归为站内来源，
 * 不再拿 referrer 去猜 —— SPA 里 document.referrer 不会随路由变化更新。
 */
export function blogAttribution(entry: string, internalNav = false) {
  return {
    referrer: blogReferrerHost(),
    entry,
    navigationType: blogNavigationType(),
    siteHost: blogSiteHost(),
    internalNav,
  };
}
