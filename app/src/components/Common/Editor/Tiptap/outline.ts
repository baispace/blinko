import { mountOutlineMap, outlinePositions, attachOutlineDrag } from './outlineMap'
import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core'
import type { Editor } from '@tiptap/core'
import ListItem from '@tiptap/extension-list-item'
import { animateOutlineBranch, cancelOutlineBranch, outlineViewIcon, outlineControlIcon } from './outlinePresentation'
import { DOMSerializer, Fragment, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { pastedOutline } from './pastedOutline'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state'

export type OutlineView = 'outline' | 'mindmap'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outline: {
      toggleOutline: () => ReturnType
      toggleOutlineView: () => ReturnType
    }
  }
}

/** The outermost outline around the selection owns the display mode. */
function outlineRoot(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth)
    if (node.type.name === 'outlineList') return { node, pos: $from.before(depth) }
  }
  const node = editor.state.doc.nodeAt($from.pos)
  return node?.type.name === 'outlineList' ? { node, pos: $from.pos } : null
}

/** Convert an existing list without flattening its subtree or dropping media. */
function convertList(node: ProseMirrorNode): ProseMirrorNode {
  const schema = node.type.schema
  const children: ProseMirrorNode[] = []
  node.forEach(child => children.push(convertList(child)))
  if (node.type.name === 'bulletList' || node.type.name === 'orderedList') {
    return schema.nodes.outlineList.create(null, children)
  }
  if (node.type.name === 'listItem') {
    return schema.nodes.outlineItem.create({ collapsed: !!node.attrs.collapsed }, children)
  }
  return node.copy(Fragment.fromArray(children))
}

/** HTML storage must use raw image URLs, never authenticated display URLs. */
function outlineHTML(node: ProseMirrorNode): string {
  const serializer = DOMSerializer.fromSchema(node.type.schema)
  const nodes = { ...serializer.nodes }
  if (nodes.image) {
    nodes.image = image => {
      const attrs: Record<string, string | number> = { src: image.attrs.src || '' }
      for (const key of ['alt', 'title', 'width']) {
        if (image.attrs[key] != null) attrs[key] = image.attrs[key]
      }
      if (image.attrs.align) attrs['data-align'] = image.attrs.align
      return ['img', attrs]
    }
  }
  const container = document.createElement('div')
  container.dataset.type = 'outline-block'
  container.appendChild(new DOMSerializer(nodes, serializer.marks).serializeFragment(Fragment.from(node)))
  return container.outerHTML
}

export const OutlineList = Node.create({
  name: 'outlineList',
  priority: 120,
  group: 'block list',
  content: 'outlineItem+',
  addAttributes() {
    return { title: { default: null, parseHTML: element => element.getAttribute('data-map-title'), renderHTML: attrs => attrs.title ? { 'data-map-title': attrs.title } : {} }, view: {
      default: 'outline',
      parseHTML: element => element.getAttribute('data-view') === 'mindmap' ? 'mindmap' : 'outline',
      renderHTML: attrs => ({ 'data-view': attrs.view === 'mindmap' ? 'mindmap' : 'outline' }),
    } }
  },
  parseHTML: () => [{ tag: 'ul[data-type="outline"]', priority: 120 }],
  renderHTML: ({ HTMLAttributes }) => ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'outline' }), 0],
  addStorage() {
    return { markdown: {
      serialize(state: any, node: ProseMirrorNode) {
        state.write(outlineHTML(node))
        state.closeBlock(node)
      },
      parse: {},
    } }
  },
  addInputRules() {
    return [wrappingInputRule({ find: /^-\s$/, type: this.type, joinPredicate: () => false })]
  },
  onCreate() {
    // Run the same recognition for initial Markdown, not just clipboard input.
    this.editor.view.dispatch(this.editor.state.tr.setMeta('recognizeOutline', true))
  },
  addProseMirrorPlugins() {
    return [new Plugin({ key: new PluginKey('automaticOutline'), appendTransaction(transactions, _old, state) {
      if (!transactions.some(tr => tr.docChanged || tr.getMeta('recognizeOutline'))) return null
      const next = pastedOutline(new Slice(state.doc.content, 0, 0), true)
      if (next.content.eq(state.doc.content)) return null
      // Node names change, positions and selections remain stable.
      const tr = state.tr
      next.content.forEach((node, offset) => {
        if (!node.eq(state.doc.nodeAt(offset)!)) tr.replaceWith(offset, offset + node.nodeSize, node)
      })
      tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()))
      return tr.setMeta('addToHistory', false)
    } })]
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-`': () => this.editor.commands.toggleOutline(),
      'Mod-`': () => this.editor.commands.toggleOutlineView(),
    }
  },
  addCommands() {
    return {
      toggleOutline: () => ({ state, tr, dispatch, commands }) => {
        // toggleList cannot convert lists with a different item schema itself.
        const { $from, $to } = state.selection
        for (let depth = 1; depth <= $from.depth; depth++) {
          const node = $from.node(depth)
          if (!['bulletList', 'orderedList'].includes(node.type.name)) continue
          const pos = $from.before(depth)
          if ($to.pos > pos + node.nodeSize) return false
          if (dispatch) {
            tr.replaceWith(pos, pos + node.nodeSize, convertList(node))
            // Renaming nodes keeps their sizes, so retain the original cursor.
            tr.setSelection(Selection.fromJSON(tr.doc, state.selection.toJSON()))
          }
          return true
        }
        return commands.toggleList(this.name, 'outlineItem')
      },
      toggleOutlineView: () => ({ editor, tr, dispatch }) => {
        const root = outlineRoot(editor)
        if (!root) return false
        if (dispatch) {
          tr.setNodeMarkup(root.pos, undefined, { ...root.node.attrs, view: root.node.attrs.view === 'mindmap' ? 'outline' : 'mindmap' })
          if (root.node.attrs.view === 'mindmap' && tr.selection instanceof NodeSelection && tr.selection.node.type.name === 'outlineItem') {
            tr.setSelection(TextSelection.create(tr.doc, tr.selection.from + 2))
          }
        }
        return true
      },
    }
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      const dom = document.createElement('section')
      dom.className = 'outline-view'
      const toolbar = document.createElement('div')
      toolbar.className = 'outline-toolbar'
      toolbar.contentEditable = 'false'
      const label = document.createElement('span')
      label.className = 'outline-label'
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'outline-view-toggle'
      const viewport = document.createElement('div')
      viewport.className = 'outline-viewport'
      const contentDOM = document.createElement('ul')
      contentDOM.dataset.type = 'outline'
      toolbar.append(label, toggle)
      viewport.append(contentDOM)
      dom.append(toolbar, viewport)
      outlinePositions.set(contentDOM, () => getPos())
      const map = mountOutlineMap(dom, viewport, contentDOM, editor, () => getPos())
      const refresh = () => {
        const mode = current.attrs.view === 'mindmap' ? 'mindmap' : 'outline'
        dom.dataset.branchCount = String(current.childCount)
        dom.dataset.view = mode
        map.schedule()
        contentDOM.dataset.view = mode
        label.textContent = mode === 'mindmap' ? '思维导图' : '大纲'
        if (toggle.dataset.mode !== mode) {
          toggle.replaceChildren(outlineViewIcon(mode === 'mindmap'))
          toggle.dataset.mode = mode
        }
        toggle.setAttribute('aria-label', mode === 'mindmap' ? '切换为大纲' : '切换为思维导图')
        toggle.setAttribute('aria-pressed', String(mode === 'mindmap'))
        toggle.title = (mode === 'mindmap' ? '切换为大纲' : '切换为思维导图') + '（⌘ / Ctrl + `）'
      }
      const refreshActive = () => {
        const pos = getPos()
        dom.dataset.active = String(editor.isFocused && typeof pos === 'number' &&
          editor.state.selection.from >= pos && editor.state.selection.to <= pos + current.nodeSize)
      }
      editor.on('selectionUpdate', refreshActive)
      editor.on('focus', refreshActive)
      editor.on('blur', refreshActive)
      toggle.onmousedown = event => event.preventDefault()
      toggle.onclick = event => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number') return
        const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, view: current.attrs.view === 'mindmap' ? 'outline' : 'mindmap' })
        if (current.attrs.view === 'mindmap' && tr.selection instanceof NodeSelection && tr.selection.node.type.name === 'outlineItem') {
          tr.setSelection(TextSelection.create(tr.doc, tr.selection.from + 2))
        }
        editor.view.dispatch(tr)
      }
      refresh()
      return {
        dom, contentDOM,
        update(next) {
          if (next.type !== current.type) return false
          current = next
          refresh()
          refreshActive()
          return true
        },
        destroy() {
          map.destroy()
          editor.off('selectionUpdate', refreshActive)
          editor.off('focus', refreshActive)
          editor.off('blur', refreshActive)
        },
        stopEvent: event => toolbar.contains(event.target as globalThis.Node) || map.root.contains(event.target as globalThis.Node) || map.controls.contains(event.target as globalThis.Node),
        ignoreMutation: mutation => mutation.type !== 'selection' &&
          (!contentDOM.contains(mutation.target) || (mutation.target === contentDOM && mutation.type === 'attributes') || toolbar.contains(mutation.target) || map.svg.contains(mutation.target) || mutation.target === map.svg || map.root.contains(mutation.target) || map.controls.contains(mutation.target)),
      }
    }
  },
})

export const OutlineItem = ListItem.extend({
  name: 'outlineItem',
  // Keep block media and extra paragraphs inside the topic, just as ListItem does.
  content: 'paragraph block*',
  priority: 130,
  addAttributes() {
    return { collapsed: {
      default: false,
      parseHTML: element => element.getAttribute('data-collapsed') === 'true',
      renderHTML: attrs => ({ 'data-collapsed': String(attrs.collapsed) }),
    } }
  },
  parseHTML: () => [{ tag: 'li[data-type="outline-item"]', priority: 130 }],
  renderHTML: ({ HTMLAttributes }) => ['li', mergeAttributes(HTMLAttributes, { 'data-type': 'outline-item' }), 0],
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        if (!this.editor.isActive(this.name)) return false
        const { $from, empty } = this.editor.state.selection
        // A selected image is a topic's block content, not a text cursor that
        // splitListItem can split. Enter creates an editable sibling topic.
        if (this.editor.state.selection instanceof NodeSelection &&
            this.editor.state.selection.node.type.name === 'image') {
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name !== this.name) continue
            const pos = $from.after(depth)
            return this.editor.commands.command(({ tr, dispatch }) => {
              if (dispatch) {
                tr.insert(pos, this.type.createAndFill()!)
                tr.setSelection(TextSelection.create(tr.doc, pos + 2)).scrollIntoView()
              }
              return true
            })
          }
        }
        const item = $from.node($from.depth - 1)
        if (empty && !$from.parent.content.size && item?.type.name === this.name && item.childCount === 1) {
          // The second Enter exits even a deeply nested empty topic. Each lift
          // preserves the following siblings/subtrees instead of deleting them.
          const chain = this.editor.chain()
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === this.name) chain.liftListItem(this.name)
          }
          return chain.run()
        }
        return this.editor.chain().updateAttributes(this.name, { collapsed: false }).splitListItem(this.name).run()
      },
      Tab: () => {
        if (!this.editor.isActive(this.name)) return false
        this.editor.chain().sinkListItem(this.name).updateAttributes(this.name, { collapsed: false }).run()
        const { $from } = this.editor.state.selection
        const tr = this.editor.state.tr
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth)
          if (node.type.name === this.name && node.attrs.collapsed) {
            tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, collapsed: false })
          }
        }
        if (tr.docChanged) this.editor.view.dispatch(tr)
        return true
      },
      'Shift-Tab': () => {
        if (!this.editor.isActive(this.name)) return false
        this.editor.commands.liftListItem(this.name)
        return true
      },
      'Mod-.': () => {
        if (!this.editor.isActive(this.name)) return false
        const { $from } = this.editor.state.selection
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth)
          if (node.type.name !== this.name) continue
          if (!hasBranches(node)) return true
          return this.editor.commands.updateAttributes(this.name, { collapsed: !node.attrs.collapsed })
        }
        return false
      },
    }
  },
  addNodeView() {
    return ({ node, editor, getPos }) => {
      let current = node
      const dom = document.createElement('li')
      dom.dataset.type = 'outline-item'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'outline-toggle'
      button.contentEditable = 'false'
      const contentDOM = document.createElement('div')
      contentDOM.className = 'outline-content'
      const drag = document.createElement('button')
      drag.type = 'button'; drag.className = 'outline-drag'; drag.contentEditable = 'false'
      drag.setAttribute('aria-label', '拖动分支'); drag.title = '拖动调整分支（Esc 取消）'
      drag.append(outlineControlIcon('drag-vertical'))
      dom.append(button, drag, contentDOM)
      outlinePositions.set(dom, () => getPos())
      const disposeDrag = attachOutlineDrag(drag, dom, editor, () => getPos())
      const refresh = () => {
        const branches = hasBranches(current)
        dom.dataset.collapsed = String(current.attrs.collapsed)
        dom.dataset.hasChildren = String(branches)
        let bodyRows = 0
        current.forEach(child => { if (child.type.name !== 'outlineList') bodyRows++ })
        contentDOM.style.setProperty('--outline-body-rows', String(Math.max(1, bodyRows)))
        button.replaceChildren(outlineControlIcon(current.attrs.collapsed ? 'plus-circle-outline' : 'minus-circle-outline'))
        button.disabled = !branches
        button.setAttribute('aria-label', branches ? (current.attrs.collapsed ? '展开子项' : '折叠子项') : '大纲条目')
        if (branches) button.setAttribute('aria-expanded', String(!current.attrs.collapsed))
        else button.removeAttribute('aria-expanded')
        button.title = branches ? `${current.attrs.collapsed ? '展开' : '折叠'}子项` : '大纲条目'
      }
      button.onmousedown = event => event.preventDefault()
      button.onclick = event => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (typeof pos !== 'number' || !hasBranches(current)) return
        const tr = editor.state.tr
        if (!current.attrs.collapsed && !(tr.selection instanceof NodeSelection && tr.selection.from === pos)) {
          let offset = pos + 1
          current.forEach(child => {
            if (child.type.name === 'outlineList' && tr.selection.to > offset && tr.selection.from < offset + child.nodeSize) {
              tr.setSelection(TextSelection.create(tr.doc, pos + 2))
            }
            offset += child.nodeSize
          })
        }
        const topicSelected = tr.selection instanceof NodeSelection && tr.selection.from === pos
        tr.setNodeMarkup(pos, undefined, { ...current.attrs, collapsed: !current.attrs.collapsed })
        if (topicSelected) tr.setSelection(NodeSelection.create(tr.doc, pos))
        editor.view.dispatch(tr)
      }
      refresh()
      return {
        dom, contentDOM,
        update(next) {
          if (next.type !== current.type) return false
          const changed = !!current.attrs.collapsed !== !!next.attrs.collapsed
          current = next
          refresh()
          const branch = contentDOM.querySelector<HTMLElement>(':scope > .outline-view')
          if (changed && branch) animateOutlineBranch(branch, !!current.attrs.collapsed)
          return true
        },
        destroy() {
          disposeDrag()
          cancelOutlineBranch(contentDOM.querySelector<HTMLElement>(':scope > .outline-view'))
        },
        stopEvent: event => button.contains(event.target as globalThis.Node) || drag.contains(event.target as globalThis.Node),
        ignoreMutation: mutation => mutation.type !== 'selection' &&
          (mutation.target === dom || (mutation.target === contentDOM && mutation.type === 'attributes') || button.contains(mutation.target) || drag.contains(mutation.target)),
      }
    }
  },
})

function hasBranches(node: ProseMirrorNode): boolean {
  let found = false
  node.forEach(child => { if (child.type.name === 'outlineList') found = true })
  return found
}
