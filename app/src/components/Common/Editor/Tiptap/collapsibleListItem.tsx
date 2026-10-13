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
      /**
       * 切换光标所在 listItem 的折叠状态（叶子 no-op）。
       * 对齐 mubu 原型 `toggleTopic`。
       */
      toggleListItemCollapsed: () => ReturnType
      /**
       * 切换光标所在 li 的所有同级（同 parent list 下的所有 li）：
       *   - 取当前 li 自身的状态决定 target（不是聚合态）
       *   - 当前 open → 全部 folded；当前 folded → 全部 open
       *   - 只对有子项的 li 生效（叶子 no-op）
       * 对齐 mubu 原型 `toggleSiblings`。
       */
      toggleSiblingListItems: () => ReturnType
      /**
       * 按层级 toggle：只动 targetDepth 整深度上、且有子项的 li。
       * 取一致态翻转：
       *   - 全部 open → 全部 folded
       *   - 否则（混合 / 全部 folded）→ 全部 open
       * 对齐 mubu 原型 `toggleByLevel`。listItem PM 深度恒为偶数：
       * 顶级 = 2, 嵌套一级 = 4, 嵌套两级 = 6。
       */
      toggleListItemsByDepth: (targetDepth: number) => ReturnType
      /**
       * 全局 toggle：任一 open → 全部 folded；否则全部 open。
       * 只对有子项的 li 生效。对齐 mubu 原型 `toggleAll`。
       */
      toggleAllListItems: () => ReturnType
    }
  }
}

/**
 * 检测一个 li 节点是否有子项（嵌套的 ul/ol）。
 *
 * li 的 content 是 `paragraph block*`：第一个 block 是 paragraph（li 自己的文本），
 * 后续 block 可能是嵌套的 ul/ol，也可能是**额外的 paragraph**（连续回车产生的空白段、
 * 或者像 `- foo\n  - bar` 错位、或者某些 markdown 解析异常留下的 `- ` 残留）。
 * 单看 childCount > 1 会误判：li 里塞两个 `<p>` 也会让它"以为"有子项，
 * 结果就是给叶子前面也画个空折叠按钮 + 折叠时把第二个 `<p>` 误隐藏。
 *
 * 正确判定：子节点里**至少有一个 bulletList / orderedList**。
 */
function listItemHasChildren(node: any): boolean {
  if (!node || !node.children) return false
  for (let i = 0; i < node.childCount; i++) {
    const t = node.children[i].type?.name
    if (t === 'bulletList' || t === 'orderedList') return true
  }
  return false
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
    /*
     * ============================================================
     * 折叠状态机 —— 完全照搬 mubu 原型 4 个函数
     *   blinko-mubu-prototype.html:1593 toggleTopic(li)
     *   blinko-mubu-prototype.html:1600 toggleSiblings(li)
     *   blinko-mubu-prototype.html:1612 toggleByLevel(level)
     *   blinko-mubu-prototype.html:1623 toggleAll()
     *
     * 把 prototype 的 `parent.querySelectorAll` 换成 `tr.doc.descendants` /
     * `$from.node(...).forEach`，把 `data-state` 换成 `attrs.collapsed`。
     * 原型的 leaf guard（`!li.querySelector('.topic-children')`）对应
     * `listItemHasChildren(node)`（childCount > 1 = paragraph + 嵌套 list）。
     *
     * 关键差异（与上一版不同）：
     *   toggleSiblings 用**当前 li 自身状态**决定 target，不是聚合态。
     *     案例：cursor A 已折叠 + sibling B 已展开
     *       上一版：any 展开 → 全部折叠（A 保持折叠、B 变折叠）
     *       原型：A 已折叠 → 全部展开（A 保持折叠但取反目标=展开，
     *            最终 B 也是展开；混合态收敛到一致）
     * ============================================================
     */
    return {
      // ---- toggleTopic(li) ----------------------------------------
      // 原型: `next = li.dataset.state === 'folded' ? 'open' : 'folded'`
      // 叶子 no-op（与原型 `if (!li.querySelector('.topic-children')) return` 一致）
      toggleListItemCollapsed:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection
          for (let depth = $from.depth; depth > 0; depth--) {
            const node = $from.node(depth)
            if (node.type.name !== 'listItem') continue
            if (!listItemHasChildren(node)) return false
            const pos = $from.before(depth)
            if (dispatch) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                collapsed: !node.attrs.collapsed,
              })
            }
            return true
          }
          return false
        },

      // ---- toggleSiblings(li) ------------------------------------
      // 原型:
      //   const target = li.dataset.state === 'open' ? 'folded' : 'open'
      //   parent.querySelectorAll(':scope > .topic').forEach(t => {
      //     if (t.querySelector('.topic-children')) t.dataset.state = target
      //   })
      // 注意：
      //   - target 由**当前 li 自身状态**决定（不是聚合态 any/allExpanded）
      //   - `:scope > .topic` 包含当前 li 自身（也走 children 守卫）
      //   - 光标在嵌套 li → 取**最近**的 listItem（最深匹配），与原型
      //     `currentTopicFromSelection` 沿祖先向上找 `.topic` 等价
      toggleSiblingListItems:
        () =>
        ({ tr, state, dispatch }) => {
          const { $from } = state.selection

          // 1) 光标所在最近的（最深）listItem
          let currentLiDepth = -1
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === 'listItem') {
              currentLiDepth = depth
              break
            }
          }
          if (currentLiDepth <= 0) return false

          const currentLiNode = $from.node(currentLiDepth)
          if (!currentLiNode) return false

          const parentDepth = currentLiDepth - 1
          const parent = $from.node(parentDepth)
          if (!parent) return false
          // 防御：parent 必须是 list
          if (parent.type.name !== 'bulletList' && parent.type.name !== 'orderedList') {
            return false
          }

          // 2) 收集 parent 下所有直接子 listItem 的 doc 位置
          //    (:scope > li 类比)
          const beforeParent = $from.before(parentDepth)
          const positions: number[] = []
          parent.forEach((child, childIndex) => {
            if (child.type.name === 'listItem') {
              positions.push(beforeParent + 1 + childIndex)
            }
          })
          if (positions.length === 0) return false

          // 3) target 由当前 li 自身状态决定（原型核心）
          //    attrs.collapsed=false ↔ data-state='open'（open 时折叠）
          //
          // 原型细节点：叶子 li 没有 data-state（setState 守卫删了），
          //   `li.dataset.state === 'open'` 在叶子上返回 false → target='open'。
          //   所以「cursor 在叶子 + 任意非空 parent list」= 展开所有非叶子 sibling。
          const targetCollapsed = listItemHasChildren(currentLiNode)
            ? !currentLiNode.attrs.collapsed
            : false

          // 4) 只对有子项的 sibling 提交事务
          if (dispatch) {
            positions.forEach((pos) => {
              const n = state.doc.nodeAt(pos)
              if (
                n &&
                n.type.name === 'listItem' &&
                listItemHasChildren(n) &&
                n.attrs.collapsed !== targetCollapsed
              ) {
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, collapsed: targetCollapsed })
              }
            })
          }
          return true
        },

      // ---- toggleByLevel(level) ----------------------------------
      // 原型:
      //   const nodes = [...].filter(t => parseInt(t.dataset.depth)===level
      //                                    && t.querySelector('.topic-children'))
      //   const allOpen = nodes.every(t => t.dataset.state === 'open')
      //   const target = allOpen ? 'folded' : 'open'
      //   nodes.forEach(t => { t.dataset.state = target })
      //
      // listItem 的 PM 深度恒为偶数：top-level=2, 嵌套一级=4, 嵌套两级=6
      // （原型 key '1' → level 0 → PM depth 2）
      toggleListItemsByDepth:
        (targetDepth: number) =>
        ({ tr, state, dispatch }) => {
          const positions: number[] = []
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') return
            if (!listItemHasChildren(node)) return  // 叶子 no-op
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

          let changed = false
          positions.forEach((pos) => {
            const n = state.doc.nodeAt(pos)
            if (
              n &&
              n.type.name === 'listItem' &&
              n.attrs.collapsed !== targetCollapsed
            ) {
              if (dispatch) {
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, collapsed: targetCollapsed })
              }
              changed = true
            }
          })
          return changed
        },

      // ---- toggleAll() ------------------------------------------
      // 原型:
      //   let anyOpen = false
      //   document.querySelectorAll('.topic').forEach(t => {
      //     if (t.dataset.state === 'open' && t.querySelector('.topic-children')) anyOpen = true
      //   })
      //   const target = anyOpen ? 'folded' : 'open'
      //   document.querySelectorAll('.topic').forEach(t => {
      //     if (t.querySelector('.topic-children')) t.dataset.state = target
      //   })
      toggleAllListItems:
        () =>
        ({ tr, state, dispatch }) => {
          const positions: number[] = []
          let anyExpanded = false
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'listItem') return
            if (!listItemHasChildren(node)) return
            positions.push(pos)
            if (!node.attrs.collapsed) anyExpanded = true
          })
          if (positions.length === 0) return false

          const targetCollapsed = anyExpanded

          if (dispatch) {
            positions.forEach((pos) => {
              const n = state.doc.nodeAt(pos)
              if (
                n &&
                n.type.name === 'listItem' &&
                n.attrs.collapsed !== targetCollapsed
              ) {
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
      // Cmd/Ctrl+. 切换当前 li（与 VS Code / mubu 一致）—— toggleTopic
      'Mod-.': () => this.editor.commands.toggleListItemCollapsed(),
      // Cmd/Ctrl+Shift+. 同级 toggle —— toggleSiblings
      'Mod-Shift-.': () => this.editor.commands.toggleSiblingListItems(),
      // Cmd/Ctrl+Alt+1/2/3 按层级 toggle —— toggleByLevel
      // 1=顶级 li (PM depth 2), 2=嵌套一级 (4), 3=嵌套两级 (6)
      'Mod-Alt-1': () => this.editor.commands.toggleListItemsByDepth(2),
      'Mod-Alt-2': () => this.editor.commands.toggleListItemsByDepth(4),
      'Mod-Alt-3': () => this.editor.commands.toggleListItemsByDepth(6),
      // Cmd/Ctrl+Shift+Alt+. 全局 toggle —— toggleAll
      'Mod-Shift-Alt-.': () => this.editor.commands.toggleAllListItems(),
    }
  },
})
