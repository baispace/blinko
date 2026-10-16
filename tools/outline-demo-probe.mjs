import { chromium } from 'playwright';
import http from 'node:http';

// 先拿 token
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
const token = tokenJson.token;
const user = tokenJson.user;
console.log('[token] got', token.slice(0, 20) + '...');

const URL = 'http://127.0.0.1:1111/outline-demo';
const SHOT = '.shots/outline-demo.png';

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

page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

// 先 goto 一次设 cookie 上下文
await page.goto('http://127.0.0.1:1111/', { waitUntil: 'domcontentloaded' });
// 直接灌 token + user 进 localStorage
await page.evaluate(({ token, user }) => {
  localStorage.setItem('blinkoToken', JSON.stringify({ user, token }));
}, { token, user });

await page.goto(URL, { waitUntil: 'networkidle' });
console.log('[after goto] url=', page.url());

await page.waitForSelector('.mm-outline-body', { timeout: 10000 });
await page.waitForTimeout(500);

// 统计：解析出来的 root / 节点
const stats = await page.locator('.od-pane-stat').allInnerTexts();
console.log('[stats]', stats);

// 读右栏大纲根节点文本
const rootTexts = await page.locator('.mm-outline-body > ul > li > p').allInnerTexts();
console.log('[root count]', rootTexts.length);
console.log('[root texts]', rootTexts.map(t => t.slice(0, 30)));

// 总节点数
const totalNodes = await page.locator('.mm-outline-body li[data-id]').count();
console.log('[total nodes]', totalNodes);

// 看左栏字数
const ld = await page.locator('.od-textarea').inputValue();
console.log('[textarea len]', ld.length);

await page.screenshot({ path: SHOT, fullPage: false });
console.log('[shot]', SHOT);

await browser.close();