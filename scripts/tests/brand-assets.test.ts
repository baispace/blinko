import { expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAND_ASSET_VERSION,
  BRAND_MARK_VIEWBOX,
  BRAND_NAME,
  BRAND_PATH_BODY,
  BRAND_PATH_CREASE,
  BRAND_PATH_FRAGMENT,
  resolveBrandName,
} from '../../app/src/components/Common/Brand/brandGeometry';

const ROOT = join(import.meta.dir, '../..');
const INDEX_HTML = join(ROOT, 'app/index.html');
const MANIFEST = join(ROOT, 'app/public/manifest.json');
const BRAND_DIR = join(ROOT, 'app/public/brand');
const ICONS_DIR = join(ROOT, 'app/public/icons');

const html = readFileSync(INDEX_HTML, 'utf8');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/** All `d="..."` attributes of a path element, in document order. */
function pathData(svg: string): string[] {
  return [...svg.matchAll(/<path[^>]*\sd="([^"]*)"/g)].map((m) => m[1]);
}

/**
 * The mark geometry lives in exactly one place.
 *
 * The React components, the static SVGs under app/public/brand and the inline
 * first-paint placeholder in index.html all have to draw the same J. The
 * inline copy cannot import the module, so it is pinned here instead of
 * being left to drift.
 */
test('the inline first-paint placeholder draws the same mark as brandGeometry', () => {
  const boot = html.match(/<div id="app-boot"[\s\S]*?<\/div>/);
  expect(boot).not.toBeNull();
  const paths = pathData(boot![0]);
  expect(paths).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);
  expect(boot![0]).toContain(BRAND_MARK_VIEWBOX);
});

test('the static brand SVGs draw the same mark as brandGeometry', () => {
  const mark = readFileSync(join(BRAND_DIR, 'mark.svg'), 'utf8');
  expect(pathData(mark)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);
  expect(mark).toContain(BRAND_MARK_VIEWBOX);

  const markDark = readFileSync(join(BRAND_DIR, 'mark-dark.svg'), 'utf8');
  expect(pathData(markDark)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);

  // The app icon is the same mark knocked out of a rounded square.
  const appIcon = readFileSync(join(BRAND_DIR, 'app-icon.svg'), 'utf8');
  expect(pathData(appIcon)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);
  expect(appIcon).toMatch(/<rect[^>]*rx=/);

  // The maskable variant is the same silhouette, only scaled into the safe area.
  const maskable = readFileSync(join(BRAND_DIR, 'app-icon-maskable.svg'), 'utf8');
  expect(pathData(maskable)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);
  expect(maskable).not.toBe(appIcon);

  // The simplified (small size) variant additionally fills the fold crease.
  const small = readFileSync(join(BRAND_DIR, 'mark-small.svg'), 'utf8');
  expect(pathData(small)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY, BRAND_PATH_CREASE]);
});

test('the wordmark SVGs use the product name', () => {
  for (const file of ['logo.svg', 'logo-full.svg', 'logo-dark.svg', 'logo-full-dark.svg']) {
    const svg = readFileSync(join(BRAND_DIR, file), 'utf8');
    expect(svg).toContain(BRAND_NAME.en);
    expect(svg).toContain('<text');
  }
  expect(readFileSync(join(BRAND_DIR, 'logo-full.svg'), 'utf8')).toContain(BRAND_NAME.zh);
});

test('the manifest carries the product name', () => {
  expect(manifest.name).toBe(`${BRAND_NAME.en} · ${BRAND_NAME.zh}`);
  expect(manifest.short_name).toBe(BRAND_NAME.en);
  expect(manifest.description).toBe(BRAND_NAME.tagline);
});

test('the product title and app name are the brand', () => {
  expect(html).toContain(`<title>${BRAND_NAME.en}</title>`);
  expect(html).toContain(`<meta name="application-name" content="${BRAND_NAME.en}" />`);
  expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${BRAND_NAME.en}" />`);
});

/** References to shipped brand assets (images and the manifest). */
function assetReferences(): string[] {
  const fromHtml = [...html.matchAll(/(?:href|src)="(\/(?:favicon|icons|brand|manifest)[^"]*)"/g)]
    .map((m) => m[1])
    // browserconfig.xml is a Windows config file, not a cached brand asset.
    .filter((ref) => !ref.endsWith('.xml'));
  const fromManifest = manifest.icons.map((icon: { src: string }) => icon.src);
  return [...fromHtml, ...fromManifest];
}

/**
 * Assets in app/public are served `immutable` for a week, so every reference
 * carries the asset version. Without it a rebranding would only reach users
 * after a manual cache clear.
 */
test('every brand asset reference carries the asset version', () => {
  const version = `?v=${BRAND_ASSET_VERSION}`;
  const references = assetReferences();
  expect(references.length).toBeGreaterThan(0);
  for (const ref of references) {
    expect(ref).toContain(version);
  }
});

test('every referenced brand asset exists on disk', () => {
  for (const ref of assetReferences()) {
    const file = join(ROOT, 'app/public', ref.split('?')[0]);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  }
});

test('the favicon is shipped in both svg and ico form', () => {
  expect(existsSync(join(ROOT, 'app/public/favicon.svg'))).toBe(true);
  expect(existsSync(join(ROOT, 'app/public/favicon.ico'))).toBe(true);
  const ico = readFileSync(join(ROOT, 'app/public/favicon.ico'));
  // ICO header: reserved 0, type 1 (icon), then the image count
  expect(ico[0]).toBe(0);
  expect(ico[1]).toBe(0);
  expect(ico[2]).toBe(1);
  expect(ico[4]).toBeGreaterThanOrEqual(2);
});

test('the small size icons exist for the sizes the product advertises', () => {
  for (const file of [
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'maskable-192.png',
    'maskable-512.png',
  ]) {
    expect(existsSync(join(ICONS_DIR, file))).toBe(true);
  }
});

test('the replaced brand assets are gone', () => {
  for (const file of ['logo.png', 'logo-dark-title.png', 'logo-light-title.png', 'loading.gif']) {
    expect(existsSync(join(ROOT, 'app/public', file))).toBe(false);
  }
});

/**
 * The Chinese name belongs to the default brand.
 *
 * A deployment that renamed the product keeps its own name; nothing forces
 * 拾成 onto it, and an empty title falls back to the brand name.
 */
test('the wordmark carries the Chinese name only for the default brand', () => {
  expect(resolveBrandName(undefined)).toEqual({ name: BRAND_NAME.en, showChinese: true });
  expect(resolveBrandName('')).toEqual({ name: BRAND_NAME.en, showChinese: true });
  expect(resolveBrandName('   ')).toEqual({ name: BRAND_NAME.en, showChinese: true });
  expect(resolveBrandName(BRAND_NAME.en)).toEqual({ name: BRAND_NAME.en, showChinese: true });
  expect(resolveBrandName('Acme')).toEqual({ name: 'Acme', showChinese: false });
  expect(resolveBrandName('  Acme  ')).toEqual({ name: 'Acme', showChinese: false });
});
