/**
 * 双向链接 `[[笔记ID|标题]]` 的唯一格式定义。
 *
 * 渲染侧（MarkdownRender/NoteLink）用它把双链转成可点卡片，服务端 upsert 用
 * `extractNoteLinkIds` 把正文里的双链解析成引用关系（noteReference）。
 * 两边必须共用这一份正则：渲染认得、解析也认得，否则会出现「显示成链接但没有反向关系」
 * 或「有反向关系但正文里不是链接」。
 */
export const NOTE_LINK_REGEX = /\[\[(\d+)\|([^\]]+)\]\]/g;

/** 取出正文里所有双链指向的笔记 ID（去重、只保留正整数） */
export const extractNoteLinkIds = (content?: string | null): number[] => {
  if (!content) return [];
  const ids = new Set<number>();
  for (const match of content.matchAll(NOTE_LINK_REGEX)) {
    const id = Number(match[1]);
    if (Number.isInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
};

/** 把 `[[id|title]]` 改写成渲染层能识别的 markdown 链接 */
export const preprocessNoteLinks = (content: string): string => {
  if (!content) return content;
  // 用新 RegExp 重建：带 g 标志的正则是有状态的，复用会导致隔次漏匹配
  return content.replace(new RegExp(NOTE_LINK_REGEX.source, 'g'), (_, id, title) => {
    return `[${title}](blinko://note/${id})`;
  });
};
