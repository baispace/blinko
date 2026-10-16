import { useEffect, useRef, useState, type ReactNode } from 'react';
type Subscription = { observer: IntersectionObserver; callbacks: Map<Element, (visible: boolean) => void> };
const roots = new Map<Element | null, Subscription>();
function subscribe(node: HTMLElement, callback: (visible: boolean) => void) {
  const root = node.closest('[data-scroll-viewport]');
  let subscription = roots.get(root);
  if (!subscription) {
    const callbacks = new Map<Element, (visible: boolean) => void>();
    const observer = new IntersectionObserver(entries => entries.forEach(entry => callbacks.get(entry.target)?.(entry.isIntersecting)), { root, rootMargin: '900px 0px' });
    subscription = { observer, callbacks }; roots.set(root, subscription);
  }
  subscription.callbacks.set(node, callback); subscription.observer.observe(node);
  return () => { subscription!.observer.unobserve(node); subscription!.callbacks.delete(node); if (!subscription!.callbacks.size) { subscription!.observer.disconnect(); roots.delete(root); } };
}
/** Preserve measured space while unmounting offscreen Markdown and media. */
export function ViewportItem({ children, estimate = 180, disabled = false, initial = false }: { children: ReactNode; estimate?: number; disabled?: boolean; initial?: boolean }) {
  const node = useRef<HTMLDivElement>(null);
  const height = useRef(estimate);
  const [visible, setVisible] = useState(initial || disabled);
  const mounted = disabled || visible;
  useEffect(() => {
    if (disabled || !node.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    return subscribe(node.current, value => {
      if (!value && (node.current?.contains(document.activeElement) || Array.from(node.current?.querySelectorAll<HTMLMediaElement>('audio,video') || []).some(media => !media.paused))) return;
      setVisible(value);
    });
  }, [disabled]);
  useEffect(() => {
    const element = node.current;
    if (!mounted || !element) return;
    const measure = () => { const value = element.getBoundingClientRect().height; if (value > 0) height.current = value; };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);
  return <div ref={node} data-viewport-item data-mounted={mounted ? 'true' : 'false'} style={mounted ? { minWidth: 0 } : { height: height.current, minWidth: 0 }}>{mounted ? children : null}</div>;
}
