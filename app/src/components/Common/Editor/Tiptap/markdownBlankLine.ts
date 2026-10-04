import Paragraph from '@tiptap/extension-paragraph'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * 空白行（空段落）支持。
 *
 * 背景：markdown 语法中「多个连续空行」等价于一个段落分隔符，纯空白行
 * 无法表达「空段落」—— tiptap-markdown 默认序列化会把空 <p> 输出成空字符串，
 * 下一次解析时被折叠丢失，表现为「编辑器里按两次 Enter 的空行保存后消失」。
 *
 * 方案（Feishu/Notion 同款思路）：
 *  - 序列化：空段落输出一行 U+00A0（nbsp）。CommonMark 只把空格/制表符行
 *    视为 blank line，nbsp 行是一个合法段落，可稳定往返。
 *  - 解析：nbsp 行被 markdown-it 解析成只含 "\u00a0" 文本的段落，
 *    用 appendTransaction 归一化回真正的空段落，保证光标落入后输入不被污染。
 *  - 旧数据：DB 里可能存在 "\n{3,}" 形态的历史空白行，normalizeBlankLines
 *    在装载进编辑器前把多余空行转换成 nbsp 行（代码围栏内不动）。
 */

/** 判断段落是否为「只含一个 nbsp 文本」的占位段落 */
function isNbspPlaceholderParagraph(node: any): boolean {
  return (
    node.type.name === 'paragraph' &&
    node.childCount === 1 &&
    node.firstChild.isText &&
    node.firstChild.text === '\u00a0'
  )
}

export const MarkdownBlankLine = Paragraph.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          if (node.childCount === 0) {
            // 空段落 → 一行 nbsp 占位，避免往返丢失
            state.write('\u00a0')
          } else {
            // 与 prosemirror-markdown 默认 paragraph 序列化一致
            state.renderInline(node)
          }
          state.closeBlock(node)
        },
        parse: {
          // 交给 markdown-it 处理
        },
      },
    }
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('nbspBlankLineNormalize'),
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) return null
          const targets: { pos: number; size: number }[] = []
          newState.doc.descendants((node, pos) => {
            if (isNbspPlaceholderParagraph(node)) {
              targets.push({ pos, size: node.nodeSize })
            }
          })
          if (!targets.length) return null
          const tr = newState.tr
          // 从后往前替换，避免位置偏移
          for (const { pos, size } of targets.reverse()) {
            tr.replaceWith(pos, pos + size, newState.schema.nodes.paragraph.create())
          }
          return tr
        },
      }),
    ]
  },
})

/**
 * 把 markdown 源码里的「多余连续空行」转换成 nbsp 占位行，
 * 使历史内容（API 导入 / 手工编辑 DB）中的空白行在编辑器中可见。
 *
 * 规则：段落之间 k 个空行 = 1 个段落分隔符 + (k-1) 个空段落。
 * 代码围栏（``` / ~~~）内的空行原样保留。
 * 幂等：规范化后的内容再次输入不会再变化。
 */
export function normalizeBlankLines(markdown: string): string {
  if (!markdown || markdown.indexOf('\n') === -1) return markdown
  const lines = markdown.split('\n')
  const out: string[] = []
  let blankRun = 0
  let inFence = false

  const flushBlankRun = () => {
    if (blankRun === 0) return
    if (out.length > 0) {
      // 第 1 个空行 = 段落分隔符；之后每个空行 = 1 个空段落（nbsp 行，各自独立成段）
      out.push('')
      for (let i = 1; i < blankRun; i++) {
        out.push('\u00a0')
        out.push('')
      }
    }
    // 文档开头的空行直接丢弃（markdown 解析本来就会忽略）
    blankRun = 0
  }

  for (const line of lines) {
    if (!inFence && /^\s{0,3}(```|~~~)/.test(line)) {
      flushBlankRun()
      inFence = true
      out.push(line)
      continue
    }
    if (inFence) {
      // 围栏内的行原样保留；闭合围栏行切回普通模式
      out.push(line)
      if (/^\s{0,3}(```|~~~)/.test(line)) inFence = false
      continue
    }
    if (line === '' || /^[ \t]+$/.test(line)) {
      // CommonMark 口径：仅空格/制表符的行是 blank line；
      // nbsp（\u00a0）行不算 blank，否则规范化不幂等
      blankRun++
      continue
    }
    flushBlankRun()
    out.push(line)
  }
  // 末尾空行丢弃（markdown 解析同样忽略）
  return out.join('\n')
}
