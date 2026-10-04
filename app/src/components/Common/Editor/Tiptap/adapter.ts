import type { Editor } from '@tiptap/core';
import { SlashMenuState } from './slashMenuState';
import { NoteMentionState } from './noteMentionState';
import { normalizeBlankLines } from './markdownBlankLine';

/**
 * Adapter that mimics the (small) Vditor API surface used by EditorStore
 * and toolbar buttons, backed by a Tiptap Editor instance.
 *
 *  - getValue()       -> markdown output (tiptap-markdown serializer)
 *  - setValue(md)     -> parse markdown into the doc (tiptap-markdown patched setContent)
 *  - insertValue(md)  -> insert markdown at cursor (tiptap-markdown patched insertContent)
 *  - insertMD(md)     -> alias of insertValue (vditor API name)
 *  - focus() / destroy()
 */
export class TiptapEditorAdapter {
  editor: Editor | null = null
  slashMenu: SlashMenuState = new SlashMenuState()
  noteMention: NoteMentionState = new NoteMentionState()

  getValue(): string {
    try {
      return this.editor?.storage?.markdown?.getMarkdown?.() ?? ''
    } catch {
      return ''
    }
  }

  setValue(markdown: string) {
    if (!this.editor) return
    // 历史内容的连续空行 → nbsp 占位行，保证编辑器中可见（代码围栏内不动）
    this.editor.commands.setContent(normalizeBlankLines(markdown ?? ''), false)
  }

  insertValue(markdown: string, _clean?: boolean) {
    this.insertMD(markdown)
  }

  /**
   * Insert markdown text at the current cursor.
   * The Markdown extension patches insertContent so plain strings are
   * parsed as markdown automatically (plain text stays plain).
   */
  insertMD(text: string) {
    const editor = this.editor
    if (!editor || !text) return
    try {
      const clean = text.replace(/&nbsp;/g, ' ')
      editor.chain().focus().insertContent(clean).run()
    } catch (e) {
      console.error('insertMD failed', e)
    }
  }

  focus() {
    try {
      this.editor?.commands.focus('end')
    } catch { /* editor might be destroyed */ }
  }

  destroy() {
    try {
      this.editor?.destroy()
    } catch { /* already destroyed */ }
    this.editor = null
    this.slashMenu.close()
    this.noteMention.close()
  }
}
