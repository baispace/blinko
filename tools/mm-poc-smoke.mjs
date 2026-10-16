#!/usr/bin/env node
/* Smoke test: 登录 Blinko dev server，访问 /mindmap-poc，截图 + 检查 markmap 是否真的渲染 */
import { chromium } from 'playwright';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic3VwZXJhZG1pbiIsIm5hbWUiOiJhZG1pbiIsInN1YiI6IjEiLCJleHAiOjQ5NDU0MDk0MDgsImlhdCI6MTc5MTgwOTQwOH0.EpP1UXiBFb2z03AZSbFNKA6JyvNywW0faGphibAVk3A';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const logs = [];
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message + '\n' + (e.stack || '').slice(0, 800)));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('favicon') && !m.text().includes('validateDOMNesting')) logs.push(`console.error: ${m.text()}`);
  if (m.text().includes('mm-poc')) logs.push(`console.log: ${m.text()}`);
});

await page.goto('http://127.0.0.1:1111/signin', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

// 清掉旧 mm-mindmap-poc:*（避免持久化的脏数据） + 注入 token
await page.evaluate((tok) => {
  ['mm-mindmap-poc:tree', 'mm-mindmap-poc:theme', 'mm-mindmap-poc:zoom', 'mm-mindmap-poc:history'].forEach(k => localStorage.removeItem(k));
  const data = {
    user: { id: 1, name: 'admin', nickname: 'admin', role: 'superadmin', image: '', loginType: '' },
    token: tok,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    requiresTwoFactor: false,
  };
  localStorage.setItem('blinkoToken', JSON.stringify(data));
}, TOKEN);

await page.goto('http://127.0.0.1:1111/mindmap-poc', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// 检查 + dump tree
const checks = await page.evaluate(() => {
  const ls = localStorage.getItem('mm-mindmap-poc:tree');
  const tree = ls ? JSON.parse(ls) : null;
  const dump = (nodes, path = '') => {
    const bad = [];
    for (const n of nodes || []) {
      if (typeof n.content !== 'string') bad.push({ path: path + '/' + n.id, content: n.content, type: typeof n.content });
      if (n.children) bad.push(...dump(n.children, path + '/' + n.id));
    }
    return bad;
  };
  const wrap = document.querySelector('.mm-mindmap-wrap');
  const svg = document.querySelector('svg.markmap-svg');
  const pane = document.querySelector('.mm-poc-pane-right');
  return {
    url: location.pathname,
    hasMindmapWrap: !!wrap,
    hasOutline: !!document.querySelector('.mm-outline-body'),
    hasTopbar: !!document.querySelector('.mm-poc-topbar'),
    markmapSvg: !!svg,
    topbarButtons: [...document.querySelectorAll('.mm-poc-btn')].map(b => b.textContent.trim()).slice(0, 4),
    markmapNodeCount: document.querySelectorAll('g.markmap-node').length,
    outlineListItems: document.querySelectorAll('.mm-outline-body li[data-id]').length,
    theme: document.body.dataset.mmTheme,
    badContent: tree ? dump(tree) : 'no tree in ls',
    svgInnerPreview: svg ? svg.innerHTML.slice(0, 300) : null,
    svgViewBox: svg?.getAttribute('viewBox'),
  };
});
console.log(JSON.stringify(checks, null, 2));

await page.screenshot({ path: '.shots/poc-01-loaded.png' });

// 切到 dark
await page.selectOption('[data-testid="mm-poc-theme"]', 'dark');
await page.waitForTimeout(400);
await page.screenshot({ path: '.shots/poc-02-dark.png' });

console.log('\nlogs:');
for (const l of logs) console.log(' ', l);

await browser.close();