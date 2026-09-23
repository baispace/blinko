import { makeAutoObservable } from 'mobx';
import type { Editor } from '@tiptap/core';
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion';

/**
 * Per-editor slash menu state (one instance per EditorStore).
 * Fed by the SlashCommand suggestion plugin, rendered by SlashMenu.tsx.
 */
export class SlashMenuState {
  isOpen = false
  items: any[] = []
  selectedIndex = 0
  rect: { top: number; left: number; bottom: number } | null = null
  command: ((item: any) => void) | null = null
  editor: Editor | null = null

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

  open(props: SuggestionProps) {
    this.editor = props.editor
    this.items = props.items ?? []
    this.selectedIndex = 0
    this.rect = this.getRect(props)
    this.command = (item) => props.command(item)
    this.isOpen = true
  }

  update(props: SuggestionProps) {
    if (!this.isOpen) {
      this.open(props)
      return
    }
    this.items = props.items ?? []
    if (this.selectedIndex >= this.items.length) this.selectedIndex = Math.max(0, this.items.length - 1)
    this.rect = this.getRect(props)
    // IMPORTANT: refresh the command closure so it carries the LATEST range
    // (otherwise the query text typed after start is not deleted on execute)
    this.command = (item) => props.command(item)
  }

  close() {
    this.isOpen = false
    this.command = null
    this.rect = null
    this.items = []
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
