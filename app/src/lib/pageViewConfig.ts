import { BlinkoStore } from '@/store/blinkoStore';

/**
 * Per-page view settings isolation.
 *
 * The home view-settings popover used to write straight into global config
 * keys, so the blinko page and the notes page shared one set of view
 * settings. Settings are now stored per page scope under the
 * `pageViewSettings` config key:
 *
 *   pageViewSettings = {
 *     blinko: { cardSpacing: 8, noteListStyle: 'byDay', ... },
 *     notes:  { ... },
 *   }
 *
 * Reading falls back to the global value when a scope has no override yet.
 */
export const PAGE_VIEW_KEYS = [
  'hidePcEditor',
  'maxHomePageWidth',
  'cardSpacing',
  'noteListStyle',
  'smallDeviceCardColumns',
  'mediumDeviceCardColumns',
  'largeDeviceCardColumns',
  'noteListSortBy',
] as const;

export type PageViewKey = (typeof PAGE_VIEW_KEYS)[number];
export type PageViewScope = 'blinko' | 'notes' | 'all' | 'todo' | 'archived' | 'trash';

/** Map the home route's `path` query param to a settings scope. */
export function getPageViewScope(searchParams: URLSearchParams): PageViewScope {
  const p = searchParams.get('path');
  if (p === 'notes' || p === 'all' || p === 'todo' || p === 'archived' || p === 'trash') return p;
  return 'blinko';
}

type PageViewSettingsMap = Partial<Record<string, Partial<Record<PageViewKey, any>>>>;

function getScopeSettings(blinko: BlinkoStore, scope: PageViewScope): Partial<Record<PageViewKey, any>> {
  return (blinko.config.value?.pageViewSettings as PageViewSettingsMap)?.[scope] ?? {};
}

/** Read one view setting with per-page override → global fallback. */
export function getPageViewSetting(blinko: BlinkoStore, scope: PageViewScope, key: PageViewKey): any {
  const scoped = getScopeSettings(blinko, scope)[key];
  if (scoped !== undefined) return scoped;
  return (blinko.config.value as any)?.[key];
}

/** Write one view setting into the current page scope. */
export async function updatePageViewSetting(
  blinko: BlinkoStore,
  scope: PageViewScope,
  key: PageViewKey,
  value: any,
  save: (key: string, value: any) => Promise<void>
): Promise<void> {
  const map: PageViewSettingsMap = { ...(blinko.config.value?.pageViewSettings as PageViewSettingsMap ?? {}) };
  map[scope] = { ...(map[scope] ?? {}), [key]: value };
  // local write keeps the UI reactive before the refetch lands
  blinko.config.value = { ...blinko.config.value, pageViewSettings: map };
  await save('pageViewSettings', map);
}

/** Column slider updates all three breakpoint keys inside the page scope. */
export async function updatePageViewColumns(
  blinko: BlinkoStore,
  scope: PageViewScope,
  n: number,
  save: (key: string, value: any) => Promise<void>
): Promise<void> {
  const map: PageViewSettingsMap = { ...(blinko.config.value?.pageViewSettings as PageViewSettingsMap ?? {}) };
  map[scope] = {
    ...(map[scope] ?? {}),
    smallDeviceCardColumns: Math.min(n, 2),
    mediumDeviceCardColumns: n,
    largeDeviceCardColumns: n,
  };
  blinko.config.value = { ...blinko.config.value, pageViewSettings: map };
  await save('pageViewSettings', map);
}
