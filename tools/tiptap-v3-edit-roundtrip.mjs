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
  if (m.type() === 'error' && !m.text().includes('validateDOMNesting') && !m.text().includes('Element with ID') && !m.text().includes('Outdated') && !m.text().includes('404')) {
    console.log('[console.error]', m.text().slice(0, 200));
  }
});

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'domcontentloaded' });
await page.evaluate(({ token, user }) => {
  localStorage.setItem('blinkoToken', JSON.stringify({ user, token }));
}, { token, user });

await page.goto('http://127.0.0.1:1111/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 创建一条测试笔记
const initialContent = `# v3 edit test\n\n- one\n- two\n`;
const createRes = await page.evaluate(async ({ token, content }) => {
  const res = await fetch('/api/trpc/notes.upsert?batch=1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}` },
    body: JSON.stringify({ '0': { json: { content, type: 1 } } })
  });
  return await res.json();
}, { token, content: initialContent });
const noteId = createRes?.[0]?.result?.data?.json?.id;
console.log('[created note id]', noteId);

// 打开详情页
await page.goto(`http://127.0.0.1:1111/detail?id=${noteId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

// 切到编辑态：通常点 ProseMirror 内部或顶栏铅笔按钮
await page.locator('.ProseMirror').first().click({ position: { x: 100, y: 50 } });
await page.waitForTimeout(500);

// 看看是否进入可编辑态
const beforeEditable = await page.locator('.ProseMirror').first().getAttribute('contenteditable');
console.log('[before editable]', beforeEditable);

// 全选 → 删除 → 输入新内容
await page.locator('.ProseMirror').first().press('Control+a');
await page.waitForTimeout(200);
await page.locator('.ProseMirror').first().press('Delete');
await page.waitForTimeout(200);
await page.locator('.ProseMirror').first().type('edited via Tiptap v3 - bold and link', { delay: 50 });
await page.waitForTimeout(2000); // 等 autosave (800ms)

const newContent = await page.locator('.ProseMirror').first().innerText();
console.log('[editor content after edit]', newContent.slice(0, 100));

// 读 DB 看 autosave 是否落库
const afterEditRes = await page.evaluate(async ({ token, noteId }) => {
  const res = await fetch(`/api/trpc/notes.get?id=${noteId}`, {
    headers: { 'authorization': `Bearer ${token}` }
  });
  return await res.json();
}, { token, noteId });
const dbContent = afterEditRes?.result?.data?.json?.content;
console.log('[DB content after autosave]', JSON.stringify(dbContent).slice(0, 200));
console.log('[DB has "edited via Tiptap v3"]', dbContent?.includes('edited via Tiptap v3'));

// 重新打开看是否一致
await page.goto(`http://127.0.0.1:1111/detail?id=${noteId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
const reloadedText = await page.locator('.ProseMirror').first().innerText();
console.log('[reloaded editor content]', reloadedText.slice(0, 100));
console.log('[reloaded has "edited via Tiptap v3"]', reloadedText.includes('edited via Tiptap v3'));

await page.screenshot({ path: '.shots/tiptap-v3-edit-roundtrip.png', fullPage: false });

await browser.close();