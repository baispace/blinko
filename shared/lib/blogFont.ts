/**
 * 公开博客前台用的字体。
 *
 * 字体来自注册表（fonts 表）：每个字体有一个名字和一份 @font-face 样式表地址。
 * 服务端把样式表地址和字体栈一起注入公开页的 head，访客第一次打开就能用上 ——
 * 不需要等前端脚本跑完再换字体，也不会有「先闪一下系统字体」的跳动。
 *
 * 这一层只做纯计算，服务端和前端共用同一套口径。
 */

/**
 * 系统字体栈：中文落到 PingFang / 微软雅黑，西文落到系统 UI 字体。
 *
 * 与博客原本写死的栈一致 —— 换字体时它仍然兜底，字体没加载出来也不会掉成宋体。
 */
export const BLOG_FONT_FALLBACK =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 字体名里带空格或符号时要加引号，否则 CSS 解析会断。
 *
 * 例："Noto Sans SC" → "Noto Sans SC"；Inter → Inter（不加引号也没问题）。
 */
export function blogFontFamily(name: string | null | undefined) {
  const trimmed = (name || "").trim();
  if (!trimmed) return "";
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  return `"${trimmed.replace(/["\\]/g, "")}"`;
}

/** 拼出博客前台要用的完整字体栈。留空时就是系统字体栈。 */
export function blogFontStack(name: string | null | undefined) {
  const family = blogFontFamily(name);
  if (!family) return BLOG_FONT_FALLBACK;
  return `${family}, ${BLOG_FONT_FALLBACK}`;
}

/** 注入到 :root 的 CSS 变量名。 */
export const BLOG_FONT_VARIABLE = "--ink-blog-font";
