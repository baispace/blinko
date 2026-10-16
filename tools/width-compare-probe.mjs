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

async function pickWidth(ariaLabel) {
  await page.locator('button.view-options-trigger').first().click();
  await page.waitForTimeout(200);
  const sec = page.locator('section', { has: page.locator('text=/内容宽度/') }).first();
  await sec.locator(`button[aria-label="${ariaLabel}"]`).click();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
}

async function measureMain() {
  // 找正文里带 px-2 md:px-6 mx-auto w-full 的内容主容器
  const r = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div.px-2.md\\:px-6.mx-auto.w-full')];
    return cands.map(el => ({
      cls: el.className,
      inlineStyle: el.getAttribute('style'),
      rectW: Math.round(el.getBoundingClientRect().width),
      docW: document.documentElement.clientWidth,
    }));
  });
  return r;
}

console.log('=== 1120px ===');
await pickWidth('1120px');
console.log(JSON.stringify(await measureMain(), null, 2));

console.log('=== 1440px ===');
await pickWidth('1440px');
console.log(JSON.stringify(await measureMain(), null, 2));

console.log('=== 全宽 ===');
await pickWidth('全宽');
console.log(JSON.stringify(await measureMain(), null, 2));

await browser.close();