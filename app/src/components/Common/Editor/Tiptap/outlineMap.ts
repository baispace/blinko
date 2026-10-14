import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'

export const outlinePositions = new WeakMap<HTMLElement, () => number | undefined>()
export type DropMode = 'before' | 'after' | 'child'

/** Rebuild only the affected outline, retaining the original topic content and media. */
export function moveOutlineBranch(root: PMNode, source: PMNode, target: PMNode, mode: DropMode): PMNode | null {
  let containsTarget = false
  source.descendants(node => { if (node === target) containsTarget = true })
  if (source === target || containsTarget) return null
  let removed = false, inserted = false
  const visit = (node: PMNode): PMNode | null => {
    if (node === source) { removed = true; return null }
    if (node.isLeaf) return node
    const children: PMNode[] = []
    node.forEach(child => {
      if (child === target && mode === 'before') { children.push(source); inserted = true }
      const next = visit(child)
      if (next) children.push(next)
      if (child === target && mode === 'after') { children.push(source); inserted = true }
    })
    if (node === target && mode === 'child') {
      if (node.type.name === 'outlineList') {
        children.push(source); inserted = true
        return node.type.create(node.attrs, children, node.marks)
      }
      const index = children.findIndex(child => child.type.name === 'outlineList')
      if (index >= 0) {
        const list = children[index], items: PMNode[] = []
        list.forEach(child => items.push(child))
        children[index] = list.type.create(list.attrs, [...items, source])
      } else children.push(node.type.schema.nodes.outlineList.create(null, source))
      inserted = true
    }
    if (node.type.name === 'outlineList' && !children.length) return null
    return node.type.create(node === target && mode === 'child' ? { ...node.attrs, collapsed: false } : node.attrs, children, node.marks)
  }
  const next = visit(root)
  return removed && inserted && next?.type.validContent(next.content) && !root.eq(next) ? next : null
}

const ns = 'http://www.w3.org/2000/svg'
/** Edges are measured from live editable paragraphs, so wrapping and media stay in sync. */
export function mountOutlineMap(dom: HTMLElement, viewport: HTMLElement, list: HTMLElement, editor?: Editor, getPos?: () => number | undefined) {
  const stage = document.createElement('div')
  stage.className = 'outline-map-stage'
  const svg = document.createElementNS(ns, 'svg')
  svg.classList.add('outline-map-edges')
  svg.setAttribute('aria-hidden', 'true')
  const root = document.createElement('input')
  root.className = 'outline-map-root'
  root.setAttribute('aria-label', '中心主题')
  root.readOnly = !editor?.isEditable
  if (getPos) outlinePositions.set(root, getPos)
  root.contentEditable = 'false'
  const controls = document.createElement('div')
  controls.className = 'outline-map-controls'
  controls.contentEditable = 'false'
  let zoom = 1, frame = 0, disposed = false, initialized = false
  const buttons: HTMLButtonElement[] = []
  for (const [label, value] of [['缩小', '−'], ['重置缩放', '100%'], ['放大', '+']]) {
    const button = document.createElement('button')
    button.type = 'button'; button.textContent = value; button.setAttribute('aria-label', label)
    button.onclick = () => {
      zoom = label === '重置缩放' ? 1 : Math.max(.5, Math.min(1.5, zoom + (label === '放大' ? .1 : -.1)))
      stage.style.setProperty('zoom', String(zoom)); buttons[1].textContent = `${Math.round(zoom * 100)}%`; schedule()
    }
    controls.append(button); buttons.push(button)
  }
  const expand = document.createElement('button')
  expand.type = 'button'; expand.textContent = '展开画布'; expand.setAttribute('aria-label', '展开画布')
  expand.onclick = () => {
    const expanded = dom.dataset.expanded !== 'true'
    dom.dataset.expanded = String(expanded); expand.textContent = expanded ? '收起画布' : '展开画布'
    expand.setAttribute('aria-label', expand.textContent); viewport.scrollTop = 0; schedule()
  }
  controls.prepend(expand)
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && dom.dataset.expanded === 'true' && !dom.querySelector('[data-dragging="true"]')) expand.click() }
  window.addEventListener('keydown', escape)
  viewport.append(stage)
  stage.append(svg, root, list)
  dom.append(controls)
  const isMap = () => dom.dataset.view === 'mindmap' && !dom.closest('[data-type="outline-item"]')
  const draw = () => {
    frame = 0
    if (disposed) return
    const active = isMap()
    dom.dataset.mapRoot = String(active)
    root.hidden = controls.hidden = !active
    if (!active) {
      initialized = false; dom.dataset.expanded = 'false'
      expand.textContent = '展开画布'; expand.setAttribute('aria-label', '展开画布')
      // Mindmap layout writes absolute coordinates onto controls. Clear them when
      // returning to outline mode, otherwise those inline values override the
      // normal outline CSS and leave the black dots floating beside the wrong row.
      list.querySelectorAll<HTMLElement>('.outline-toggle, .outline-drag').forEach(control => {
        control.style.removeProperty('top')
        control.style.removeProperty('left')
      })
      svg.replaceChildren(); return
    }
    const pos = getPos?.(), node = typeof pos === 'number' ? editor?.state.doc.nodeAt(pos) : null
    let title = node?.attrs.title || dom.dataset.mapTitle
    if (!title && editor && typeof pos === 'number') {
      const before = editor.state.doc.resolve(pos).nodeBefore
      if (before?.type.name === 'heading') title = before.textContent
    }
    if (!title && /^H[1-6]$/.test((dom.previousElementSibling || dom.closest('[data-type="outline-block"]')?.previousElementSibling)?.tagName || '')) title = (dom.previousElementSibling || dom.closest('[data-type="outline-block"]')?.previousElementSibling)?.textContent
    if (document.activeElement !== root) root.value = title || dom.dataset.mapTitle || '思维导图'
    const base = stage.getBoundingClientRect()
    const paths: SVGPathElement[] = []
    const connect = (from: Element, to: Element) => {
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect()
      const x1 = ((from === root ? a.left + a.width / 2 : a.right) - base.left) / zoom
      const y1 = (a.top + a.height / 2 - base.top) / zoom
      const x2 = (b.left - base.left) / zoom, y2 = (b.top + b.height / 2 - base.top) / zoom
      const dx = Math.max(20, (x2 - x1) * .55)
      const path = document.createElementNS(ns, 'path')
      path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`)
      paths.push(path)
    }
    const visit = (ul: Element, parent: Element, depth: number) => {
      for (const item of Array.from(ul.children) as HTMLElement[]) {
        item.dataset.mapDepth = String(depth)
        const itemPos = outlinePositions.get(item)?.()
        const selected = editor?.state.selection.from
        const own = typeof itemPos === 'number' ? editor?.state.doc.nodeAt(itemPos)?.firstChild : null
        item.dataset.mapSelected = String(typeof selected === 'number' && typeof itemPos === 'number' && (selected === itemPos || selected >= itemPos + 1 && selected <= itemPos + 1 + (own?.nodeSize || 0)))
        item.dataset.mapEditing = String(!!editor?.isFocused && editor.state.selection instanceof TextSelection && typeof selected === 'number' && typeof itemPos === 'number' && selected >= itemPos + 1 && selected <= itemPos + 1 + (own?.nodeSize || 0))
        const p = item.querySelector<HTMLElement>(':scope > .outline-content > p')
        if (!p) continue
        connect(parent, p)
        const toggle = item.querySelector<HTMLElement>(':scope > .outline-toggle')
        const handle = item.querySelector<HTMLElement>(':scope > .outline-drag')
        if (toggle) { toggle.style.top = `${p.offsetTop + p.offsetHeight / 2 - 16}px`; toggle.style.left = `${p.offsetLeft + p.offsetWidth}px` }
        if (handle) { handle.style.top = `${p.offsetTop - 10}px`; handle.style.left = `${p.offsetLeft + p.offsetWidth - 18}px` }
        if (item.dataset.collapsed !== 'true') {
          const sub = item.querySelector(':scope > .outline-content > .outline-view > .outline-viewport > .outline-map-stage > ul')
          if (sub) visit(sub, p, depth + 1)
        }
      }
    }
    // Depth styling changes geometry; apply it before measuring the edges next frame.
    const nodes = Array.from(list.querySelectorAll<HTMLElement>('li[data-type="outline-item"]'))
    let changed = false
    nodes.forEach(item => {
      let depth = 1, parent = item.parentElement?.closest('li[data-type="outline-item"]')
      while (parent && list.contains(parent)) { depth++; parent = parent.parentElement?.closest('li[data-type="outline-item"]') ?? null }
      if (item.dataset.mapDepth !== String(depth)) { changed = true; item.dataset.mapDepth = String(depth) }
    })
    if (changed) { schedule(); return }
    visit(list, root, 1)
    if (!initialized && stage.offsetWidth > 0) {
      initialized = true
      zoom = Math.max(.9, Math.min(1, (viewport.clientWidth - 40) / stage.offsetWidth))
      stage.style.setProperty('zoom', String(zoom)); buttons[1].textContent = `${Math.round(zoom * 100)}%`
      viewport.scrollTop = 0
      schedule(); return
    }
    svg.setAttribute('width', String(stage.offsetWidth)); svg.setAttribute('height', String(stage.offsetHeight))
    svg.replaceChildren(...paths)
  }
  const schedule = () => { if (!frame && !disposed) frame = requestAnimationFrame(draw) }
  let titleEdited = false
  const commitTitle = () => {
    if (!titleEdited) return
    const pos = getPos?.()
    if (editor?.isEditable && typeof pos === 'number') {
      const node = editor.state.doc.nodeAt(pos)
      const title = root.value.trim() || null
      if (node && node.attrs.title !== title) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, title }))
    }
  }
  root.oninput = () => { titleEdited = true; commitTitle() }
  root.onchange = commitTitle
  root.onblur = () => { commitTitle(); titleEdited = false }
  root.onkeydown = event => { if (event.key === 'Enter') { root.blur(); event.preventDefault() } }
  const resize = new ResizeObserver(schedule)
  resize.observe(stage)
  const observed = new Set<Element>()
  const observeMedia = () => {
    const next = new Set(list.querySelectorAll('.outline-content > p, .outline-content > img'))
    for (const element of observed) { if (!next.has(element)) { resize.unobserve(element); observed.delete(element) } }
    for (const element of next) { if (!observed.has(element)) { observed.add(element); resize.observe(element) } }
  }
  editor?.on('update', observeMedia)
  observeMedia()
  const observer = new MutationObserver(records => {
    if (records.some(record => !svg.contains(record.target) && record.target !== svg &&
      !(record.type === 'attributes' && ['style', 'data-map-depth', 'data-map-root'].includes(record.attributeName || '')))) { observeMedia(); schedule() }
  })
  observer.observe(dom, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-view', 'data-collapsed', 'data-map-title'] })
  editor?.on('update', schedule)
  editor?.on('selectionUpdate', schedule)
  schedule()
  return { stage, svg, root, controls, schedule, destroy() { disposed = true; window.removeEventListener('keydown', escape); cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); editor?.off('update', schedule); editor?.off('selectionUpdate', schedule); editor?.off('update', observeMedia) } }
}

export function attachOutlineDrag(button: HTMLButtonElement, item: HTMLElement, editor: Editor, getPos: () => number | undefined) {
  let cleanup: (() => void) | undefined
  const beginDrag = (event: PointerEvent) => {
    if (event.button !== 0 || !editor.isEditable) return
    const map = item.closest<HTMLElement>('.outline-view[data-map-root="true"]')
    if (!map) return
    event.preventDefault(); event.stopPropagation()
    const sourcePos = getPos(), source = typeof sourcePos === 'number' ? editor.state.doc.nodeAt(sourcePos) : null
    if (!source) return
    let target: HTMLElement | null = null, mode: DropMode = 'child', dragging = false
    const hint = document.createElement('div')
    hint.className = 'outline-drop-hint'; hint.contentEditable = 'false'; hint.hidden = true
    const preview = document.createElementNS(ns, 'svg')
    preview.classList.add('outline-drag-preview'); preview.setAttribute('aria-hidden', 'true'); preview.style.display = 'none'
    const line = document.createElementNS(ns, 'path'); preview.append(line)
    map.append(preview, hint)
    item.setPointerCapture(event.pointerId)
    const clearTarget = () => { target?.removeAttribute('data-drop'); target = null }
    const finish = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('keydown', key)
      if (item.hasPointerCapture(event.pointerId)) item.releasePointerCapture(event.pointerId)
      clearTarget(); item.removeAttribute('data-dragging'); hint.remove(); preview.remove(); cleanup = undefined
    }
    const move = (e: PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 5) return
      dragging = true; item.dataset.dragging = 'true'; hint.hidden = false; preview.style.removeProperty('display')
      const element = document.elementFromPoint(e.clientX, e.clientY)
      const candidate = element?.closest<HTMLElement>('li[data-type="outline-item"]') || element?.closest<HTMLElement>('.outline-map-root') || null
      clearTarget()
      if (candidate && map.contains(candidate) && candidate !== item && !item.contains(candidate)) {
        const p = (candidate.matches('.outline-map-root') ? candidate : candidate.querySelector(':scope > .outline-content > p'))?.getBoundingClientRect()
        if (p) {
          target = candidate
          const ratio = (e.clientY - p.top) / p.height
          mode = candidate.matches('.outline-map-root') ? 'child' : ratio < .25 ? 'before' : ratio > .75 ? 'after' : 'child'
          target.dataset.drop = mode
        }
      }
      const origin = item.querySelector(':scope > .outline-content > p')?.getBoundingClientRect()
      const canvas = map.getBoundingClientRect()
      if (origin) {
        const x = origin.right - canvas.left, y = origin.top + origin.height / 2 - canvas.top
        const dx = e.clientX - canvas.left, dy = e.clientY - canvas.top
        line.setAttribute('d', `M ${x} ${y} C ${x + 40} ${y}, ${dx - 40} ${dy}, ${dx} ${dy}`)
        line.setAttribute('stroke', target ? '#1677ff' : '#8b97a8')
      }
      hint.dataset.valid = String(!!target)
      hint.textContent = target ? (mode === 'child' ? '移入主题' : mode === 'before' ? '放在前面' : '放在后面') : '拖到主题上，调整分支'
      hint.style.left = `${e.clientX - map.getBoundingClientRect().left + 14}px`
      hint.style.top = `${e.clientY - map.getBoundingClientRect().top + 14}px`
      const viewport = map.querySelector<HTMLElement>(':scope > .outline-viewport')
      if (viewport) {
        const rect = viewport.getBoundingClientRect()
        if (e.clientX > rect.right - 35) viewport.scrollLeft += 20
        if (e.clientX < rect.left + 35) viewport.scrollLeft -= 20
      }
    }
    const up = () => {
      if (dragging && target) {
        const targetPos = outlinePositions.get(target)?.(), rootList = map.querySelector<HTMLElement>(':scope > .outline-viewport > .outline-map-stage > ul')
        const rootPos = rootList ? outlinePositions.get(rootList)?.() : undefined
        const targetNode = typeof targetPos === 'number' ? editor.state.doc.nodeAt(targetPos) : null
        const rootNode = typeof rootPos === 'number' ? editor.state.doc.nodeAt(rootPos) : null
        if (rootNode && targetNode && typeof rootPos === 'number') {
          const next = moveOutlineBranch(rootNode, source, targetNode, mode)
          if (next) {
            const tr = closeHistory(editor.state.tr).replaceWith(rootPos, rootPos + rootNode.nodeSize, next)
            let selection = rootPos + 1
            next.descendants((node, pos) => { if (node === source) { selection = rootPos + 1 + pos; return false } })
            tr.setSelection(NodeSelection.create(tr.doc, selection)).scrollIntoView()
            editor.view.dispatch(tr)
            editor.view.dispatch(closeHistory(editor.state.tr))
            editor.view.focus()
          }
        }
      }
      finish()
    }
    const cancel = () => finish()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); finish() } }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel); window.addEventListener('keydown', key)
    cleanup = finish
  }
  const inMap = () => !!item.closest('.outline-view[data-map-root="true"]') && editor.isEditable
  const selected = () => editor.state.selection instanceof NodeSelection && editor.state.selection.from === getPos()
  const selectTopic = () => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    item.dataset.mapEditing = 'false'
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
    editor.view.focus()
  }
  const editTopic = (event?: MouseEvent) => {
    const pos = getPos()
    if (typeof pos !== 'number') return
    const topic = editor.state.doc.nodeAt(pos)
    const end = pos + 2 + (topic?.firstChild?.content.size || 0)
    const hit = event ? editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos : end
    item.dataset.mapEditing = 'true'
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, Math.max(pos + 2, Math.min(end, hit ?? end)))))
    editor.view.focus()
  }
  const ownTopic = (target: EventTarget | null) => {
    const element = target instanceof Element ? target : null
    const paragraph = element?.closest('p')
    return element?.closest('li[data-type="outline-item"]') === item && paragraph?.parentElement === item.querySelector(':scope > .outline-content')
  }
  const pointer = (event: PointerEvent) => {
    if (!inMap() || !ownTopic(event.target) || item.dataset.mapEditing === 'true' || event.button !== 0) return
    selectTopic()
    beginDrag(event)
  }
  const mouse = (event: MouseEvent) => {
    if (inMap() && (ownTopic(event.target) || event.target === item) && item.dataset.mapEditing !== 'true' && event.button === 0) {
      event.preventDefault(); event.stopPropagation()
    }
  }
  const doubleClick = (event: MouseEvent) => {
    if (!inMap() || !(ownTopic(event.target) || event.target === item) || item.dataset.mapEditing === 'true') return
    event.preventDefault(); event.stopPropagation(); editTopic(event)
  }
  const keyDown = (event: KeyboardEvent) => {
    if (!inMap() || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if ((selected() || item.dataset.mapEditing === 'true') && event.key.toLowerCase() === 'a' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault(); event.stopPropagation()
      const pos = getPos()
      if (typeof pos === 'number') {
        editTopic()
        const size = editor.state.doc.nodeAt(pos)?.firstChild?.content.size || 0
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos + 2, pos + 2 + size)))
      }
      return
    }
    if (selected()) {
      if ((event.key === 'Enter' || event.key === 'F2') && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); editTopic()
      } else if (event.key === '.' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault(); event.stopPropagation()
        item.querySelector<HTMLButtonElement>(':scope > .outline-toggle')?.click()
      } else if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault(); event.stopPropagation(); editTopic()
        editor.commands.keyboardShortcut(event.shiftKey ? 'Shift-Tab' : 'Tab')
        const { $from } = editor.state.selection
        for (let depth = $from.depth; depth > 0; depth--) {
          if ($from.node(depth).type.name === 'outlineItem') {
            editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, $from.before(depth))).scrollIntoView())
            break
          }
        }
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) editTopic()
    } else if (item.dataset.mapEditing === 'true' && event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); selectTopic()
    }
  }
  const composition = (event: Event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
    if (inMap() && selected()) editTopic()
  }
  const beforeInput = (event: InputEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || !inMap() || !selected()) return
    if (event.inputType.startsWith('insert')) {
      if (event.inputType === 'insertParagraph') { event.preventDefault(); event.stopPropagation() }
      editTopic()
    }
  }
  const refreshEditing = () => {
    if (item.dataset.mapEditing !== 'true') return
    const pos = getPos(), { $from } = editor.state.selection
    let own = false
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'outlineItem') { own = $from.before(depth) === pos; break }
    }
    if (!own || selected() || !inMap()) item.dataset.mapEditing = 'false'
  }
  button.onpointerdown = beginDrag
  item.addEventListener('pointerdown', pointer, true)
  item.addEventListener('mousedown', mouse, true)
  item.addEventListener('click', mouse, true)
  item.addEventListener('dblclick', doubleClick, true)
  editor.view.dom.addEventListener('keydown', keyDown, true)
  editor.view.dom.addEventListener('compositionstart', composition, true)
  editor.view.dom.addEventListener('paste', composition, true)
  editor.view.dom.addEventListener('beforeinput', beforeInput, true)
  editor.on('selectionUpdate', refreshEditing)
  return () => {
    cleanup?.()
    item.removeEventListener('pointerdown', pointer, true)
    item.removeEventListener('mousedown', mouse, true)
    item.removeEventListener('click', mouse, true)
    item.removeEventListener('dblclick', doubleClick, true)
    editor.view.dom.removeEventListener('keydown', keyDown, true)
    editor.view.dom.removeEventListener('compositionstart', composition, true)
    editor.view.dom.removeEventListener('paste', composition, true)
    editor.view.dom.removeEventListener('beforeinput', beforeInput, true)
    editor.off('selectionUpdate', refreshEditing)
  }
}

