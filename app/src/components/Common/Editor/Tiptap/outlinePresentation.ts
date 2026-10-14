import { iconToSVG } from '@iconify/utils'
import { mdi } from '../../Iconify/icons'

// Material Design Icons, graph-outline, from the installed @iconify/json
// collection (Apache-2.0). Keep the exact library asset, not a custom drawing.
const graphIcon = {"body": "<path fill=\"currentColor\" d=\"M19.5 17c-.14 0-.26 0-.39.04L17.5 13.8c.45-.45.75-1.09.75-1.8a2.5 2.5 0 0 0-2.5-2.5c-.14 0-.25 0-.4.04L13.74 6.3c.47-.46.76-1.09.76-1.8a2.5 2.5 0 0 0-5 0c0 .7.29 1.34.76 1.79L8.65 9.54c-.15-.04-.26-.04-.4-.04a2.5 2.5 0 0 0-2.5 2.5c0 .71.29 1.34.75 1.79l-1.61 3.25C4.76 17 4.64 17 4.5 17a2.5 2.5 0 0 0 0 5A2.5 2.5 0 0 0 7 19.5c0-.7-.29-1.34-.76-1.79l1.62-3.25c.14.04.26.04.39.04s.25 0 .38-.04l1.63 3.25c-.47.45-.76 1.09-.76 1.79a2.5 2.5 0 0 0 5 0A2.5 2.5 0 0 0 12 17c-.13 0-.26 0-.39.04L10 13.8c.45-.45.75-1.09.75-1.8c0-.7-.29-1.33-.75-1.79l1.61-3.25c.13.04.26.04.39.04s.26 0 .39-.04L14 10.21a2.5 2.5 0 0 0 1.75 4.29c.13 0 .25 0 .38-.04l1.63 3.25c-.47.45-.76 1.09-.76 1.79a2.5 2.5 0 0 0 5 0a2.5 2.5 0 0 0-2.5-2.5m-15 3.5c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1m8.5-1c0 .55-.45 1-1 1s-1-.45-1-1s.45-1 1-1s1 .45 1 1M7.25 12c0-.55.45-1 1-1s1 .45 1 1s-.45 1-1 1s-1-.45-1-1M11 4.5c0-.55.45-1 1-1s1 .45 1 1s-.45 1-1 1s-1-.45-1-1m3.75 7.5c0-.55.45-1 1-1s1 .45 1 1s-.45 1-1 1s-1-.45-1-1m4.75 8.5c-.55 0-1-.45-1-1s.45-1 1-1s1 .45 1 1s-.45 1-1 1\"/>", "width": 24, "height": 24}

export function outlineIconData(mindmap: boolean) {
  const data = mindmap ? mdi.icons!['format-list-bulleted'] : graphIcon
  return { ...data, width: data.width || 24, height: data.height || 24 }
}

/** Use the application's local icon collection; no network icon requests. */
export function outlineViewIcon(mindmap: boolean): SVGSVGElement {
  const rendered = iconToSVG(outlineIconData(mindmap), { width: '16', height: '16' })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [key, value] of Object.entries(rendered.attributes)) svg.setAttribute(key, String(value))
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')
  svg.innerHTML = rendered.body
  return svg
}

const transitions = new WeakMap<HTMLElement, Animation>()

/** Animate only presentation. Children stay in the ProseMirror/React tree. */
export function animateOutlineBranch(element: HTMLElement, collapsed: boolean) {
  const previous = transitions.get(element)
  element.style.display = 'block'
  const height = previous ? element.getBoundingClientRect().height : collapsed ? element.scrollHeight : 0
  const style = getComputedStyle(element)
  const opacity = previous ? Number.parseFloat(style.opacity) : collapsed ? 1 : 0
  const marginTop = previous || collapsed ? style.marginTop : '0px'
  const marginBottom = previous || collapsed ? style.marginBottom : '0px'
  if (previous) {
    previous.onfinish = null
    previous.cancel()
    transitions.delete(element)
  }
  element.inert = collapsed
  const cleanup = () => {
    element.style.removeProperty('display')
    element.style.removeProperty('overflow')
    delete element.dataset.animating
  }
  if (!element.isConnected || !element.getClientRects().length ||
      typeof element.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    cleanup()
    return
  }
  element.dataset.animating = 'true'
  element.style.overflow = 'hidden'
  const animation = element.animate([
    { height: `${height}px`, opacity, marginTop, marginBottom },
    { height: `${collapsed ? 0 : element.scrollHeight}px`, opacity: collapsed ? 0 : 1,
      marginTop: collapsed ? '0px' : getComputedStyle(element).marginTop,
      marginBottom: collapsed ? '0px' : getComputedStyle(element).marginBottom },
  ], { duration: 190, easing: 'cubic-bezier(.2, 0, 0, 1)', fill: 'both' })
  transitions.set(element, animation)
  animation.onfinish = () => {
    if (transitions.get(element) !== animation) return
    transitions.delete(element)
    cleanup()
    animation.cancel()
  }
}

export function cancelOutlineBranch(element: HTMLElement | null) {
  if (!element) return
  const animation = transitions.get(element)
  if (animation) {
    animation.onfinish = null
    animation.cancel()
    transitions.delete(element)
  }
  element.style.removeProperty('display')
  element.style.removeProperty('overflow')
  delete element.dataset.animating
}

const mapControlIcons = {"drag-vertical": {"body": "<path fill=\"currentColor\" d=\"M9 3h2v2H9zm4 0h2v2h-2zM9 7h2v2H9zm4 0h2v2h-2zm-4 4h2v2H9zm4 0h2v2h-2zm-4 4h2v2H9zm4 0h2v2h-2zm-4 4h2v2H9zm4 0h2v2h-2z\"/>"}, "plus-circle-outline": {"body": "<path fill=\"currentColor\" d=\"M12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2m1 5h-2v4H7v2h4v4h2v-4h4v-2h-4z\"/>"}, "minus-circle-outline": {"body": "<path fill=\"currentColor\" d=\"M12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8s8 3.59 8 8s-3.59 8-8 8m0-18A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2M7 13h10v-2H7\"/>"}}
export function outlineControlIcon(name: keyof typeof mapControlIcons) {
  const rendered = iconToSVG({ ...mapControlIcons[name], width: 24, height: 24 }, { width: '16', height: '16' })
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  for (const [key, value] of Object.entries(rendered.attributes)) svg.setAttribute(key, String(value))
  svg.setAttribute('aria-hidden', 'true'); svg.innerHTML = rendered.body
  return svg
}
