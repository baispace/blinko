import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = resolve(import.meta.dir, '../..');
const html = readFileSync(resolve(root, 'app/index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)![1]!;

function bootstrap(name: string, css?: string) {
  const links: any[] = [];
  const prefs: Record<string, string> = { 'ink:font-name': name, 'ink:font-stack': '"LXGW WenKai", serif' };
  if (css) prefs['ink:font-css'] = css;
  const context: any = {
    URL, Promise, location: new URL('https://ink.example.com/'),
    localStorage: { getItem: (key: string) => prefs[key] || null },
    setTimeout: () => 1, clearTimeout() {}, window: {},
    document: {
      documentElement: { style: { setProperty() {} } },
      head: { appendChild: (node: any) => links.push(node) },
      createElement: () => ({ setAttribute() {}, remove() {} }),
      fonts: { load: async () => [] },
    },
  };
  runInNewContext(script, context);
  return { links, context };
}

test('WenKai loads before app initialization and preserves CDN path prefix', async () => {
  const { links, context } = bootstrap('LXGW WenKai', 'https://cdn.example.com/ink/font-assets/lxgw-wenkai/1.7.0/style.css');
  expect(links.filter(link => link.rel === 'preload')).toHaveLength(3);
  expect(links[0].href).toBe('https://cdn.example.com/ink/font-assets/lxgw-wenkai/1.7.0/files/lxgwwenkai-regular-subset-117.woff2');
  expect(links[0].crossOrigin).toBe('anonymous');
  const sheet = links.find(link => link.rel === 'stylesheet');
  expect(sheet.href).toEndWith('/startup-v2.css');
  sheet.onerror();
  expect(sheet.href).toBe('/font-assets/lxgw-wenkai/1.7.0/startup-v2.css');
  sheet.onload();
  await context.window.__inkWenkaiReady;
});

test('other font preferences do not download WenKai', () => {
  expect(bootstrap('Inter').links).toHaveLength(0);
});

test('startup CSS has no import waterfall and all referenced font files exist', () => {
  const base = resolve(root, 'app/public/font-assets/lxgw-wenkai/1.7.0');
  const css = readFileSync(resolve(base, 'startup-v2.css'), 'utf8');
  expect(css).not.toContain('@import');
  const urls = [...css.matchAll(/url\('\.\/([^']+)'\)/g)];
  expect(urls).toHaveLength(194);
  for (const match of urls) expect(existsSync(resolve(base, match[1]!))).toBe(true);
});
