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
      /**
       * 折叠当前 li 的同级（同 parent 的所有 li）：
       *   - 若当前 li 是展开的，全部同级折叠
       *   - 若当前 li 已折叠 / 混合态，全部同级展开
       * 行为与 mubu 原型 `toggleSiblings` 对齐。
       */
      collapseSiblingListItems: () => ReturnType
      /**
       * 按层级折叠：在 prosemirror 文档里，listItem 的深度恒为偶数
       * （top-level = 2, 嵌套一级 = 4，依此类推）。该命令只影响
       * `targetDepth` 整深度上、且有子项的 li，取一致态翻转：
       *   - 全部展开 → 全部折叠
       *   - 否则（混合 / 全部折叠）→ 全部展开
       */
      collapseListItemsByDepth: (targetDepth: number) => ReturnType
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
            ▸
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
          ▸
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
        ({ tr, dispatch }) => {
          if (!dispatch) return true
          const positions: number[] = []
          tr.doc.descendants((node, pos) => {
            if (node.type.name === 'listItem') {
              positions.push(pos)
            }
          })
          positions.forEach((pos) => {
            const node = tr.doc.nodeAt(pos)
            if (node && node.type.name === 'listItem' && !node.attrs.collapsed) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true })
            }
          })
          return positions.length > 0
        },

      expandAllListItems:
        () =>
        ({ tr, dispatch }) => {
          if (!dispatch) return true
          const positions: number[] = []
          tr.doc.descendants((node, pos) => {
            if (node.type.name === 'listItem') {
              positions.push(pos)
            }
          })
          positions.forEach((pos) => {
            const node = tr.doc.nodeAt(pos)
            if (node && node.type.name === 'listItem' && node.attrs.collapsed) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: false })
            }
          })
          return positions.length > 0
        },

      /**
       * 折叠 / 展开当前 li 的所有同级（同 parent ul/ol 下的所有 li）。
       * 状态收敛规则：
       *   - 当前 li 是展开的 → 全部同级折叠
       *   - 否则（当前已折叠 / 混合）→ 全部同级展开
       */
      collapseSiblingListItems:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection

          // 1) 找到光标所在的最近 listItem 及其 parent
          let currentDepth = -1
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === 'listItem') {
              currentDepth = depth
              break
            }
          }
          if (currentDepth <= 0) return false

          const parentDepth = currentDepth - 1
          const parent = $from.node(parentDepth)
          if (!parent) return false
          // 防御：parent 必须是 list（不能是文档根或 listItem）
          if (parent.type.name !== 'bulletList' && parent.type.name !== 'orderedList') {
            return false
          }

          // 2) 收集 parent 下所有 listItem 的 doc 位置
          const beforeParent = $from.before(parentDepth)
          const positions: number[] = []
          parent.forEach((child, childIndex) => {
            if (child.type.name === 'listItem') {
              // child 在 fragment 里的 index 转为 doc 位置：beforeParent + 1 (open tag) + childIndex
              positions.push(beforeParent + 1 + childIndex)
            }
          })
          if (positions.length === 0) return false

          // 3) 一致态：当前是展开的 → 全部折叠；否则全部展开
          const anyExpanded = positions.some((p) => {
            const n = state.doc.nodeAt(p)
            return n && !n.attrs.collapsed
          })
          const targetCollapsed = anyExpanded

          // 4) 提交事务
          if (dispatch) {
            positions.forEach((pos) => {
              const n = state.doc.nodeAt(pos)
              if (n && n.type.name === 'listItem' && n.attrs.collapsed !== targetCollapsed) {
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, collapsed: targetCollapsed })
              }
            })
          }
          return true
        },

      /**
       * 按层级折叠：只动 targetDepth 整深度上、且有子项的 li。
       * 行为：全部展开 → 全部折叠；否则 → 全部展开。
       *  注：listItem 的 PM 深度恒为偶数：
       *    顶级（直接挂在 bulletList/orderedList 下）= 2
       *    嵌套一级 = 4
       *    嵌套两级 = 6
       */
      collapseListItemsByDepth:
        (targetDepth: number) =>
        ({ tr, state, dispatch }) => {
          if (!dispatch) return true
          const positions: number[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') return
            if (node.childCount <= 1) return  // 没有子项（只有 paragraph）
            // pos 是节点起点；resolve pos+1 得到节点所在深度
            const $pos = state.doc.resolve(pos + 1)
            if ($pos.depth === targetDepth) {
              positions.push(pos)
            }
          })
          if (positions.length === 0) return false

          const allExpanded = positions.every((p) => {
            const n = state.doc.nodeAt(p)
            return n && !n.attrs.collapsed
          })
          const targetCollapsed = allExpanded

          if (dispatch) {
            positions.forEach((pos) => {
              const n = state.doc.nodeAt(pos)
              if (n && n.type.name === 'listItem' && n.attrs.collapsed !== targetCollapsed) {
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, collapsed: targetCollapsed })
              }
            })
          }
          return true
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Cmd/Ctrl+. 切换当前 li 折叠状态（与 VS Code / mubu 一致）
      'Mod-.': () => this.editor.commands.toggleListItemCollapsed(),
      // Cmd/Ctrl+Shift+. 同级折叠 / 展开
      'Mod-Shift-.': () => this.editor.commands.collapseSiblingListItems(),
      // Cmd/Ctrl+Alt+1/2/3 按层级折叠：1=顶级 li, 2=嵌套一级, 3=嵌套两级
      // 行为：取该层一致态后整层翻转
      'Mod-Alt-1': () => this.editor.commands.collapseListItemsByDepth(2),
      'Mod-Alt-2': () => this.editor.commands.collapseListItemsByDepth(4),
      'Mod-Alt-3': () => this.editor.commands.collapseListItemsByDepth(6),
      // Cmd/Ctrl+Shift+Alt+. 全部折叠 / 展开
      'Mod-Shift-Alt-.': () => this.editor.commands.collapseAllListItems(),
    }
  },
})
