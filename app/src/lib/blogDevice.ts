/**
 * 博客统计用的浏览器端匿名设备 ID。
 *
 * 去重完全靠这个 ID：它随机生成后保存在 localStorage 与第一方 Cookie 中，服务端只当
 * 不透明字符串用 —— 拿不到 IP、UA，也没有任何指纹。同一站点、同一浏览器且标识未被全部清除时视为同一个
 * 设备，所以「读者数」就是去重后的设备数，「点击数」才是访问次数。
 */
const DEVICE_KEY = "ink-blog-device";
const COOKIE_KEY = "ink_blog_visitor";
/** 置成 "off" 就不再上报（给不想被统计的访客留的开关）。 */
const OPT_OUT_KEY = "ink-blog-statistics";
let excludeOwner = true;
export function configureBlogStatistics(
  value: { excludeOwner?: boolean } | null | undefined,
) {
  excludeOwner = value?.excludeOwner !== false;
}
export function markBlogManager() {
  try {
    localStorage.setItem("ink-blog-manager", "1");
  } catch {}
  try {
    sessionStorage.setItem("ink-blog-manager", "1");
  } catch {}
}
export function isBlogManagerBrowser() {
  try {
    if (localStorage.getItem("ink-blog-manager") === "1") return true;
  } catch {}
  try {
    return sessionStorage.getItem("ink-blog-manager") === "1";
  } catch {
    return false;
  }
}
export function isLocalBlogHost(host: string) {
  return (
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase()) ||
    host.toLowerCase().endsWith(".localhost")
  );
}
const DEVICE_ID = /^[0-9a-f]{32}$/;

function randomHex() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** First-party recovery only; never sent as an authentication credential. */
function cookieDevice(): string | null {
  try {
    const value = document.cookie
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith(COOKIE_KEY + "="))
      ?.slice(COOKIE_KEY.length + 1);
    return value && DEVICE_ID.test(value) ? value : null;
  } catch {
    return null;
  }
}
export function blogDeviceId(): string | null {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(DEVICE_KEY);
  } catch {}
  // Cookie is canonical when two tabs created different local values concurrently.
  const id =
    cookieDevice() ||
    (saved && DEVICE_ID.test(saved) ? saved : null) ||
    randomHex();
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {}
  try {
    document.cookie = `${COOKIE_KEY}=${id}; Path=/; Max-Age=31536000; SameSite=Lax${typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : ""}`;
  } catch {}
  try {
    if (localStorage.getItem(DEVICE_KEY) === id) return id;
  } catch {}
  return cookieDevice() === id ? id : null;
}
/** Serialize first identity creation between same-origin tabs where Web Locks exists. */
export async function initializeBlogDevice(): Promise<void> {
  if (!blogStatsEnabled()) return;
  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request("ink-blog-visitor-init", () => {
        blogDeviceId();
      });
    } else blogDeviceId();
  } catch {
    blogDeviceId();
  }
}

/** 访客是否同意被统计。默认同意，显式关掉才不上报。 */
export function blogStatsEnabled(): boolean {
  let preference: string | null = null;
  try {
    preference = localStorage.getItem(OPT_OUT_KEY);
  } catch {}
  if (preference === "off") return false;
  // Local previews do not pollute production counters. Explicit 'on' allows debugging.
  if (
    typeof location !== "undefined" &&
    isLocalBlogHost(location.hostname) &&
    preference !== "on"
  )
    return false;
  if (excludeOwner && isBlogManagerBrowser()) return false;
  return true;
}
