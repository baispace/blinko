import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:1111/';
const SHOT = '.shots/header-popover-open.png';

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
  console.log('[auth] on signin, logging in');
  // 用 input name 属性匹配（signin.tsx 里 name="username" / name="password"）
  await page.locator('input[name="username"]').first().fill('admin');
  await page.locator('input[name="password"]').first().fill('admin1234');
  // sign-in 按钮是表单里唯一的 color=primary Button
  await page.getByRole('button', { name: /sign-in|登|log/i }).first().click();
  await page.waitForLoadState('networkidle');
  console.log('[auth] after login, url=', page.url());
} else {
  console.log('[auth] already logged in, url=', page.url());
}

// 找 view-options-trigger（BlinkoHomeSettingsPop 的 ⚙ 按钮）
const trig = page.locator('button.view-options-trigger').first();
await trig.waitFor({ state: 'visible', timeout: 10000 });
const box = await trig.boundingBox();
console.log('[trigger] visible, box=', box);
await trig.click();

// 等 popover 内容出现
await page.waitForTimeout(500);

// 读所有 section label
const sectionLabels = await page.locator('section > div > span:first-child').allInnerTexts();
console.log('[popover section labels]', sectionLabels);

// 找"内容宽度"section（中文）
const widthSection = page.locator('section', { has: page.locator('text=/内容宽度|内容寬度|Content width/') }).first();
await widthSection.waitFor({ state: 'visible', timeout: 5000 });
const widthValueText = await widthSection.locator('span.tabular-nums').innerText();
console.log('[current width label]', widthValueText);

const widthButtons = await widthSection.locator('button[data-selected]').count();
console.log('[width buttons]', widthButtons);

await page.screenshot({ path: SHOT, fullPage: false });
console.log('[shot]', SHOT);

await browser.close();