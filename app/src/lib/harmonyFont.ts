/**
 * HarmonyOS Sans CJK activation
 *
 * Mirrors the behaviour of app.blinko.space so that the default UI font
 * (see `--font-family` in styles/globals.css) stays in sync:
 *
 *  - The Latin / Greek / Cyrillic face is tiny (~150 KB) and is declared with a
 *    narrow `unicode-range`, so it is always allowed to load.
 *  - The CJK faces are much heavier (SC ≈ 8 MB, TC ≈ 4 MB). They are therefore
 *    fetched lazily, skipped on metered / 2G connections, and only promoted to
 *    `--font-family` (via `harmony-cjk-*-ready` on <html>) *after* the glyphs
 *    are actually available. This avoids a flash of fallback CJK text that
 *    `font-display: swap` alone would produce.
 */

const FONT_VERSION = '2025-03-19';
const LOAD_BUDGET_MS = 1500;
const SC_READY_CLASS = 'harmony-cjk-sc-ready';
const TC_READY_CLASS = 'harmony-cjk-tc-ready';
const READY_CLASSES = [SC_READY_CLASS, TC_READY_CLASS];
const IDLE_TIMEOUT_MS = 5000;
const FALLBACK_IDLE_DELAY_MS = 1000;

type CjkKey = 'sc' | 'tc';

const state = { initialized: false, currentLang: '', generation: 0 };

const CJK_FACES: Record<CjkKey, { family: string; sample: string }> = {
  sc: { family: 'HarmonyOS Sans SC', sample: '记录每一个闪念' },
  tc: { family: 'HarmonyOS Sans TC', sample: '記錄每一個閃念' },
};

/** Map an i18n language tag to the CJK face it needs (null = no CJK face). */
function resolveCjkKey(lang: string | undefined): CjkKey | null {
  if (!lang) return null;
  const normalized = lang.replace('_', '-').toLowerCase();
  if (['zh-tw', 'zh-hk', 'zh-mo'].includes(normalized)) return 'tc';
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'sc';
  return null;
}

/** Normalize an app locale into a valid BCP-47 tag for the <html lang> attribute. */
export function normalizeDocumentLang(lang: string | undefined): string {
  if (!lang) return 'en';
  const normalized = lang.replace('_', '-');
  const lower = normalized.toLowerCase();
  if (lower === 'zh') return 'zh-CN';
  if (lower.startsWith('zh-')) {
    const region = normalized.split('-')[1];
    return region ? `zh-${region.toUpperCase()}` : 'zh-CN';
  }
  return normalized;
}

/** Keep <html lang> in sync with i18n so `:lang()` selectors and a11y stay correct. */
export function syncDocumentLang(language: string | undefined): void {
  if (typeof document === 'undefined') return;
  const next = normalizeDocumentLang(language);
  if (document.documentElement.lang !== next) {
    document.documentElement.lang = next;
  }
}

function isSlowConnection(): boolean {
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  return (
    Boolean(connection.saveData) ||
    connection.effectiveType === 'slow-2g' ||
    connection.effectiveType === '2g'
  );
}

function cacheKey(key: CjkKey): string {
  return `blinko:harmony-cjk:${key}:${FONT_VERSION}`;
}

function isCached(key: CjkKey): boolean {
  try {
    return window.localStorage.getItem(cacheKey(key)) === 'loaded';
  } catch {
    return false;
  }
}

function markCached(key: CjkKey): void {
  try {
    window.localStorage.setItem(cacheKey(key), 'loaded');
  } catch {
    /* storage unavailable (private mode) — the in-memory state still applies */
  }
}

/** Run `cb` after the window `load` event (or immediately if already fired). */
function whenPageLoaded(cb: () => void): void {
  if (document.readyState === 'complete') {
    cb();
    return;
  }
  window.addEventListener('load', cb, { once: true });
}

/** Run `cb` when the main thread is idle. */
function whenIdle(cb: () => void): void {
  if ('requestIdleCallback' in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
    return;
  }
  globalThis.setTimeout(cb, FALLBACK_IDLE_DELAY_MS);
}

/** Load a CJK face and only then promote it to `--font-family`. */
async function activateCjkFace(key: CjkKey, generation: number): Promise<void> {
  const { family, sample } = CJK_FACES[key];
  const startedAt = performance.now();
  try {
    await document.fonts.load(`400 16px "${family}"`, sample);
  } catch {
    return; // font unavailable — keep the fallback stack
  }
  markCached(key);

  const stillCurrent =
    generation === state.generation && resolveCjkKey(document.documentElement.lang) === key;
  if (!stillCurrent) return;

  // Only promote if the face resolved promptly, otherwise the layout would
  // reflow visibly after the user already started reading.
  if (performance.now() - startedAt > LOAD_BUDGET_MS) return;
  applyReadyClass(key);
}

function applyReadyClass(key: CjkKey): void {
  document.documentElement.classList.remove(...READY_CLASSES);
  document.documentElement.classList.add(key === 'sc' ? SC_READY_CLASS : TC_READY_CLASS);
}

function scheduleCjkActivation(lang: string): void {
  if (lang === state.currentLang) return;
  state.currentLang = lang;

  const key = resolveCjkKey(lang);
  const generation = ++state.generation;

  document.documentElement.classList.remove(...READY_CLASSES);
  if (!key) return;

  whenPageLoaded(() => {
    const run = () => {
      if (generation !== state.generation) return;
      if (resolveCjkKey(document.documentElement.lang) !== key) return;
      void activateCjkFace(key, generation);
    };

    if (isCached(key)) {
      run(); // already downloaded once — resolve from the HTTP cache immediately
      return;
    }
    if (isSlowConnection()) {
      // Defer until the first user interaction so the CJK face never competes
      // with the initial render on a slow network.
      const onFirstInteraction = () => {
        ['pointerdown', 'keydown', 'touchstart'].forEach((event) =>
          window.removeEventListener(event, onFirstInteraction)
        );
        whenIdle(run);
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach((event) =>
        window.addEventListener(event, onFirstInteraction, { once: true, passive: true })
      );
      return;
    }
    whenIdle(run);
  });
}

/**
 * Start lazily loading the CJK face matching the current document language and
 * re-evaluate whenever `<html lang>` changes.
 */
export function initHarmonyCjkFont(): void {
  if (state.initialized || typeof document === 'undefined' || !('fonts' in document)) return;
  state.initialized = true;

  const kick = () => scheduleCjkActivation(document.documentElement.lang || 'en');
  kick();

  new MutationObserver(kick).observe(document.documentElement, {
    attributeFilter: ['lang'],
  });
}

/**
 * Convenience wiring for `lib/i18n`: keeps `<html lang>` in sync with the
 * resolved i18n language and activates the matching CJK face.
 */
export function bindHarmonyFontToI18n(instance: {
  resolvedLanguage?: string;
  language?: string;
  on: (event: string, cb: () => void) => void;
}): void {
  const apply = () => syncDocumentLang(instance.resolvedLanguage ?? instance.language);
  apply();
  instance.on('initialized', apply);
  instance.on('languageChanged', apply);
  initHarmonyCjkFont();
}
