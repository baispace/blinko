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
const token = tokenJson.token;
const user = tokenJson.user;

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 200)));
page.on('console', m => {
  if (m.type() === 'error' && !m.text().includes('validateDOMNesting') && !m.text().includes('Element with ID') && !m.text().includes('Outdated')) {
    console.log('[console.error]', m.text().slice(0, 200));
  }
});

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'domcontentloaded' });
await page.evaluate(({ token, user }) => {
  localStorage.setItem('blinkoToken', JSON.stringify({ user, token }));
  // 也写 cookie（httpOnly 的话写不了，但 tRPC 可能走 cookie）
  document.cookie = `blinkoToken=${token}; path=/`;
}, { token, user });

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 直接用 tRPC 创建一个 test note
const createRes = await page.evaluate(async ({ token }) => {
  const res = await fetch('/api/trpc/notes.upsert?batch=1', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      '0': { json: { content: '# Tiptap v3 round-trip test\n\n- item A\n- item B\n  - nested B1', type: 1 } }
    })
  });
  return await res.json();
}, { token });
console.log('[create res]', JSON.stringify(createRes).slice(0, 300));
const noteId = createRes?.[0]?.result?.data?.json?.id ?? createRes?.[0]?.result?.data?.id ?? createRes?.result?.data?.id;
console.log('[note id]', noteId);

// 直接打开 detail 路由
await page.goto(`http://127.0.0.1:1111/detail?id=${noteId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 详情页有 ProseMirror？应该是只读态
const proseMirrorCount = await page.locator('.ProseMirror').count();
console.log('[detail ProseMirror count]', proseMirrorCount);

// 编辑器里有没有内容
const pmText = await page.locator('.ProseMirror').first().innerText().catch(() => '');
console.log('[detail text contains "round-trip"]', pmText.includes('round-trip'));
console.log('[detail text contains "item A"]', pmText.includes('item A'));
console.log('[detail text first 200]', pmText.slice(0, 200));

// 尝试切换到编辑态——双击或点铅笔图标
await page.screenshot({ path: '.shots/tiptap-v3-detail.png', fullPage: false });

// 通过 API 读回来确认 DB 内容
const noteReadRes = await page.evaluate(async ({ token, noteId }) => {
  const res = await fetch(`/api/trpc/notes.get?id=${noteId}`, {
    headers: { 'x-token': token }
  });
  return await res.json();
}, { token, noteId });
const storedContent = noteReadRes?.result?.data?.json?.content ?? noteReadRes?.result?.data?.content;
console.log('[DB content first 200]', storedContent?.slice(0, 200));
console.log('[DB content matches input]', storedContent === '# Tiptap v3 round-trip test\n\n- item A\n- item B\n  - nested B1');

await browser.close();