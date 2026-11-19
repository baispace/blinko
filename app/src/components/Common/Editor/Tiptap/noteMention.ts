import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NoteMentionState, type NoteMentionItem } from './noteMentionState';

/**
 * 输入 @ 引用其它文章（对齐飞书文档提及）：
 * 弹出可搜索列表（标题支持空格），选中后插入 noteLink 行内卡片。
 * 卡片在 markdown 里仍写成 `[[id|title]]`，不影响引用关系和阅读态渲染。
 */
export const NoteMentionKey = new PluginKey<any>('noteMention')

export const NoteMention = Extension.create<{
  noteMention: NoteMentionState
}>({
  name: 'noteMention',

  addOptions() {
    return {
      noteMention: undefined as unknown as NoteMentionState,
    }
  },

  addProseMirrorPlugins() {
    const { noteMention } = this.options
    if (!noteMention) return []

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: NoteMentionKey,
        char: '@',
        allowSpaces: true,
        items: ({ query }) => {
          // Items are fetched asynchronously via NoteMentionState.searchNotes
          // Return empty here, the state will update items after search
          return noteMention.items
        },
        command: ({ editor, range, props }) => {
          const item = props as NoteMentionItem
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertNoteLink({ id: item.id, title: item.title })
            .run()
          noteMention.close()
        },
        render: () => ({
          onStart: (props: SuggestionProps) => noteMention.open(props),
          onUpdate: (props: SuggestionProps) => noteMention.update(props),
          onKeyDown: (props: SuggestionKeyDownProps) => noteMention.onKeyDown(props),
          onExit: () => noteMention.close(),
        }),
      }),
    ]
  },
})
