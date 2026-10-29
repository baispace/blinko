/**
 * 博客站的明暗主题。
 *
 * 公开站与管理后台共用同一个 localStorage 键 —— 在公开站切了深色，
 * 进管理后台还是同一套明暗，反过来也一样。
 */
export const BLOG_THEME_KEY = "ink-blog-theme";

export function readBlogTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(BLOG_THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}
