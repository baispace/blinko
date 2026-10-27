/**
 * 正文标题 → 稳定锚点。
 *
 * 目录和「本文目录」浮层都靠它跳转，所以锚点必须满足三件事：
 *   1. 稳定 —— 同一段正文每次打开都得到同一个 id（不用序号，序号会随正文变化漂移）；
 *   2. 唯一 —— 重复标题（同一篇文章里常出现）不能撞车；
 *   3. 兼容中文 —— 中文标题要能直接当 id 用，不能只剩一串编码。
 */

/** 标题文本 → id 片段。保留字母、数字（含中文）与短横线，其余去掉。 */
export function headingSlug(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

export type ArticleHeading = {
  id: string;
  text: string;
  level: number;
};

/**
 * 从正文 DOM 生成标题清单。
 *
 * 重复标题按出现顺序加 -2 / -3 后缀，保证同一篇文章内唯一。
 * 直接改 DOM 的 id —— 正文里已有的链接（作者自己写的锚点链接）不依赖它，
 * 但目录跳转依赖它，所以两处必须用同一个函数。
 */
export function buildArticleHeadings(root: HTMLElement): ArticleHeading[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>("h2, h3, h4"),
  );
  const used = new Map<string, number>();
  const list: ArticleHeading[] = [];
  for (const node of nodes) {
    const text = (node.textContent || "").trim();
    if (!text) continue;
    const base = headingSlug(text);
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    const id = seen === 0 ? base : `${base}-${seen + 1}`;
    node.id = id;
    list.push({ id, text, level: Number(node.tagName.slice(1)) });
  }
  return list;
}

/**
 * 目录里的序号：按标题级别各自计数。
 *
 * h2 是「章」，h3/h4 是章内的「节」。每级单独编号，读起来才像目录，
 * 而不是把一串序号平铺在每个标题前面。
 */
export function headingNumbers(headings: ArticleHeading[]) {
  const counters = new Map<number, number>();
  return headings.map((heading) => {
    const level = heading.level;
    const next = (counters.get(level) ?? 0) + 1;
    counters.set(level, next);
    return {
      ...heading,
      number: String(next).padStart(2, "0"),
      depth: level === 2 ? 0 : level === 3 ? 1 : 2,
    };
  });
}
