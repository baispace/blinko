import { expect, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  BRAND_ASSET_VERSION,
  BRAND_COLOR,
  BRAND_COLOR_DARK,
  BRAND_COLOR_INK,
  BRAND_COLOR_SOFT,
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
const APP_SRC = join(ROOT, 'app/src');
const GLOBALS_CSS = join(APP_SRC, 'styles/globals.css');

/** 品牌紫：站点 favicon / app-icon / manifest theme_color 用的是同一个值。 */
const BRAND_PURPLE = BRAND_COLOR;

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

/* ------------------------------------------------------------------ *
 * 主色与品牌色
 *
 * 站点 UI 的默认主色以前是一支和品牌无关的旧蓝，于是登录页会出现
 * 「紫 J 标记 + 蓝色登录按钮」。这一组断言把两条线钉在一起：
 * 改品牌色要一起改，改 UI 主色必须回到品牌色。
 * ------------------------------------------------------------------ */

/** 递归列出目录下的所有文件。 */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else out.push(path);
  }
  return out;
}

/** 仓库里不该出现的构建产物 / 依赖 / 本地临时目录。 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'coverage',
  '.workbuddy', '.turbo', '.next', '.output', 'public/build',
]);

/** 相对亮度（WCAG 2.1）。 */
function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** 对比度（WCAG 2.1）。 */
function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * 默认主色就是品牌紫。
 *
 * --primary 决定了按钮、选中项、焦点环和 HeroUI 的主色，
 * 所以它必须和标记、favicon、manifest 用同一个紫色。
 */
test('the default UI primary colour is the brand purple', () => {
  const css = readFileSync(GLOBALS_CSS, 'utf8');
  expect(css).toContain(`--primary: ${BRAND_COLOR};`);
  expect(css).toContain(`--primary: ${BRAND_COLOR_DARK};`);
  // 焦点环与选中态的兜底色不能留旧蓝
  expect(css).toContain(`var(--primary,#${BRAND_COLOR.slice(1)})`);
  expect(css).toContain(`var(--primary, ${BRAND_COLOR})`);
});

/**
 * 旧的 Ink 蓝在产品代码里彻底清掉。
 *
 * 这支蓝和品牌无关，却曾经是 --primary 的默认值 —— 改掉默认值还不够，
 * 任何一处写死的副本都会让界面重新跑偏，所以整仓库扫一遍。
 */
test('the legacy Ink blue is gone from the product sources', () => {
  const legacy = ['#2f6feb', '#4d8bff'];
  const offenders: string[] = [];
  for (const root of ['app', 'server', 'shared']) {
    for (const file of sourceFiles(join(ROOT, root))) {
      if (!/\.(ts|tsx|js|jsx|css|scss|html|json|svg)$/i.test(file)) continue;
      if (file.split('/').some((segment) => SKIP_DIRS.has(segment))) continue;
      const source = readFileSync(file, 'utf8').toLowerCase();
      if (legacy.some((color) => source.includes(color))) {
        offenders.push(file.slice(ROOT.length + 1));
      }
    }
  }
  expect(offenders).toEqual([]);
});

/**
 * 运行时的兜底色要读常量，而不是再抄一遍十六进制。
 *
 * 内联样式会盖过样式表，所以这几处才是实际生效的值。
 */
test('the runtime fallbacks read the brand colour from the shared source', () => {
  const user = readFileSync(join(APP_SRC, 'store/user.ts'), 'utf8');
  expect(user).toContain('BRAND_COLOR_DARK');
  expect(user).toContain('BRAND_COLOR');

  const saveThemeColor = readFileSync(join(APP_SRC, 'components/Common/Theme/saveThemeColor.ts'), 'utf8');
  expect(saveThemeColor).toContain('BRAND_COLOR_DARK');
  expect(saveThemeColor).toContain('BRAND_COLOR');

  const themeColor = readFileSync(join(APP_SRC, 'components/Common/Theme/ThemeColor.tsx'), 'utf8');
  expect(themeColor).toContain('BRAND_COLOR');
});

/**
 * Tailwind 的任意值只能是字面量，没法引用 JS 常量，
 * 所以品牌标记的色调由测试钉在 brandGeometry 上。
 */
test('the brand mark tones are the brand colours', () => {
  const mark = readFileSync(join(APP_SRC, 'components/Common/Brand/BrandMark.tsx'), 'utf8');
  expect(mark).toContain(`text-[${BRAND_COLOR}] dark:text-[${BRAND_COLOR_DARK}]`);
  expect(mark).toContain(`text-[${BRAND_COLOR_SOFT}]`);
  expect(mark).toContain(`text-[${BRAND_COLOR_INK}]`);

  const loading = readFileSync(join(APP_SRC, 'components/Common/Brand/BrandLoading.tsx'), 'utf8');
  expect(loading).toContain(`text-[${BRAND_COLOR}] dark:text-[${BRAND_COLOR_DARK}]`);
});

/** 浏览器外壳（PWA 图标、磁贴）也是同一个紫色。 */
test('the browser chrome is painted in the brand purple', () => {
  expect(manifest.theme_color).toBe(BRAND_COLOR);
  expect(html).toContain(`<meta name="msapplication-TileColor" content="${BRAND_COLOR}" />`);
});

/**
 * PWA 插件生成的 manifest 也要是品牌紫。
 *
 * index.html 同时注册了 app/public/manifest.json 和插件生成的
 * manifest.webmanifest —— 两个 <link rel="manifest">，浏览器取先解析到的那个，
 * 但任何一个被读到都不该是白色。
 */
test('the generated PWA manifest reads the brand colour from the shared source', () => {
  const viteConfig = readFileSync(join(ROOT, 'app/vite.config.ts'), 'utf8');
  expect(viteConfig).toContain('theme_color: BRAND_COLOR');
  expect(viteConfig).toContain('name: BRAND_NAME.en');
  // 主题色只能来自 brandGeometry，不许再写死成十六进制
  expect(viteConfig).not.toMatch(/theme_color:\s*['"]#/);
});

/**
 * 主色得撑得住按钮上的文字。
 *
 * 亮色：品牌紫配近白前景；暗色：浅紫配近黑前景。
 * 两边都要过 WCAG AA 的 4.5:1。
 */
test('the brand primary colour keeps its text readable', () => {
  // hsl(210 40% 98%) ≈ #f8fafc
  expect(contrastRatio(BRAND_COLOR, '#f8fafc')).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(BRAND_COLOR_DARK, '#000000')).toBeGreaterThanOrEqual(4.5);
});

/**
 * 登录按钮必须跟着 --primary 走。
 *
 * 一旦有人给它写死颜色，登录页就会退回「紫 J 标记 + 另一支色按钮」。
 */
test('the sign-in button follows the primary colour', () => {
  const signin = readFileSync(join(APP_SRC, 'pages/signin.tsx'), 'utf8');
  expect(signin).toContain('color="primary"');
});
