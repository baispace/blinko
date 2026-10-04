import { makeAutoObservable, runInAction } from 'mobx';
import type { Editor } from '@tiptap/core';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';

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

  private abortController: AbortController | null = null
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

    // Debounce search
    if (this.searchTimer) clearTimeout(this.searchTimer)

    if (!query.trim()) {
      this.items = []
      return
    }

    this.searchTimer = setTimeout(async () => {
      this.loading = true

      // Cancel previous request
      if (this.abortController) {
        this.abortController.abort()
      }
      this.abortController = new AbortController()

      try {
        const result = await RootStore.Get(api).note.list.query({
          searchText: query,
          size: 10,
          // Exclude current note to avoid self-reference
          // type: -1 means all types
        }, {
          signal: this.abortController.signal,
        })

        runInAction(() => {
          this.items = result.map(note => ({
            id: note.id,
            title: this.extractTitle(note.content || ''),
            content: note.content || '',
          }))
          this.loading = false
          if (this.items.length > 0) {
            this.selectedIndex = 0
          }
        })
      } catch (error: any) {
        if (error.name !== 'AbortError' && error.name !== 'CanceledError') {
          console.error('Failed to search notes:', error)
        }
        runInAction(() => {
          this.loading = false
        })
      }
    }, 200)
  }

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
    this.searchNotes('')
  }

  update(props: SuggestionProps) {
    if (!this.isOpen) {
      this.open(props)
      return
    }
    this.items = props.items ?? []
    if (this.selectedIndex >= this.items.length) this.selectedIndex = Math.max(0, this.items.length - 1)
    this.rect = this.getRect(props)
    this.command = (item) => props.command(item)

    // Extract query from editor
    const query = this.extractQuery(props)
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
    if (event.key === 'Enter') { this.selectCurrent(); return true }
    if (event.key === 'Escape') { this.close(); return true }
    return false
  }
}

export interface NoteMentionItem {
  id: number
  title: string
  content: string
}
