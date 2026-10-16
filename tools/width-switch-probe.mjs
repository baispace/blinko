import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:1111/';

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });

if (page.url().includes('/signin')) {
  await page.locator('input[name="username"]').first().fill('admin');
  await page.locator('input[name="password"]').first().fill('admin1234');
  await page.getByRole('button', { name: /sign-in|登|log/i }).first().click();
  await page.waitForLoadState('networkidle');
}

// ⚙
await page.locator('button.view-options-trigger').first().click();
await page.waitForTimeout(300);

const widthSection = page.locator('section', { has: page.locator('text=/内容宽度/') }).first();
await widthSection.waitFor({ state: 'visible' });

// 读点击前状态
const beforeBtns = await widthSection.locator('button[data-selected]').evaluateAll(els => els.map(el => ({ label: el.getAttribute('aria-label'), selected: el.getAttribute('data-selected') })));
const beforeLabel = await widthSection.locator('span.tabular-nums').innerText();
console.log('[before]', { beforeLabel, beforeBtns });

// 点第 2 档（1120px），对应 aria-label="1120px"
await widthSection.locator('button[aria-label="1120px"]').click();
await page.waitForTimeout(600);

const afterLabel = await widthSection.locator('span.tabular-nums').innerText();
const afterBtns = await widthSection.locator('button[data-selected]').evaluateAll(els => els.map(el => ({ label: el.getAttribute('aria-label'), selected: el.getAttribute('data-selected') })));
console.log('[after click 1120px]', { afterLabel, afterBtns });

// 截图一张
await page.screenshot({ path: '.shots/header-popover-open-1120.png', fullPage: false });

// 检查页面实际宽度是否变化（容器 max-width 应变成 1120px）
const mainWidth = await page.locator('main, .max-w-\\[1120px\\], [style*="max-width"]').first().evaluate(el => {
  const cs = window.getComputedStyle(el);
  return { maxWidth: cs.maxWidth, inlineStyle: el.getAttribute('style') };
}).catch(() => null);
console.log('[main container]', mainWidth);

await browser.close();