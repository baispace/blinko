import { chromium } from 'playwright';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic3VwZXJhZG1pbiIsIm5hbWUiOiJhZG1pbiIsInN1YiI6IjEiLCJleHAiOjQ5NDU0MDk0MDgsImlhdCI6MTc5MTgwOTQwOH0.EpP1UXiBFb2z03AZSbFNKA6JyvNywW0faGphibAVk3A';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:1111/?path=blinko', { waitUntil: 'networkidle' });
await page.evaluate((t) => {
  localStorage.setItem('blinkoToken', JSON.stringify({
    user: { id: 1, name: 'admin', nickname: 'admin', role: 'superadmin', image: '', loginType: '' },
    token: t,
    expires: new Date(Date.now() + 24*60*60*1000).toISOString(),
    requiresTwoFactor: false,
  }));
}, TOKEN);
await page.goto('http://127.0.0.1:1111/?path=blinko', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

// 全屏截图
await page.screenshot({ path: '.shots/header-full.png' });

// 只截顶部 70px
const header = await page.locator('header').first().boundingBox();
if (header) {
  await page.screenshot({ path: '.shots/header-only.png', clip: { x: header.x, y: header.y, width: header.width, height: header.height } });
}

// 提取所有按钮的标签和位置
const buttons = await page.evaluate(() => {
  const out = [];
  const headerEl = document.querySelector('header');
  if (!headerEl) return out;
  const btns = headerEl.querySelectorAll('button, [role="button"]');
  btns.forEach((b, i) => {
    const r = b.getBoundingClientRect();
    out.push({
      i,
      tag: b.tagName,
      text: (b.textContent || '').trim().slice(0, 30),
      title: b.title || b.getAttribute('aria-label') || '',
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
    });
  });
  return out;
});
console.log('header buttons:');
for (const b of buttons) console.log(' ', JSON.stringify(b));

await browser.close();
