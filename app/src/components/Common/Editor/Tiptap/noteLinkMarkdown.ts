import type MarkdownIt from 'markdown-it'
import { NOTE_LINK_REGEX } from '@shared/lib/noteLink'

/** 无 g 标志，用来在当前位置匹配一整段 `[[id|title]]` */
export const NOTE_LINK_AT_START = new RegExp(`^${NOTE_LINK_REGEX.source}`)

const escapeAttr = (v: string) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * markdown-it 插件：把正文里的 `[[id|title]]` 转成
 * `<span data-type="note-link" data-id="…" data-title="…">`，
 * 再由 Tiptap NoteLink 节点的 parseHTML 接手。
 *
 * 放在 backticks 之后，避免行内代码里的双链被误解析。
 */
export function noteLinkMarkdownPlugin(md: MarkdownIt) {
  // tiptap-markdown 每次 parse 都会再跑一遍 setup，避免重复注册
  if ((md as any)._noteLinkPlugin) return
  ;(md as any)._noteLinkPlugin = true

  md.inline.ruler.after('backticks', 'noteLink', (state, silent) => {
    const pos = state.pos
    if (state.src.charCodeAt(pos) !== 0x5B || state.src.charCodeAt(pos + 1) !== 0x5B) {
      return false
    }
    const match = state.src.slice(pos).match(NOTE_LINK_AT_START)
    if (!match) return false
    const id = Number(match[1])
    if (!Number.isInteger(id) || id <= 0) return false
    if (!silent) {
      const token = state.push('noteLink', 'span', 0)
      token.attrSet('data-type', 'note-link')
      token.attrSet('data-id', String(id))
      token.attrSet('data-title', match[2])
    }
    state.pos += match[0].length
    return true
  })

  md.renderer.rules.noteLink = (tokens, idx) => {
    const token = tokens[idx]
    const id = escapeAttr(token.attrGet('data-id') || '')
    const title = escapeAttr(token.attrGet('data-title') || '')
    return `<span data-type="note-link" data-id="${id}" data-title="${title}"></span>`
  }
}
