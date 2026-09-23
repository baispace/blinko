import { Extension, InputRule } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { SlashMenuState } from './slashMenuState';

export type SlashItem = {
  title: string
  icon: string
  keywords?: string
  command: (args: { editor: any; range: any }) => void
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
]

/**
 * Slash menu (" / ") built on the official suggestion plugin.
 * Menu state lives in SlashMenuState (per editor), rendered as React.
 */
export const SlashCommand = Extension.create<{ slashMenu: SlashMenuState; items: SlashItem[] }>({
  name: 'slashCommand',

  addOptions() {
    return {
      slashMenu: undefined as unknown as SlashMenuState,
      items: DEFAULT_SLASH_ITEMS,
    }
  },

  addProseMirrorPlugins() {
    const { slashMenu, items } = this.options
    if (!slashMenu) return []

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
          props.command({ editor, range })
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
