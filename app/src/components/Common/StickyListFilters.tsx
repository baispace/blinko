import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** One sticky surface for both filters, inside the list's own scroll viewport. */
export function StickyListFilters({ filterKey, children }: { filterKey: string; children: ReactNode }) {
  const anchor = useRef<HTMLDivElement>(null);
  const previousKey = useRef(filterKey);
  useLayoutEffect(() => {
    const marker = anchor.current;
    const viewport = marker?.closest<HTMLElement>('[data-scroll-viewport]');
    const surface = marker?.nextElementSibling as HTMLElement | null;
    const results = surface?.nextElementSibling as HTMLElement | null;
    if (!viewport || !surface || !results?.matches('[data-list-filter-results]')) return;
    // Keep enough space below the sticky bar even while results are loading,
    // empty, or shorter than one screen. Otherwise the browser clamps scrollTop
    // when the old results disappear and brings the composer back into view.
    const measure = () => {
      const inset = parseFloat(getComputedStyle(surface).top) || 0;
      results.style.minHeight = `${Math.max(0, viewport.clientHeight - surface.offsetHeight - inset)}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(surface);
    return () => { observer.disconnect(); results.style.removeProperty('min-height'); };
  }, [filterKey]);
  useLayoutEffect(() => {
    if (previousKey.current === filterKey) return;
    previousKey.current = filterKey;
    const marker = anchor.current;
    const viewport = marker?.closest<HTMLElement>('[data-scroll-viewport]');
    if (!marker || !viewport) return;
    const surface = marker.nextElementSibling;
    const inset = surface ? parseFloat(getComputedStyle(surface).top) || 0 : 0;
    const top = viewport.scrollTop + marker.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop - inset;
    viewport.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }, [filterKey]);

  return <>
    <div ref={anchor} aria-hidden="true" />
    <div data-testid="sticky-list-filters" className="sticky top-14 z-20 -mx-2 mb-3 flex min-w-0 items-center gap-2 border-b border-default-200 bg-background px-2 py-1 empty:hidden md:top-0 md:-mx-6 md:px-6">
      {children}
    </div>
  </>;
}
