#!/usr/bin/env node
/* 实地抓证：拖一次后，markmap 内部到底还剩什么 <line> / <g>
 * 输出每个 line 的两端坐标和"指向的 payload.__id"，对不上的就是 ghost。 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  bypassCSP: true,
});
const page = await ctx.newPage();
// 强制禁用缓存
await ctx.route('**/*', (route) => {
  const headers = { ...route.request().headers(), 'cache-control': 'no-cache' };
  route.continue({ headers });
});

const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// 拍照：初始
await page.screenshot({ path: '.shots/19a-初始.png' });

// 抓任意深度最深的一个 leaf 当源（拖深度大的更能暴露幽灵边）
const before = await page.evaluate(() => {
  const all = [...document.querySelectorAll('#mm-mk-r g.markmap-node[data-mm-id]')]
    .filter(g => g.querySelector('foreignObject > div > div').textContent.length > 0);
  // 排序：优先 depth >= 3
  all.sort((a, b) => {
    const da = Number(a.getAttribute('data-mm-depth'));
    const db = Number(b.getAttribute('data-mm-depth'));
    return db - da;  // 深的在前
  });
  // 取第一个 depth>=3
  const leaf = all.find(g => Number(g.getAttribute('data-mm-depth')) >= 3);
  const gs2 = [...document.querySelectorAll('#mm-mk-r g[data-mm-depth="2"]')];
  return {
    leaf: leaf ? (() => {
      const r = leaf.getBoundingClientRect();
      const fo = leaf.querySelector('foreignObject > div > div').getBoundingClientRect();
      return {
        id: leaf.getAttribute('data-mm-id'),
        depth: leaf.getAttribute('data-mm-depth'),
        gRect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        foRect: { left: fo.left, top: fo.top, right: fo.right, bottom: fo.bottom },
      };
    })() : null,
    targets: gs2.slice(0, 3).map(g => {
      const r = g.getBoundingClientRect();
      const fo = g.querySelector('foreignObject > div > div').getBoundingClientRect();
      return {
        id: g.getAttribute('data-mm-id'),
        foRect: { left: fo.left, top: fo.top, right: fo.right, bottom: fo.bottom },
      };
    }),
  };
});

console.log('Before drag:');
console.log('  leaf:', JSON.stringify(before.leaf));
console.log('  targets:', JSON.stringify(before.targets));

if (!before.leaf || before.targets.length < 1) {
  console.error('No leaf or targets');
  process.exit(1);
}

const src = before.leaf;
const tgt = before.targets[0];

const grip = { x: src.gRect.right - 6, y: src.gRect.top + 6 };
const drop = { x: tgt.foRect.left + (tgt.foRect.right - tgt.foRect.left) / 2, y: tgt.foRect.top + (tgt.foRect.bottom - tgt.foRect.top) / 2 };

console.log(`Dragging ${src.id} from grip ${JSON.stringify(grip)} to ${tgt.id} center ${JSON.stringify(drop)}`);

// 触发拖动
console.log('Drag starting...');
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.waitForTimeout(100);
// 检查 mmDrags 状态
const dragStateBefore = await page.evaluate(() => {
  return {
    isDragging: window.mmStore?.isDragging,
    sourceId: window.mmDrags?.sourceId,
  };
}).catch(() => null);
console.log('  drag state after first down:', JSON.stringify(dragStateBefore));

await page.mouse.move(grip.x + 100, grip.y + 30, { steps: 8 });
await page.waitForTimeout(150);
// 拍照：拖拽中
await page.screenshot({ path: '.shots/19b-拖拽中.png' });

const dragStateMid = await page.evaluate(() => ({
  isDragging: window.mmStore?.isDragging,
  sourceId: window.mmDrags?.sourceId,
  hitType: window.mmDrags?.hitType,
  x: window.mmDrags?.x,
  y: window.mmDrags?.y,
})).catch(() => null);
console.log('  drag state mid-move:', JSON.stringify(dragStateMid));

await page.mouse.move(drop.x, drop.y, { steps: 16 });
await page.waitForTimeout(200);

const dragStateEnd = await page.evaluate(() => ({
  isDragging: window.mmStore?.isDragging,
  sourceId: window.mmDrags?.sourceId,
  hitType: window.mmDrags?.hitType,
  x: window.mmDrags?.x,
  y: window.mmDrags?.y,
})).catch(() => null);
console.log('  drag state before up:', JSON.stringify(dragStateEnd));

await page.mouse.up();
await page.waitForTimeout(1200);

// 拍照：拖拽后
await page.screenshot({ path: '.shots/19c-拖拽后.png' });

// 收集每个 <line> 的端点 + 所属 group 的 __id
const lines = await page.evaluate(() => {
  const all = [...document.querySelectorAll('#mm-mk-r svg line, #mm-mk-r svg path')];
  return all.map((ln, i) => {
    const parentG = ln.closest('g.markmap-node');
    const parentId = parentG?.getAttribute('data-mm-id') || null;
    const tag = ln.tagName;
    const x1 = ln.getAttribute('x1') || ln.getAttribute('d')?.match(/^M\s*([-\d.]+)/)?.[1];
    const y1 = ln.getAttribute('y1') || ln.getAttribute('d')?.match(/^M\s*[-\d.]+\s*,\s*([-\d.]+)/)?.[1];
    const x2 = ln.getAttribute('x2') || ln.getAttribute('d')?.match(/^M[^C]*\s*([-\d.]+)\s*,?\s*([-\d.]+)?$/)?.[1];
    const y2 = ln.getAttribute('y2') || ln.getAttribute('d')?.match(/L\s*([-\d.]+)\s*,\s*([-\d.]+)/)?.[2];
    const stroke = ln.getAttribute('stroke');
    const cls = ln.getAttribute('class') || '';
    const bb = ln.getBoundingClientRect();
    return {
      i, tag, parentId, x1, y1, x2, y2, stroke, cls,
      screenRect: { left: Math.round(bb.left), top: Math.round(bb.top), right: Math.round(bb.right), bottom: Math.round(bb.bottom) },
    };
  });
});

console.log('Lines/paths inside #mm-mk-r after drop:');
for (const ln of lines) console.log(' ', JSON.stringify(ln));

// 还要看 markmap 自己的 __data__ 里 state.rect.x/y/w/h
const dataRects = await page.evaluate(() => {
  const gs = [...document.querySelectorAll('#mm-mk-r g.markmap-node')];
  return gs.map(g => {
    const id = g.getAttribute('data-mm-id');
    const d = g.__data__;
    const r = d?.state?.rect;
    return {
        id,
        stateKey: d?.state?.key,
        depth: d?.state?.depth,
        rect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        // 还要看 SVG 实际 transform
        transform: g.getAttribute('transform'),
      };
  });
});
console.log('Group state rects (right side):');
for (const d of dataRects) console.log(' ', JSON.stringify(d));

// 算每个 <line> 是否"指向"当前实际节点位置
// 注意 markmap 的 line 是在每个 child <g> 内画的，从 child 的 (x, y) 到 parent 的 (x, y)
// rect.x 是 layout 后的实际屏幕坐标（经过 transform 后）

// 关键检查：所有 line 的两端 y 是否都在某个 live node 的 rect 范围内？
const orphans = lines.filter(ln => {
  // line 的父 <g> 是 child；line 的另一端应该指向 parent
  // 简化判断：如果 line.parentId 是 __doc__ 或者不在 dataRects 里，就是 orphan
  return !dataRects.some(d => d.id === ln.parentId);
});
console.log(`Lines whose parentId not in live groups: ${orphans.length}`);
for (const ln of orphans) console.log(' orphan:', JSON.stringify(ln));

// 检查 line 数量与 child 数量（每个非根节点应有 1 条 line）
const nonRootGroups = dataRects.filter(d => d.depth !== 1);
console.log(`Non-root groups: ${nonRootGroups.length}, total <line>/<path>: ${lines.length}`);

// 看 svg 里有没有游离的 line / path（不在任何 markmap-node 内）
const stray = await page.evaluate(() => {
  const all = [...document.querySelectorAll('#mm-mk-r svg line, #mm-mk-r svg path')];
  return all.filter(ln => !ln.closest('g.markmap-node')).map(ln => ({
    tag: ln.tagName,
    parent: ln.parentElement?.tagName,
    d: ln.getAttribute('d'),
  }));
});
console.log(`Stray lines/paths (not inside any markmap-node): ${stray.length}`);
for (const s of stray) console.log(' stray:', JSON.stringify(s));

// 看 svg 自身的子元素一览 — 两边都看
const svgStructure = await page.evaluate(() => {
  function walk(el, depth) {
    const arr = [];
    arr.push({ depth, tag: el.tagName, cls: el.getAttribute('class') || '' });
    for (const c of el.children) arr.push(...walk(c, depth + 1));
    return arr;
  }
  const out = {};
  for (const side of ['r', 'l']) {
    const svg = document.querySelector(`#mm-mk-${side} svg`);
    if (!svg) { out[side] = null; continue; }
    out[side] = walk(svg, 0).filter(n =>
      n.tag === 'g' || n.tag === 'line' || n.tag === 'path' || n.tag === 'svg' || n.tag === 'circle'
    );
  }
  return out;
});

for (const side of ['r', 'l']) {
  console.log(`#mm-mk-${side} structure (top 60):`);
  if (!svgStructure[side]) { console.log('  no svg'); continue; }
  for (const n of svgStructure[side].slice(0, 60)) console.log('  '.repeat(n.depth), n.tag, n.cls);
}

console.log('\nlogs:');
for (const l of logs) console.log(' ', l);

await browser.close();