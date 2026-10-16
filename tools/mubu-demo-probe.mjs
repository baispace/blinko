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

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();

page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'domcontentloaded' });
await page.evaluate(({ token, user }) => {
  localStorage.setItem('blinkoToken', JSON.stringify({ user, token }));
}, { token: tokenJson.token, user: tokenJson.user });

await page.goto('http://127.0.0.1:1111/mubu-demo', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log('[url]', page.url());
const html = await page.content();
console.log('[html len]', html.length);
console.log('[has mubu-block-wrap in html]', html.includes('mubu-block-wrap'));
console.log('[mubu-block-wrap count]', await page.locator('.mubu-block-wrap').count());
console.log('[data-mubu-renderer count]', await page.locator('[data-mubu-renderer="1"]').count());
console.log('[data-mubu count]', await page.locator('[data-mubu]').count());
console.log('[ProseMirror .mubu-block-wrap]', await page.locator('.ProseMirror .mubu-block-wrap').count());
console.log('[mubu-block-toolbar]', await page.locator('.mubu-block-toolbar').count());
console.log('[has React errors?]', await page.evaluate(() => Array.from(document.querySelectorAll('[data-nextjs-error]')).length));
// 看看是不是被某个 transparent 容器遮住了
const box = await page.locator('.mubu-block-wrap').first().boundingBox().catch(() => null);
console.log('[mubu-block-wrap box]', box);

const blockCount = await page.locator('.mubu-block-wrap').count();
console.log('[mubu-block count]', blockCount);

// 读右栏 markdown
const md = await page.locator('pre').innerText();
console.log('[md contains data-mubu]', md.includes('data-mubu'));
console.log('[md first 500]', md.slice(0, 500));

// 大纲是否渲染出来
const liCount = await page.locator('.mubu-block-body li').count();
console.log('[li count]', liCount);

// 点 + 插入块
const before = blockCount;
await page.getByRole('button', { name: '+ 插入幕布块' }).click();
await page.waitForTimeout(400);
const after = await page.locator('.mubu-block-wrap').count();
console.log('[insert] before/after', before, after);

await page.screenshot({ path: '.shots/mubu-demo.png', fullPage: false });
console.log('[shot] .shots/mubu-demo.png');

await browser.close();