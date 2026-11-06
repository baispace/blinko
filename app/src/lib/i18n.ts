import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '../../public/locales/en/translation.json';
import zh from '../../public/locales/zh/translation.json';
import zhTW from '../../public/locales/zh-TW/translation.json';
import LanguageDetector from 'i18next-browser-languagedetector';
import { syncDocumentLang, bindDocumentLangToI18n } from './documentLang';

// Historically the traditional-Chinese option was stored lower-cased
// ("zh-tw"), which does not match the shipped locale directory ("zh-TW") and
// silently fell back to Simplified. Normalise any persisted value.
try {
  const keys = ['i18nextLng', 'language'];
  for (const key of keys) {
    if (localStorage.getItem(key) === 'zh-tw') localStorage.setItem(key, 'zh-TW');
  }
} catch { /* localStorage unavailable (SSR / private mode) */ }

i18n
  // detect user language
  // learn more: https://github.com/i18next/i18next-browser-languageDetector
  .use(LanguageDetector)
  // pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // init i18next
  // for all options read: https://www.i18next.com/overview/configuration-options
  .init({
    fallbackLng: 'en',
    // Ship translations with their UI version so stale CDN JSON cannot expose keys.
    resources: { en: { translation: en }, zh: { translation: zh }, 'zh-TW': { translation: zhTW } },
    // Only these locales ship with the app (see public/locales). Declaring
    // them keeps i18next from probing directories we no longer publish.
    supportedLngs: ['en', 'zh', 'zh-TW'],
    debug: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage', 'cookie'],
      lookupQuerystring: 'lng',
      lookupCookie: 'i18next',
      lookupLocalStorage: 'i18nextLng',
    }
  });

// Keep <html lang> aligned with the active locale so `:lang()` selectors and
// assistive tech stay correct. (Previously this also lazily activated the
// bundled HarmonyOS Sans CJK face; that font has been removed.)
bindDocumentLangToI18n(i18n);

export default i18n;