import { chromium } from 'playwright';
import http from 'node:http';

const tokenJson = await new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: 1111, path: '/api/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => resolve(JSON.parse(body)));
  });
  req.on('error', reject);
  req.write(JSON.stringify({ username: 'admin', password: 'admin1234' }));
  req.end();
});

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('validateDOMNesting') && !m.text().includes('Element with ID')) {
    console.log('[console.error]', m.text().slice(0, 200));
  }
});

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'domcontentloaded' });
await page.evaluate(({ token, user }) => {
  localStorage.setItem('blinkoToken', JSON.stringify({ user, token }));
}, { token: tokenJson.token, user: tokenJson.user });

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'networkidle' });
console.log('[url]', page.url());

// 等主页 loading
await page.waitForTimeout(3000);

// 找 ProseMirror 编辑器
const hasProseMirror = await page.locator('.ProseMirror').count();
console.log('[ProseMirror count]', hasProseMirror);

// 等闪念卡片
await page.waitForSelector('main, [class*="note"], .bl-note-card, [data-card]', { timeout: 10000 }).catch(() => null);

// 看一下页面有多少 blinko 卡片
const cardCount = await page.locator('[class*="BlinkoListRow"], [class*="BlinkoCard"], [class*="card-blog-box"]').count();
console.log('[card count]', cardCount);

// 找一个"新建"按钮或点击进入详情
const newBtn = page.getByRole('button', { name: /new|新建|create|添加/i }).first();
const hasNew = await newBtn.isVisible().catch(() => false);
console.log('[new button visible]', hasNew);

// 截图当前页
await page.screenshot({ path: '.shots/tiptap-v3-home.png', fullPage: false });
console.log('[shot] .shots/tiptap-v3-home.png');

await browser.close();