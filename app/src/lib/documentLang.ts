/**
 * Keeps `<html lang>` in sync with the resolved i18n language.
 *
 * Extracted from the removed `lib/harmonyFont.ts`, which used this to decide
 * which bundled CJK face to activate. The font is gone, but the attribute is
 * still needed for `:lang()` CSS selectors and assistive technology.
 */

/** Normalize an app locale into a valid BCP-47 tag for the `<html lang>` attribute. */
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

/** Write the normalized language onto `<html>`. */
export function syncDocumentLang(language: string | undefined): void {
  if (typeof document === 'undefined') return;
  const next = normalizeDocumentLang(language);
  if (document.documentElement.lang !== next) {
    document.documentElement.lang = next;
  }
}

/**
 * Subscribe to i18n lifetime events so the document language stays in sync.
 */
export function bindDocumentLangToI18n(instance: {
  resolvedLanguage?: string;
  language?: string;
  on: (event: string, cb: () => void) => void;
}): void {
  const apply = () => syncDocumentLang(instance.resolvedLanguage ?? instance.language);
  apply();
  instance.on('initialized', apply);
  instance.on('languageChanged', apply);
}
