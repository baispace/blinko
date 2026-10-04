import { Extension, InputRule } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { SlashMenuState } from './slashMenuState';
import { NoteMentionState } from './noteMentionState';

export type SlashItem = {
  title: string
  icon: string
  keywords?: string
  command: (args: { editor: any; range: any }, runner?: AiSlashRunner) => void
}

/**
 * Injected by useEditor so this file stays free of store imports
 * (avoids a require cycle with aiStore -> components).
 */
export type AiSlashRunner = (
  writeType: 'expand' | 'polish',
  content: string,
  onComplete: (text: string) => void,
  /** Called on every exit path, including error and abort. */
  onSettled?: () => void
) => void

export type AiSlashBridge = {
  run: AiSlashRunner
  notify: (message: string) => void
  /** Kill the in-flight generation. Backs the ✕ on the pending chip. */
  abort: () => void
}

/**
 * "AI is still working" chip, rendered right after the paragraph that is being
 * rewritten. A generation takes 10-20s, and without this the click looks like
 * it did nothing at all.
 *
 * It is a ProseMirror *widget* decoration on purpose: the chip never becomes
 * part of the document, so it cannot leak into the note, break the markdown
 * round-trip, or pollute undo history.
 */
export type AiPending = { pos: number; onCancel?: () => void }

const AiPendingKey = new PluginKey<AiPending | null>('aiPending')

export const AiPendingIndicator = Extension.create({
  name: 'aiPendingIndicator',

  addProseMirrorPlugins() {
    return [
      new Plugin<AiPending | null>({
        key: AiPendingKey,
        state: {
          init: () => null,
          apply(tr, pending) {
            const meta = tr.getMeta(AiPendingKey)
            if (meta !== undefined) return meta as AiPending | null
            if (!pending) return null
            // The block the chip sits in can vanish (deleted, merged by an
            // undo, split in two) -- take the chip with it instead of drawing
            // it at a stale position.
            try {
              tr.doc.resolve(pending.pos)
            } catch {
              return null
            }
            return pending
          },
        },
        props: {
          decorations(state) {
            const pending = AiPendingKey.getState(state)
            if (!pending) return null

            const at = Math.min(pending.pos, state.doc.content.size)
            const dom = document.createElement('span')
            dom.className = 'ai-pending'
            dom.setAttribute('aria-hidden', 'true')
            for (let i = 0; i < 3; i++) dom.appendChild(document.createElement('i'))

            if (pending.onCancel) {
              const cancel = document.createElement('button')
              cancel.type = 'button'
              cancel.className = 'ai-pending-cancel'
              cancel.textContent = '✕'
              cancel.addEventListener('mousedown', (e) => e.preventDefault())
              cancel.addEventListener('click', (e) => {
                e.preventDefault()
                e.stopPropagation()
                pending.onCancel?.()
              })
              dom.appendChild(cancel)
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(at, dom, { side: 1, ignoreSelection: true }),
            ])
          },
        },
      }),
    ]
  },
})

export const showAiPending = (editor: any, pending: AiPending) => {
  hideAiPending(editor)
  editor.view.dispatch(editor.state.tr.setMeta(AiPendingKey, pending))
}

export const hideAiPending = (editor: any) => {
  if (!editor) return
  editor.view.dispatch(editor.state.tr.setMeta(AiPendingKey, null))
}

/**
 * The block the caret currently sits in. Used as the input scope for slash
 * AI actions so one action rewrites one paragraph instead of the whole note.
 *
 * Returns the *node* boundaries (not the inline range) so the result can be
 * swapped wholesale later -- the model often answers with several paragraphs,
 * which ProseMirror rejects when the target range sits inside a textblock.
 */
const currentBlock = (editor: any) => {
  try {
    const { state } = editor
    const $from = state.selection.$from
    return {
      start: $from.before(),
      end: $from.after(),
      // Inside the textblock, unlike `end` which is the block boundary. A
      // widget decoration placed at a block edge lands outside the paragraph
      // in the DOM (or is dropped outright); placed inside it, ProseMirror
      // always renders it as inline content at the end of the line.
      inlineEnd: $from.end(),
      text: state.doc.textBetween($from.start(), $from.end(), '\n'),
    }
  } catch {
    return { start: 0, end: 0, inlineEnd: 0, text: '' }
  }
}

const runAiSlash = (
  editor: any,
  range: any,
  bridge: AiSlashBridge,
  writeType: 'expand' | 'polish',
  mode: 'insert' | 'replace'
) => {
  // Drop the "/ai-xxx" token first; it lies inside the block, so re-read the
  // block afterwards instead of reusing positions captured before deletion.
  editor.chain().focus().deleteRange(range).run()
  const { start, end, inlineEnd, text } = currentBlock(editor)

  // Empty paragraph: bail out for *both* actions.
  //
  // An expand used to be allowed to fire with an empty seed, on the theory that
  // the model could just "write a fresh paragraph". It cannot -- the expand
  // prompt is literally "## Original Content\n{content}", so with nothing to
  // expand the model answers with meta-commentary ("It looks like you haven't
  // provided any content for me to expand yet...") instead of a paragraph,
  // which then lands in the note as garbage. Polishing air has no meaning at
  // all either. So: tell the user, keep the paragraph empty.
  if (!text.trim()) {
    bridge.notify('ai-slash-no-text')
    return
  }

  // Acknowledge the click immediately: the chip appears at the end of the
  // block and clears itself when the run settles (aiStore.writeStream calls
  // onSettled on success, error and abort alike).
  // An abort never reaches onComplete/onSettled, so clear the chip here too.
  showAiPending(editor, {
    pos: inlineEnd,
    onCancel: () => {
      hideAiPending(editor)
      bridge.abort()
    },
  })

  bridge.run(
    writeType,
    text,
    (result) => {
      hideAiPending(editor)
      if (!result?.trim()) return
      if (mode === 'replace') {
        editor.chain().focus().insertContentAt({ from: start, to: end }, result).run()
      } else {
        editor.chain().focus().insertContentAt({ from: end, to: end }, result).run()
      }
    },
    () => hideAiPending(editor)
  )
}

export const DEFAULT_SLASH_ITEMS: SlashItem[] = [
  {
    title: 'heading-1',
    icon: 'mdi:format-header-1',
    keywords: 'h1 title 标题 標題',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    title: 'heading-2',
    icon: 'mdi:format-header-2',
    keywords: 'h2 title 标题 標題',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    title: 'heading-3',
    icon: 'mdi:format-header-3',
    keywords: 'h3 title 标题 標題',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    title: 'bullet-list',
    icon: 'mdi:format-list-bulleted',
    keywords: 'ul unordered 无序 無序 list',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'ordered-list',
    icon: 'mdi:format-list-numbered',
    keywords: 'ol ordered 有序 list',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'task-list',
    icon: 'mdi:format-list-checks',
    keywords: 'todo check task 任务 任務 待办',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'quote',
    icon: 'mdi:format-quote-close',
    keywords: 'blockquote 引用',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'callout',
    icon: 'mdi:lightbulb-on-outline',
    keywords: 'callout highlight 高亮 提示 警告 note',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCallout({ type: 'info' }).run(),
  },
  {
    title: 'code-block',
    icon: 'mdi:code-braces',
    keywords: 'code 代码 代碼 pre',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'horizontal-rule',
    icon: 'mdi:minus',
    keywords: 'hr divider 分割 分割线 分隔',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'insert-table',
    icon: 'mdi:table',
    keywords: 'table 表格 表格',
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: 'ai-expand',
    icon: 'hugeicons:ai-beautify',
    keywords: 'ai expand 扩写 展开 详细 续写',
    command: ({ editor, range }, bridge) => {
      if (bridge) runAiSlash(editor, range, bridge, 'expand', 'insert')
    },
  },
  {
    title: 'ai-polish',
    icon: 'hugeicons:ai-beautify',
    keywords: 'ai polish 润色 优化 改进 改写',
    command: ({ editor, range }, bridge) => {
      if (bridge) runAiSlash(editor, range, bridge, 'polish', 'replace')
    },
  },
]

/**
 * Unified suggestion extension supporting both "/" commands and "@" note mentions.
 * Menu state lives in SlashMenuState (for /) and NoteMentionState (for @), rendered as React.
 */
export const SlashCommand = Extension.create<{
  slashMenu: SlashMenuState
  noteMention: NoteMentionState
  items: SlashItem[]
  aiBridge?: AiSlashBridge
}>({
  name: 'slashCommand',

  addOptions() {
    return {
      slashMenu: undefined as unknown as SlashMenuState,
      noteMention: undefined as unknown as NoteMentionState,
      items: DEFAULT_SLASH_ITEMS,
      aiBridge: undefined as AiSlashBridge | undefined,
    }
  },

  addProseMirrorPlugins() {
    const { slashMenu, noteMention, items, aiBridge } = this.options
    if (!slashMenu || !noteMention) return []

    const slashAi: AiSlashBridge = {
      run: (writeType, content, onComplete, onSettled) =>
        aiBridge?.run(writeType, content, onComplete, onSettled),
      notify: (message) => aiBridge?.notify(message),
      abort: () => aiBridge?.abort(),
    }

    // Detect which trigger char was used
    const getTrigger = (props: SuggestionProps): '/' | '@' => {
      try {
        const { state } = props.editor
        const $from = state.selection.$from
        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 10),
          $from.parentOffset,
          null,
          '\uFFFC'
        )
        if (textBefore.includes('@')) return '@'
        return '/'
      } catch {
        return '/'
      }
    }

    return [
      Suggestion({
        editor: this.editor,
        char: ['/', '@'], // Support both triggers
        allowSpaces: false,
        items: (props) => {
          const trigger = getTrigger(props)
          if (trigger === '@') {
            // For @, return empty - NoteMentionState fetches asynchronously
            return noteMention.items
          }
          // For /, filter slash commands
          const query = props.query.toLowerCase()
          return items.filter(i =>
            i.title.toLowerCase().includes(query) || (i.keywords ?? '').toLowerCase().includes(query)
          )
        },
        command: ({ editor, range, props: suggestionProps }) => {
          const trigger = getTrigger(suggestionProps)

          if (trigger === '@') {
            // Handle note mention selection
            const item = suggestionProps as any
            const text = `[[${item.id}|${item.title}]]`
            editor.chain().focus().deleteRange(range).insertContent(text).run()
            noteMention.close()
            return
          }

          // Handle slash command (original logic)
          // IME (Chinese input) committed query text may fall outside the
          // suggestion range; widen the deletion up to the nearest '/' so the
          // typed filter text doesn't leak into the document.
          try {
            const $from = editor.state.selection.$from
            const before = $from.parent.textBetween(0, $from.parentOffset, null, '\uFFFC')
            const slashIdx = before.lastIndexOf('/')
            if (slashIdx !== -1) {
              const absSlash = $from.start() + slashIdx
              if (absSlash < range.from) {
                range = { ...range, from: absSlash }
              }
            }
          } catch { /* keep original range */ }
          suggestionProps.command({ editor, range }, slashAi)
        },
        render: () => ({
          onStart: (props: SuggestionProps) => {
            const trigger = getTrigger(props)
            if (trigger === '@') {
              noteMention.open(props)
            } else {
              slashMenu.open(props)
            }
          },
          onUpdate: (props: SuggestionProps) => {
            const trigger = getTrigger(props)
            if (trigger === '@') {
              noteMention.update(props)
            } else {
              slashMenu.update(props)
            }
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            const trigger = slashMenu.isOpen ? slashMenu.trigger : (noteMention.isOpen ? '@' : '/')
            if (trigger === '@') {
              return noteMention.onKeyDown(props)
            }
            return slashMenu.onKeyDown(props)
          },
          onExit: () => {
            if (noteMention.isOpen) noteMention.close()
            if (slashMenu.isOpen) slashMenu.close()
          },
        }),
      }),
    ]
  },
})

/** Ctrl/Cmd + Enter to send */
export const SendShortcut = Extension.create<{ onSend: () => void }>({
  name: 'sendShortcut',

  addOptions() {
    return { onSend: () => { } }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => {
        this.options.onSend()
        return true
      },
    }
  },
})

/** Notion-style `[] ` / `[x] ` typing converts to a task list */
const taskInputRule = (checked: boolean) =>
  new InputRule({
    find: checked ? /^\s*\[x\]\s$/ : /^\s*\[\s?\]\s$/,
    handler: ({ chain, range }) => {
      chain().focus().deleteRange(range).toggleTaskList().run()
    },
  })

export const TaskListInputRules = Extension.create({
  name: 'taskListInputRules',
  addInputRules() {
    return [taskInputRule(false), taskInputRule(true)]
  },
})
