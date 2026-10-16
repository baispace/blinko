#!/usr/bin/env node
/* Ghost-edge 回归：拖一次后，markmap 内残留的 <g> / <line> 必须为 0
 *
 *   node tools/mm-ghost-check.mjs
 *
 * 触发：markmap 模式下做一次"变子级"拖拽（不带 Alt），等待 renderData 收敛，
 * 扫 #mm-mk-r / #mm-mk-l 内 g.markmap-node.__data__.payload.__id 数量 vs
 * mmState 实际节点数，对不上就挂。
 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`console.error: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// 拿根节点的第一个一级分支节点
const srcId = await page.evaluate(() => {
  const g = document.querySelector('#mm-mk-r g[data-mm-depth="2"]');
  return g?.getAttribute('data-mm-id') || null;
});

if (!srcId) {
  console.error('no depth=2 node on right side');
  process.exit(1);
}

// 拿另一个不同的目标 depth=2 节点，做变子级 drop
const tgtId = await page.evaluate((exclude) => {
  const gs = [...document.querySelectorAll('#mm-mk-r g[data-mm-depth="2"]')];
  const g = gs.find(g => g.getAttribute('data-mm-id') !== exclude);
  return g?.getAttribute('data-mm-id') || null;
}, srcId);

if (!tgtId) {
  console.error('no target depth=2 node on right side');
  process.exit(1);
}

console.log('source =', srcId, 'target =', tgtId);

const srcRect = await page.evaluate((id) => {
  const g = document.querySelector(`#mm-mk-r g[data-mm-id="${id}"]`);
  if (!g) return null;
  const fo = g.querySelector('foreignObject > div > div');
  const r = fo.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, srcId);

const tgtRect = await page.evaluate((id) => {
  const g = document.querySelector(`#mm-mk-r g[data-mm-id="${id}"]`);
  if (!g) return null;
  const fo = g.querySelector('foreignObject > div > div');
  const r = fo.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, tgtId);

if (!srcRect || !tgtRect) {
  console.error('rect missing');
  process.exit(1);
}

// 抓抓手：节点右上角小六点
const grip = await page.evaluate((id) => {
  const g = document.querySelector(`#mm-mk-r g[data-mm-id="${id}"]`);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.right - 6, y: r.top + 6 };
}, srcId);

console.log('drag from grip', grip, 'to target', tgtRect);

// 抓握 grip 后做 60px 越过阈值，然后朝目标移动
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.mouse.move(grip.x + 80, grip.y + 10, { steps: 5 });
// 直接移到目标中心触发 child 命中
await page.mouse.move(tgtRect.x, tgtRect.y, { steps: 12 });
await page.waitForTimeout(120);
await page.mouse.up();

// 等 renderData + stampIds 完成
await page.waitForTimeout(900);

// 扫残留：1) 重复 2) data-mm-id 缺失 3) 任何 <line> 不在 markmap-node 内
const ghosts = await page.evaluate(() => {
  /* markmap 双侧模式的合法节点：所有 outline li[id] + 两侧各自的根（__doc__ 镜像侧） */
  const liveIds = new Set();
  document.querySelectorAll('#outline li[data-id]').forEach(li => liveIds.add(li.getAttribute('data-id')));

  const sides = ['r', 'l'];
  const out = {};
  for (const s of sides) {
    const groups = [...document.querySelectorAll(`#mm-mk-${s} g.markmap-node`)];
    const seen = new Set();
    const dup = [];
    const orphan = [];
    for (const g of groups) {
      const id = g.getAttribute('data-mm-id');
      // __doc__ 是两侧都有的虚拟根（mmMkTree 用 snap 做根合成克隆，左那份 visibility:hidden）
      const isVirtualRoot = id === '__doc__';
      if (!id) { orphan.push('(no-id)'); continue; }
      if (!isVirtualRoot && !liveIds.has(id)) { orphan.push(id); continue; }
      if (seen.has(id)) dup.push(id);
      seen.add(id);
    }
    out[s] = {
      total: groups.length,
      dup,
      orphan,
    };
  }
  return out;
});

// 也扫一下 svg 里有没有游荡的 <line> 不在任何 markmap-node 内
const strayLines = await page.evaluate(() => {
  const all = [...document.querySelectorAll('#mm-mk-r svg line, #mm-mk-l svg line')];
  let outside = 0;
  for (const ln of all) {
    if (!ln.closest('g.markmap-node')) outside++;
  }
  return { total: all.length, outsideNodeGroup: outside };
});

console.log('ghosts:', JSON.stringify(ghosts, null, 2));
console.log('strayLines:', strayLines);

let failed = false;
for (const s of ['r', 'l']) {
  if (ghosts[s].dup.length) {
    console.error(`[FAIL] ${s} side has ${ghosts[s].dup.length} duplicate groups:`, ghosts[s].dup);
    failed = true;
  }
  if (ghosts[s].orphan.length) {
    console.error(`[FAIL] ${s} side has ${ghosts[s].orphan.length} orphan groups:`, ghosts[s].orphan);
    failed = true;
  }
}
if (strayLines.outsideNodeGroup > 0) {
  console.error(`[FAIL] ${strayLines.outsideNodeGroup} stray <line> outside any markmap-node`);
  failed = true;
}

if (logs.length) {
  console.error('console/pageerror:');
  for (const l of logs) console.error(' ', l);
}

await browser.close();

if (failed) process.exit(1);
console.log('OK · drag-once 渲染 · 没有 ghost edge 残留');