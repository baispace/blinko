import HardBreak from '@tiptap/extension-hard-break';

/**
 * tiptap-markdown 默认把 hardBreak 序列化成 `\` + 换行（标准 CommonMark 硬换行），
 * 反斜杠会写进正文，污染所有不走 MarkdownRender 的消费方（引用摘要、笔记选择器、
 * 卡片摘要、导出、AI 上下文等）。
 *
 * 解析器已开 breaks:true，裸 `\n` 同样能被解回 hardBreak —— 往返闭合。
 * 这里覆盖 hardBreak 的 serialize，让非表格场景直接输出裸 `\n`：
 *   - 正文保持干净
 *   - stripTrailingBackslashes 兜底逻辑可以大幅缩窄（仅处理存量 `\\\nB`）
 *
 * 表格里仍输出 `<br>`，否则 markdown 表格会在硬换行处断行破坏结构。
 */
export const MarkdownHardBreak = HardBreak.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node, parent, index) {
          for (let i = index + 1; i < parent.childCount; i++) {
            if (parent.child(i).type !== node.type) {
              state.write(state.inTable ? '<br>' : '\n')
              return
            }
          }
        },
      },
    }
  },
})
