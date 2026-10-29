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

/**
 * 公开摘要：优先用作者写的摘要，没写就从正文里取开头像样的一段。
 *
 * 直接截正文前 N 个字不行 —— 正文通常以标题开头，截出来是
 * 「标题 + 半句话」，读者在卡片、首页横幅、RSS 里看到的就是一堆碎片。
 * 这里先把开头的标题行剥掉，再在句子边界断开。
 */
export function publicExcerpt(
  content: string,
  summary?: string | null,
  limit = 200,
) {
  const own = summary?.trim();
  if (own) return own;
  const text = publicText(firstProseBlock(content));
  if (!text) return "";
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  // 在最近的句子边界断开，别切在半句话上。
  const stop = Math.max(
    head.lastIndexOf("。"),
    head.lastIndexOf("！"),
    head.lastIndexOf("？"),
    head.lastIndexOf("；"),
  );
  if (stop > limit * 0.3) return head.slice(0, stop + 1) + "…";
  return head.replace(/[\s、，,：:].*$/, "") + "…";
}

/**
 * 取正文里第一段不是标题的内容。
 *
 * 标题行（# / ## …）跟文章标题重复，拿来当摘要没意义；
 * 但标题后面紧跟着正文（中间只隔一个换行）时，要把标题行剥掉，
 * 而不是把整段丢掉。
 */
function firstProseBlock(content: string) {
  for (const block of content.split(/\n{2,}/)) {
    const lines = block.split("\n");
    // 开头的标题行跟文章标题重复，拿来当摘要没意义。
    while (lines.length && /^\s{0,3}#{1,6}\s/.test(lines[0])) lines.shift();
    // 段落里再遇到标题就是新的一节了 —— 摘要到这儿为止，
    // 不然「推荐目标」后面会接上「推荐策略维度」，读起来像两段话拼的。
    const cut = lines.findIndex((l) => /^\s{0,3}#{1,6}\s/.test(l));
    const text = (cut >= 0 ? lines.slice(0, cut) : lines).join("\n").trim();
    if (text) return text;
  }
  return "";
}
