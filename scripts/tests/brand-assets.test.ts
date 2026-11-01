import { expect, test } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
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

const sharp = createRequire(new URL('../../server/package.json', import.meta.url))('sharp') as typeof import('../../server/node_modules/sharp');

const ROOT = join(import.meta.dir, '../..');
const INDEX_HTML = join(ROOT, 'app/index.html');
const MANIFEST = join(ROOT, 'app/public/manifest.json');
const BRAND_DIR = join(ROOT, 'app/public/brand');
const ICONS_DIR = join(ROOT, 'app/public/icons');
const TAURI_DIR = join(ROOT, 'app/src-tauri');
const DESKTOP_ICON_DIR = join(TAURI_DIR, 'icons/jomio');
const WORKFLOWS_DIR = join(ROOT, '.github/workflows');

/** 品牌紫：站点 favicon / app-icon / manifest theme_color 用的是同一个值。 */
const BRAND_PURPLE = '#5F40FD';

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

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

/**
 * 桌面端图标曾经是「蓝青渐变 + 文本光标」那套，和站点早就不一致了，
 * 而且没人发现 —— 图标是独立文件，不会被站点的品牌改动带着走。
 * 这里把它钉在 brandGeometry 上：标记和主色都必须来自品牌本身。
 */
test('the desktop app icon draws the same mark as brandGeometry', () => {
  const source = readFileSync(join(DESKTOP_ICON_DIR, 'source.svg'), 'utf8');
  expect(pathData(source)).toEqual([BRAND_PATH_FRAGMENT, BRAND_PATH_BODY]);
  expect(source).toContain(BRAND_PURPLE);
  expect(source).toMatch(/<rect[^>]*rx=/);
});

test('the desktop app icon files exist for every size the bundle asks for', () => {
  for (const file of [
    '32x32.png',
    '128x128.png',
    '128x128@2x.png',
    'icon.icns',
    'icon.ico',
    'icon.png',
    'source.svg',
  ]) {
    const path = join(DESKTOP_ICON_DIR, file);
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).size).toBeGreaterThan(0);
  }
});

/**
 * 图标是从 source.svg 生成出来的，但生成物是二进制，不会被上面的断言看到 ——
 * 这里直接读像素，确认发出去的 PNG 真的是品牌紫，而不是旧的蓝青渐变。
 */
test('the generated desktop icon really is painted in the brand purple', async () => {
  const { data, info } = await sharp(join(DESKTOP_ICON_DIR, 'icon.png'))
    .resize(32, 32)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let purple = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    total++;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    // #5F40FD 的容差范围：紫偏蓝、红中等、绿很低。
    if (b > 180 && r > 80 && r < 165 && g < 115) purple++;
  }
  expect(purple / total).toBeGreaterThan(0.5);
});

test('the desktop bundle carries the product name and the brand icons', () => {
  const mac = readJson(join(TAURI_DIR, 'tauri.macos.conf.json'));
  expect(mac.productName).toBe(BRAND_NAME.en);
  expect(mac.bundle.icon.every((path: string) => path.startsWith('icons/jomio/'))).toBe(true);

  const base = readJson(join(TAURI_DIR, 'tauri.conf.json'));
  expect(base.productName).toBe(BRAND_NAME.en);
  expect(base.app.windows[0].title).toBe(BRAND_NAME.en);
  expect(base.bundle.icon.every((path: string) => path.startsWith('icons/jomio/'))).toBe(true);

  for (const file of ['tauri.ios.conf.json', 'tauri.android.conf.json', 'tauri.cuda.conf.json']) {
    const conf = readJson(join(TAURI_DIR, file));
    expect(conf.productName ?? BRAND_NAME.en).toContain(BRAND_NAME.en);
    for (const window of conf.app.windows) {
      expect(window.title).not.toBe('Blinko');
    }
  }
});

/**
 * 打包时才会用到的图标路径，写错一个就是构建期才炸。
 * 这里按配置里的清单逐个查文件，省得等 CI 才发现。
 */
test('every icon the bundle config asks for exists on disk', () => {
  const configs = [
    'tauri.conf.json',
    'tauri.macos.conf.json',
    'tauri.cuda.conf.json',
  ];
  for (const file of configs) {
    const conf = readJson(join(TAURI_DIR, file));
    for (const path of conf.bundle.icon as string[]) {
      expect(existsSync(join(TAURI_DIR, path))).toBe(true);
    }
  }
});

test('the tray uses the brand icon', () => {
  const tray = readFileSync(join(TAURI_DIR, 'src/desktop/tray.rs'), 'utf8');
  expect(tray).toContain('icons/jomio/32x32.png');
  expect(tray).not.toContain('icons/ink/');
});

/**
 * 旧的 Ink 身份要彻底清掉。
 *
 * 注意 release-mac.yml 里的 INK_TAURI_PRIVATE_KEY 是仓库设置里的 secret 名，
 * 属于外部配置，不在这次改名范围内 —— 它跟应用品牌无关。
 */
test('the old Ink desktop identity is gone', () => {
  expect(existsSync(join(TAURI_DIR, 'icons/ink'))).toBe(false);
  for (const file of ['build-mac.yml', 'release-mac.yml']) {
    const workflow = readFileSync(join(WORKFLOWS_DIR, file), 'utf8');
    expect(workflow).not.toContain('Ink.app');
    expect(workflow).not.toContain('Ink-macOS');
    expect(workflow).not.toContain('Build & Publish Ink');
  }
});
