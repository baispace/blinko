/**
 * 正文清洗：把笔记正文变成可以公开展示的纯文本。
 *
 * 公开页的卡片摘要、SEO 描述、封面提示词都走这里，管理端的列表摘要也一样 ——
 * 同一套规则，管理页看到的摘要才等于读者看到的摘要。
 *
 * 单独成文件是为了断开 publicBlog ↔ blog 的循环依赖：
 * blog.ts 要用它，publicBlog.ts 又依赖 blog.ts。
 */
export function publicText(content: string) {
  return content
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/(?:\*\*|__|~~|`{1,3})/g, "")
    .replace(/^\s*(?:---+|[-+*]\s+|\d+\.\s+)/gm, "")
    .replace(/^[#>*\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
