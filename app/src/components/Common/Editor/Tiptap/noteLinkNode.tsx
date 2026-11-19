import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { NoteLink } from '@/components/Common/MarkdownRender/NoteLink'
import { noteLinkMarkdownPlugin } from './noteLinkMarkdown'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    noteLink: {
      insertNoteLink: (attrs: { id: number; title: string }) => ReturnType
    }
  }
}

/**
 * 编辑器里的「引入文章」节点：看起来像飞书文档提及（图标 + 标题的行内卡片），
 * markdown 仍序列化为 `[[id|title]]`，和 upsert / 阅读态共用同一套双链格式。
 */
const NoteLinkChipView = ({ node, selected }: NodeViewProps) => {
  const id = Number(node.attrs.id)
  const title = String(node.attrs.title || '')

  return (
    <NodeViewWrapper
      as="span"
      className={`tiptap-note-link${selected ? ' is-selected' : ''}`}
      contentEditable={false}
    >
      <NoteLink id={id} title={title} />
    </NodeViewWrapper>
  )
}

export const NoteLinkNode = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => {
          const id = Number(element.getAttribute('data-id'))
          return Number.isInteger(id) && id > 0 ? id : null
        },
        renderHTML: (attrs) => (attrs.id != null ? { 'data-id': attrs.id } : {}),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') || element.textContent || '',
        renderHTML: (attrs) => (attrs.title ? { 'data-title': attrs.title } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="note-link"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-type': 'note-link' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkChipView, { as: 'span' })
  },

  addCommands() {
    return {
      insertNoteLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([
            { type: this.name, attrs: { id: attrs.id, title: attrs.title } },
            { type: 'text', text: ' ' },
          ]),
    }
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[(\d+)\|([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const id = Number(match[1])
          const title = match[2] ?? ''
          if (!Number.isInteger(id) || id <= 0) return null
          const type = state.schema.nodes[this.name]
          if (!type) return null
          const { tr } = state
          tr.replaceWith(range.from, range.to, type.create({ id, title }))
          tr.scrollIntoView()
        },
      }),
    ]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const id = node.attrs?.id
          const title = String(node.attrs?.title ?? '')
          if (id == null) return
          state.write(`[[${id}|${title}]]`)
        },
        parse: {
          setup(markdownit: any) {
            markdownit.use(noteLinkMarkdownPlugin)
          },
        },
      },
    }
  },
})
