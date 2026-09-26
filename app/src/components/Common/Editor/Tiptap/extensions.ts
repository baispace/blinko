import { Extension, InputRule } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { SlashMenuState } from './slashMenuState';

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
  onComplete: (text: string) => void
) => void

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
      text: state.doc.textBetween($from.start(), $from.end(), '\n'),
    }
  } catch {
    return { start: 0, end: 0, text: '' }
  }
}

const runAiSlash = (
  editor: any,
  range: any,
  run: AiSlashRunner,
  writeType: 'expand' | 'polish',
  mode: 'insert' | 'replace'
) => {
  // Drop the "/ai-xxx" token first; it lies inside the block, so re-read the
  // block afterwards instead of reusing positions captured before deletion.
  editor.chain().focus().deleteRange(range).run()
  const { start, end, text } = currentBlock(editor)
  if (!text.trim()) return
  run(writeType, text, (result) => {
    if (!result?.trim()) return
    if (mode === 'replace') {
      editor.chain().focus().insertContentAt({ from: start, to: end }, result).run()
    } else {
      editor.chain().focus().insertContentAt({ from: end, to: end }, result).run()
    }
  })
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
    command: ({ editor, range }, runner) => {
      if (runner) runAiSlash(editor, range, runner, 'expand', 'insert')
    },
  },
  {
    title: 'ai-polish',
    icon: 'hugeicons:ai-beautify',
    keywords: 'ai polish 润色 优化 改进 改写',
    command: ({ editor, range }, runner) => {
      if (runner) runAiSlash(editor, range, runner, 'polish', 'replace')
    },
  },
]

/**
 * Slash menu (" / ") built on the official suggestion plugin.
 * Menu state lives in SlashMenuState (per editor), rendered as React.
 */
export const SlashCommand = Extension.create<{
  slashMenu: SlashMenuState
  items: SlashItem[]
  aiRunner?: AiSlashRunner
}>({
  name: 'slashCommand',

  addOptions() {
    return {
      slashMenu: undefined as unknown as SlashMenuState,
      items: DEFAULT_SLASH_ITEMS,
      aiRunner: undefined as AiSlashRunner | undefined,
    }
  },

  addProseMirrorPlugins() {
    const { slashMenu, items, aiRunner } = this.options
    if (!slashMenu) return []

    // Bound once here so the AI slash items never touch the store directly.
    const slashAi: AiSlashRunner = (writeType, content, onComplete) => {
      aiRunner?.(writeType, content, onComplete)
    }

    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase()
          return items.filter(i =>
            i.title.toLowerCase().includes(q) || (i.keywords ?? '').toLowerCase().includes(q)
          )
        },
        command: ({ editor, range, props }) => {
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
          props.command({ editor, range }, slashAi)
        },
        render: () => ({
          onStart: (props: SuggestionProps) => slashMenu.open(props),
          onUpdate: (props: SuggestionProps) => slashMenu.update(props),
          onKeyDown: (props: SuggestionKeyDownProps) => slashMenu.onKeyDown(props),
          onExit: () => slashMenu.close(),
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
