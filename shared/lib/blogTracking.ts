/**
 * 第三方统计接入的公共规则。
 *
 * 前后端共用一份：前端从粘贴的安装代码里提取编号，后端校验保存的配置。
 * 两边各写一套正则，迟早会漂移成「前端能提取、后端说格式不对」。
 */

export const TRACKING_VENDORS = ["ga", "baidu"] as const;
export type TrackingVendor = (typeof TRACKING_VENDORS)[number];

/** GA4 衡量 ID：G- 开头的大写字母数字。 */
export const GA_ID_RE = /^G-[A-Z0-9]+$/;
/** 百度统计站点编号：32 位小写十六进制。 */
export const BAIDU_ID_RE = /^[a-f0-9]{32}$/;

/** 编号格式是否合法。百度官方编号是小写十六进制，与站点设置里的校验保持一致。 */
export function isValidTrackingId(vendor: TrackingVendor, id: string) {
  const value = (id ?? "").trim();
  if (vendor === "ga") return GA_ID_RE.test(value);
  return BAIDU_ID_RE.test(value);
}

/**
 * 从服务商安装代码里提取编号。
 *
 * 只认官方文档给出的写法，提取不到就返回失败原因 —— 随手在文本里抓一段
 * 相似字符串当编号，会把一个错编号当成有效配置存下去。
 *
 * 支持的官方写法：
 *   GA4    gtag('config', 'G-XXXXXXXXXX')
 *          https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX
 *   百度   hm.src = "https://hm.baidu.com/hm.js?编号"
 *          hm.src = "https://hm.baidu.com/hm.js?" + "编号"
 */
export function extractTrackingId(
  vendor: TrackingVendor,
  code: string,
): { id: string; reason?: string } {
  const text = (code ?? "").trim();
  if (!text) return { id: "", reason: "还没有粘贴安装代码" };
  if (vendor === "ga") {
    const match =
      text.match(/gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/i) ||
      text.match(/gtag\/js\?id=(G-[A-Z0-9]+)/i);
    if (!match)
      return {
        id: "",
        reason:
          "没有识别到 GA4 衡量 ID。支持 gtag('config', 'G-…') 或 gtag/js?id=G-… 两种官方写法。",
      };
    return { id: match[1].toUpperCase() };
  }
  const match =
    text.match(/hm\.baidu\.com\/hm\.js\?([a-f0-9]{32})/i) ||
    text.match(/hm\.baidu\.com\/hm\.js\?["']?\s*\+\s*["']([a-f0-9]{32})["']/i);
  if (!match)
    return {
      id: "",
      reason:
        '没有识别到百度站点编号。支持 hm.baidu.com/hm.js?编号 与 hm.baidu.com/hm.js?" + "编号" 两种官方写法。',
    };
  return { id: match[1].toLowerCase() };
}
