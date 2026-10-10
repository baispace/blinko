import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react'
import React, { useCallback, useEffect, useRef } from 'react'

/**
 * Collapsible list item —— Effie 风格的核心交互
 *
 * - 在每个有子项的 <li> 前面加一个折叠手柄（▸/▾），点击切换折叠/展开
 * - 折叠状态存到 prosemirror 节点的 collapsed attr，跨 session 持久化
 * - markdown 序列化时自动忽略 collapsed attr（保留 markdown 源纯净）
 *
 * 实现要点：
 * - 替换 StarterKit 默认的 listItem，但保留 bulletList / orderedList 不动
 * - NodeView 只在手柄点击时拦截事件，不影响 li 的内容编辑和文本选择
 * - collapse 时用 CSS（display: none on children）隐藏，比删节点再插入开销小
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsibleListItem: {
      toggleListItemCollapsed: () => ReturnType
      collapseAllListItems: () => ReturnType
      expandAllListItems: () => ReturnType
    }
  }
}

/**
 * 检测一个 li 节点是否有子项（嵌套的 ul/ol）。
 * listItem content 是 block+：第一个 block 是 paragraph（li 自己的文本），
 * 后续 block 是嵌套的 ul/ol。所以 childCount > 1 即表示有子项。
 */
function listItemHasChildren(node: any): boolean {
  if (!node) return false
  // childCount > 1 = paragraph + 至少一个 nested list
  return node.childCount > 1
}

/**
 * NodeView 组件 —— 给 li 前面追加折叠手柄
 *
 * 只在 li 实际有子项时才显示手柄；点击手柄切换 collapsed attr。
 * children 由 Tiptap 的 ReactNodeViewRenderer 自动注入，要用 NodeViewContent 渲染。
 */
const CollapsibleListItemView: React.FC<any> = ({ node, updateAttributes, editor, children }) => {
  const hasChildren = listItemHasChildren(node)
  const collapsed = !!node.attrs.collapsed
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 编辑模式下点折叠按钮不应该进入编辑态（preventDefault + stopPropagation）
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      updateAttributes({ collapsed: !collapsed })
    },
    [collapsed, updateAttributes]
  )

  // 只读态下折叠按钮无效（不需要切换），但仍然展示以表达层级关系
  if (!editor.isEditable) {
    return (
      <NodeViewWrapper
        as="li"
        data-type="collapsible-list-item"
        data-collapsed={collapsed ? 'true' : 'false'}
        data-has-children={hasChildren ? 'true' : 'false'}
      >
        {hasChildren && (
          <span
            className={`collapse-caret ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
            aria-hidden="true"
          >
            {collapsed ? '+' : '−'}
          </span>
        )}
        <NodeViewContent>{children}</NodeViewContent>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper
      as="li"
      data-type="collapsible-list-item"
      data-collapsed={collapsed ? 'true' : 'false'}
      data-has-children={hasChildren ? 'true' : 'false'}
    >
      {hasChildren && (
        <button
          ref={buttonRef}
          type="button"
          className={`collapse-caret ${collapsed ? 'is-collapsed' : 'is-expanded'}`}
          onClick={handleClick}
          onMouseDown={(e) => e.preventDefault()}
          contentEditable={false}
          aria-label={collapsed ? '展开子项' : '折叠子项'}
        >
          {collapsed ? '+' : '−'}
        </button>
      )}
      <NodeViewContent>{children}</NodeViewContent>
    </NodeViewWrapper>
  )
}

export const CollapsibleListItem = Node.create({
  name: 'listItem',
  group: 'listItem',
  // 与 StarterKit 默认一致：至少一段 paragraph（li 自己的文本），后面跟 0+ 个 block
  // （嵌套 ul/ol 等）
  content: 'paragraph block*',
  defining: true,

  addAttributes() {
    return {
      collapsed: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes: any) => {
          // 只在 collapsed=true 时渲染 data-collapsed，避免污染 markdown
          if (attributes.collapsed) {
            return { 'data-collapsed': 'true' }
          }
          return {}
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'collapsible-list-item' }), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleListItemView)
  },

  addCommands() {
    return {
      toggleListItemCollapsed:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name === 'listItem') {
              const pos = $from.before(depth)
              if (dispatch) {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  collapsed: !node.attrs.collapsed,
                })
              }
              return true
            }
          }
          return false
        },

      collapseAllListItems:
        () =>
        ({ tr, doc, dispatch }) => {
          if (!dispatch) return true
          const positions: number[] = []
          doc.descendants((node, pos) => {
            if (node.type.name === 'listItem') {
              positions.push(pos)
            }
          })
          positions.forEach((pos) => {
            const node = doc.nodeAt(pos)
            if (node && node.type.name === 'listItem' && !node.attrs.collapsed) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true })
            }
          })
          return positions.length > 0
        },

      expandAllListItems:
        () =>
        ({ tr, doc, dispatch }) => {
          if (!dispatch) return true
          const positions: number[] = []
          doc.descendants((node, pos) => {
            if (node.type.name === 'listItem') {
              positions.push(pos)
            }
          })
          positions.forEach((pos) => {
            const node = doc.nodeAt(pos)
            if (node && node.type.name === 'listItem' && node.attrs.collapsed) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: false })
            }
          })
          return positions.length > 0
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Alt+Click on caret row would be ideal but Tiptap doesn't expose that.
      // 提供 Cmd/Ctrl+. 快捷键切换当前 li 折叠状态（与 VS Code 习惯一致）
      'Mod-.': () => this.editor.commands.toggleListItemCollapsed(),
    }
  },
})
