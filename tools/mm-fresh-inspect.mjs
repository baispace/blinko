#!/usr/bin/env node
/* 看 fresh load 后 markmap 内部到底有什么 svg 元素 + 拖一次后对比 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await ctx.route('**/*', (route) => {
  const headers = { ...route.request().headers(), 'cache-control': 'no-cache' };
  route.continue({ headers });
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const inspect = (label) => page.evaluate((label) => {
  const out = { label };
  for (const side of ['r', 'l']) {
    const root = document.getElementById(`mm-mk-${side}`);
    if (!root) { out[side] = 'no root'; continue; }
    out[side] = {
      rootTag: root.tagName,
      childCount: root.children.length,
      gMarkmapCount: root.querySelectorAll('g.markmap-node').length,
      lines: root.querySelectorAll('line').length,
      paths: root.querySelectorAll('path').length,
      circles: root.querySelectorAll('circle').length,
    };
  }
  return out;
}, label);

console.log('--- BEFORE DRAG ---');
console.log(JSON.stringify(await inspect('before'), null, 2));

// 触发一次拖动 t4 → t5（depth=2 → depth=2 子级）
// 直接在节点中心按下，确保命中 foreignObject 的 text div（不是 grip）
const startPt = await page.evaluate(() => {
  const g = document.querySelector('#mm-mk-r g[data-mm-depth="2"]');
  const fo = g.querySelector('foreignObject > div > div');
  const r = fo.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
const dropPt = await page.evaluate(() => {
  const gs = [...document.querySelectorAll('#mm-mk-r g[data-mm-depth="2"]')];
  const g = gs[1];
  const fo = g.querySelector('foreignObject > div > div');
  const r = fo.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
console.log(`drag from node center ${JSON.stringify(startPt)} → target center ${JSON.stringify(dropPt)}`);

await page.mouse.move(startPt.x, startPt.y);
await page.mouse.down();
// 先在原地停 100ms 让 mousedown handler 跑完
await page.waitForTimeout(80);
// 然后向目标移动（越过 5px 阈值后会进拖拽）
await page.mouse.move(startPt.x + 50, startPt.y, { steps: 6 });
await page.waitForTimeout(120);
await page.mouse.move(dropPt.x, dropPt.y, { steps: 16 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(1500);

console.log('--- AFTER DRAG ---');
console.log(JSON.stringify(await inspect('after'), null, 2));

// 看 mm-drag-line 的状态
const overlayState = await page.evaluate(() => {
  const svg = document.getElementById('mm-drag-line');
  const path = document.getElementById('mm-drag-line-path');
  return {
    svgExists: !!svg,
    svgHidden: svg?.hidden,
    svgDisplay: svg ? getComputedStyle(svg).display : null,
    svgOpacity: svg ? getComputedStyle(svg).opacity : null,
    pathD: path?.getAttribute('d'),
    pathStroke: path?.getAttribute('stroke'),
  };
});
console.log('--- OVERLAY ---');
console.log(JSON.stringify(overlayState, null, 2));

await browser.close();