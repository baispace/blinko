import { Extension } from '@tiptap/core';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { NoteMentionState, type NoteMentionItem } from './noteMentionState';

/**
 * Note mention extension - trigger with @ to link to other notes.
 * Stores as [[noteId|title]] format (Obsidian-style).
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
        char: '@',
        allowSpaces: false,
        items: ({ query }) => {
          // Items are fetched asynchronously via NoteMentionState.searchNotes
          // Return empty here, the state will update items after search
          return noteMention.items
        },
        command: ({ editor, range, props }) => {
          const item = props as NoteMentionItem
          // Insert as [[id|title]] format
          const text = `[[${item.id}|${item.title}]]`
          editor.chain().focus().deleteRange(range).insertContent(text).run()
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
