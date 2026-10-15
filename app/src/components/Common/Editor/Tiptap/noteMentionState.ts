import { makeAutoObservable, runInAction } from 'mobx';
import type { Editor } from '@tiptap/core';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { api } from '@/lib/trpc';

/**
 * Per-editor note mention state (one instance per EditorStore).
 * Fed by the NoteMention suggestion plugin, rendered by NoteMentionList.tsx.
 */
export class NoteMentionState {
  isOpen = false
  items: NoteMentionItem[] = []
  selectedIndex = 0
  rect: { top: number; left: number; bottom: number } | null = null
  command: ((item: NoteMentionItem) => void) | null = null
  editor: Editor | null = null
  query = ''
  loading = false
  error = ''

  private abortController: AbortController | null = null
  private requestVersion = 0
  private searchTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    makeAutoObservable(this)
  }

  private getRect(props: SuggestionProps) {
    try {
      const r = typeof props.clientRect === 'function' ? props.clientRect() : props.clientRect
      if (!r) return null
      return { top: r.top, left: r.left, bottom: r.bottom }
    } catch {
      return null
    }
  }

  async searchNotes(query: string) {
    this.query = query
    const version = ++this.requestVersion
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.abortController?.abort()
    this.items = []
    this.error = ''
    this.loading = true
    this.searchTimer = setTimeout(async () => {
      const controller = new AbortController()
      this.abortController = controller
      try {
        const result = await api.notes.list.mutate({
          searchText: query.trim(), size: 15, type: -1, isArchived: null,
        }, { signal: controller.signal })
        if (version !== this.requestVersion || !this.isOpen) return
        runInAction(() => {
          this.items = result.filter(note => note.id !== this.currentNoteId).map(note => ({
            id: note.id,
            title: String((note.metadata as { title?: string } | null)?.title || this.extractTitle(note.content || '')),
            content: note.content || '',
          }))
          this.selectedIndex = 0
          this.loading = false
        })
      } catch (error: any) {
        if (version !== this.requestVersion || !this.isOpen) return
        runInAction(() => {
          this.loading = false
          if (error.name !== 'AbortError' && error.name !== 'CanceledError') this.error = '搜索失败，请重试'
        })
      }
    }, query.trim() ? 180 : 0)
  }

  currentNoteId: number | undefined = undefined

  private extractTitle(content: string): string {
    // Extract first line or first heading as title
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length === 0) return 'Untitled'

    const firstLine = lines[0]
    // Remove markdown heading symbols
    return firstLine.replace(/^#+\s*/, '').slice(0, 50) || 'Untitled'
  }

  open(props: SuggestionProps) {
    this.editor = props.editor
    this.items = props.items ?? []
    this.selectedIndex = 0
    this.rect = this.getRect(props)
    this.command = (item) => props.command(item)
    this.isOpen = true
    this.query = ''

    // Initial search for recent notes
    this.searchNotes(props.query || '')
  }

  update(props: SuggestionProps) {
    if (!this.isOpen) {
      this.open(props)
      return
    }
    if (this.selectedIndex >= this.items.length) this.selectedIndex = Math.max(0, this.items.length - 1)
    this.rect = this.getRect(props)
    this.command = (item) => props.command(item)

    // Extract query from editor
    const query = props.query ?? this.extractQuery(props)
    if (query !== this.query) {
      this.searchNotes(query)
    }
  }

  private extractQuery(props: SuggestionProps): string {
    try {
      const { state } = props.editor
      const $from = state.selection.$from
      const textBefore = $from.parent.textBetween(
        Math.max(0, $from.parentOffset - 50),
        $from.parentOffset,
        null,
        '\uFFFC'
      )
      const atIndex = textBefore.lastIndexOf('@')
      return atIndex >= 0 ? textBefore.slice(atIndex + 1) : ''
    } catch {
      return ''
    }
  }

  close() {
    ++this.requestVersion
    this.error = ''
    this.isOpen = false
    this.command = null
    this.rect = null
    this.items = []
    this.query = ''
    this.loading = false
    if (this.searchTimer) clearTimeout(this.searchTimer)
    if (this.abortController) this.abortController.abort()
  }

  next() {
    if (!this.items.length) return
    this.selectedIndex = (this.selectedIndex + 1) % this.items.length
  }

  prev() {
    if (!this.items.length) return
    this.selectedIndex = (this.selectedIndex + this.items.length - 1) % this.items.length
  }

  selectCurrent() {
    const item = this.items[this.selectedIndex]
    if (!item) return
    this.command?.(item)
  }

  onKeyDown(props: SuggestionKeyDownProps): boolean {
    const { event } = props
    if (event.key === 'ArrowUp') { this.prev(); return true }
    if (event.key === 'ArrowDown') { this.next(); return true }
    if (event.key === 'Enter' && this.items.length) { this.selectCurrent(); return true }
    if (event.key === 'Escape') { this.close(); return true }
    return false
  }
}

export interface NoteMentionItem {
  id: number
  title: string
  content: string
}
