import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import '../Editor/Tiptap/outline.css'
import { mountOutlineMap } from '../Editor/Tiptap/outlineMap'
import { Icon } from '@iconify/react/offline'
import { animateOutlineBranch, cancelOutlineBranch, outlineIconData, outlineControlIcon } from '../Editor/Tiptap/outlinePresentation'

/** Reading/share views have local presentation state; never rewrite the note. */
export function OutlineReadList({ children, initialView, title }: { children: ReactNode; initialView?: unknown; title?: unknown }) {
  const [mindmap, setMindmap] = useState(initialView === 'mindmap')
  useEffect(() => setMindmap(initialView === 'mindmap'), [initialView])
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const dom = ref.current!
    const viewport = dom.querySelector<HTMLElement>(':scope > .outline-viewport')!
    const list = viewport.querySelector<HTMLElement>(':scope > ul')!
    const map = mountOutlineMap(dom, viewport, list)
    return () => { map.destroy(); viewport.append(list); map.stage.remove(); map.controls.remove() }
  }, [])
  return (
    <section ref={ref} className="outline-view" data-map-title={typeof title === 'string' ? title : undefined} data-branch-count={Children.toArray(children).filter(isValidElement).length} data-view={mindmap ? 'mindmap' : 'outline'}>
      <div className="outline-toolbar">
        <span className="outline-label">{mindmap ? '思维导图' : '大纲'}</span>
        <button type="button" className="outline-view-toggle" aria-pressed={mindmap}
          aria-label={mindmap ? '切换为大纲' : '切换为思维导图'} title={mindmap ? '切换为大纲' : '切换为思维导图'}
          onClick={event => { event.stopPropagation(); setMindmap(value => !value) }}>
          <Icon icon={outlineIconData(mindmap)} width={16} height={16} />
        </button>
      </div>
      <div className="outline-viewport"><ul data-type="outline">{children}</ul></div>
    </section>
  )
}

export function OutlineReadItem({ children, initiallyCollapsed, hasChildren, bodyRows }: {
  children: ReactNode; initiallyCollapsed: boolean; hasChildren: boolean; bodyRows: number
}) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed)
  const contentRef = useRef<HTMLDivElement>(null)
  const previousCollapsed = useRef(collapsed)
  const lastBranch = useRef<HTMLElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  useLayoutEffect(() => { toggleRef.current?.replaceChildren(outlineControlIcon(collapsed ? 'plus-circle-outline' : 'minus-circle-outline')) }, [collapsed])
  useEffect(() => setCollapsed(initiallyCollapsed), [initiallyCollapsed])
  useLayoutEffect(() => {
    const branch = contentRef.current?.querySelector<HTMLElement>(':scope > .outline-view') ?? null
    lastBranch.current = branch
    if (branch && previousCollapsed.current !== collapsed) animateOutlineBranch(branch, collapsed)
    previousCollapsed.current = collapsed
  }, [collapsed])
  useLayoutEffect(() => () => cancelOutlineBranch(lastBranch.current), [])
  return (
    <li data-type="outline-item" data-collapsed={String(collapsed)} data-has-children={String(hasChildren)}>
      <button ref={toggleRef} type="button" className="outline-toggle" disabled={!hasChildren}
        aria-label={hasChildren ? (collapsed ? '展开子项' : '折叠子项') : '大纲条目'}
        aria-expanded={hasChildren ? !collapsed : undefined}
        title={hasChildren ? (collapsed ? '展开子项' : '折叠子项') : undefined}
        onClick={event => { event.stopPropagation(); setCollapsed(value => !value) }} />
      <div ref={contentRef} className="outline-content" style={{ '--outline-body-rows': Math.max(1, bodyRows) } as CSSProperties}>
        {children}
      </div>
    </li>
  )
}
