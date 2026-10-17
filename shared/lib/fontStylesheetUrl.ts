export const WENKAI_LOCAL_CSS = '/font-assets/lxgw-wenkai/1.7.0/style.css';
const WENKAI_LEGACY_CSS = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css';

/** The bundled font follows the existing static-CDN configuration. */
export function resolveFontStylesheetUrl(url: string, staticCdnBase = ''): string {
  if (url !== WENKAI_LEGACY_CSS && url !== WENKAI_LOCAL_CSS) return url;
  return staticCdnBase.replace(/\/+$/, '') + WENKAI_LOCAL_CSS;
}
