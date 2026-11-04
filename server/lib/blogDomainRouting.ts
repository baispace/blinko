/** Host-based public entry. Private hosts retain their existing routing. */
export function blogDomainRequest(input: {host: string; url: string; method: string; enabled: boolean; origin: string}):
  {kind: 'pass' | 'deny'} | {kind: 'rewrite' | 'redirect'; url: string} {
  let host = '';
  try { host = new URL(input.origin).host.toLowerCase(); } catch { return {kind: 'pass'}; }
  if (!input.enabled || input.host.toLowerCase() !== host) return {kind: 'pass'};
  const i = input.url.indexOf('?');
  const raw = i < 0 ? input.url : input.url.slice(0, i);
  const search = i < 0 ? '' : input.url.slice(i);
  let path: string;
  try { path = decodeURIComponent(raw); } catch { return {kind: 'deny'}; }
  // Encoded separators/segments must not bypass the public API allowlist.
  if (path.includes('\\') || /(?:^|\/)\.\.?(?:\/|$)/.test(path)) return {kind: 'deny'};
  if (path.startsWith('/api/')) {
    if (!raw.startsWith('/api/') || /%2f|%5c/i.test(raw)) return {kind: 'deny'};
    const names = path.startsWith('/api/trpc/') ? path.slice(10).split(',') : [];
    if (names.length && names.every(n => /^blog\.(?:public[A-Za-z0-9_]+|trackView|recommendationEvent|reportTrackingState)$/.test(n))) return {kind: 'pass'};
    if (/^\/api\/(?:file|s3file)\/.+/.test(path) && ['GET','HEAD'].includes(input.method)) return {kind: 'pass'};
    return {kind: 'deny'};
  }
  if (!['GET','HEAD'].includes(input.method)) return {kind: 'deny'};
  if (/^\/(?:api|api-doc|v1|mcp|settings|signin|signup|signout|blog-manage|ai|resources|plugins)(?:\/|$)/.test(path)) return {kind: 'deny'};
  if (/^\/(?:sw\.js|registerSW\.js|workbox-[^/]+\.js)$/.test(path) || /(?:^|\/)\./.test(path)) return {kind: 'deny'};
  if (path === '/blog' || path.startsWith('/blog/')) {
    return {kind: 'redirect', url: input.origin + (raw.slice(5) || '/') + search};
  }
  if (/^\/(?:assets|brand|fonts|font-assets|icons|locales)\//.test(path) ||
      /^\/(?:robots\.txt|sitemap\.xml|favicon\.ico|manifest\.json|manifest\.webmanifest|site\.webmanifest|browserconfig\.xml)$/.test(path)) return {kind: 'pass'};
  return {kind: 'rewrite', url: (raw === '/' ? '/blog' : '/blog' + raw) + search};
}
