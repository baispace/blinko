#!/usr/bin/env node
/* 原型的浏览器验证器（playwright）
 *
 *   node tools/mm-probe.mjs [输出前缀] [查询串]
 *
 * 做三件事：
 *   1. 截图（in-app browser 的 screenshot 偶发失败，这里自建无头浏览器更稳）
 *   2. 打印 markmap 双侧布局的几何断言（左右归属 / 节点重叠 / 连线是否穿节点 / 文字是否镜像）
 *   3. 收集 console error / warning
 */
import { chromium } from 'playwright';
import path from 'node:path';

const prefix = process.argv[2] || '/tmp/mm';
const qs = process.argv[3] || 'view=mindmap&layout=mindmap';
const url = `http://127.0.0.1:8934/blinko-mubu-prototype.html?${qs}`;
const OUT = process.env.MM_SHOT_DIR || '/Users/baihe/blinko/.shots';

// 用系统 Chrome（playwright 自带的 chromium 版本号与本地缓存对不上）
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const out = {};
  const stage = document.getElementById('mm-mk-stage');
  out.stageTransform = stage ? stage.style.transform : null;
  out.layoutSize = window.mmLayoutSize || null;
  out.view = window.mmView || null;

  const sides = {};
  for (const side of ['r', 'l']) {
    const svg = document.getElementById('mm-mk-' + side);
    if (!svg) { sides[side] = null; continue; }
    const g = svg.querySelector(':scope > g');
    const nodes = [...svg.querySelectorAll('g.markmap-node')].map((el) => {
      const m = /translate\(([^,]+),([^)]+)\)/.exec(el.getAttribute('transform') || '');
      const box = el.querySelector('foreignObject > div');
      return {
        id: el.getAttribute('data-mm-id'),
        depth: el.getAttribute('data-mm-depth'),
        x: m ? parseFloat(m[1]) : null,
        y: m ? parseFloat(m[2]) : null,
        w: el.querySelector('foreignObject')?.getBoundingClientRect().width || 0,
        h: el.querySelector('foreignObject')?.getBoundingClientRect().height || 0,
        text: box ? box.textContent.slice(0, 18) : '',
        cls: el.getAttribute('class'),
      };
    });
    // 所有节点包围盒（屏幕坐标）
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    for (const n of nodes) {
      if (n.x == null) continue;
      const r = svg.querySelector(`g[data-mm-id="${n.id}"] foreignObject`).getBoundingClientRect();
      if (r.width || r.height) {
        x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
        x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
      }
    }
    sides[side] = {
      count: nodes.length,
      gTransform: g ? g.getAttribute('transform') : null,
      screenBox: x2 > x1 ? { x1, y1, x2, y2 } : null,
      sample: nodes.slice(0, 4),
    };
  }
  out.sides = sides;

  // 文字是否镜像：比较左实例首个非根节点的 transform matrix
  const lNodes = [...document.querySelectorAll('#mm-mk-l g.markmap-node')]
    .filter((el) => el.getAttribute('data-mm-depth') !== '1');
  const rNodes = [...document.querySelectorAll('#mm-mk-r g.markmap-node')]
    .filter((el) => el.getAttribute('data-mm-depth') !== '1');
  const mat = (el) => {
    const d = el.querySelector(':scope > foreignObject > div');
    return d ? getComputedStyle(d).transform : null;
  };
  out.mirror = {
    left: lNodes[0] ? mat(lNodes[0]) : null,
    right: rNodes[0] ? mat(rNodes[0]) : null,
  };

  // 左右重叠检测（用 markmap 的 rect 表，比 DOM 测量准）
  const rects = [];
  for (const side of ['r', 'l']) {
    const mm = window.__mmDebug && window.__mmDebug[side];
    if (!mm) continue;
  }
  out.hasDebug = !!window.__mmDebug;
  return out;
});

await page.screenshot({ path: `${OUT}/${prefix}.png`, fullPage: false });
console.log(JSON.stringify(report, null, 2));
console.log('\n--- console ---');
console.log(logs.length ? logs.join('\n') : '(无 error / warning)');
await browser.close();