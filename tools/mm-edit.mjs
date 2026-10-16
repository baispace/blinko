#!/usr/bin/env node
/* markmap 模式的「编辑能力」回归：键盘全链路 + 拖拽改层级
 *
 *   node tools/mm-edit.mjs
 *
 * 背景：markmap 模式下原本只有双击编辑能用，↑↓←→ / Enter / F2 / Alt+←→ 全断
 *      —— 因为它们都查 mmModel，而 mmModel 只在内置引擎分支里填充。
 *      这套用 mmTree（纯树模型）+ mmModelOf() 统一入口修掉了。
 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const results = [];
const logs = [];
const ok = (n, pass, info = '') => { const mark = pass ? '\u2705' : '\u274c';
  console.log(`   ${mark} ${n}${info ? '  — ' + info : ''}`);
  results.push({ n, pass, info }); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
/* 每条断言落一行，方便卡住时定位到具体哪一步 */
const mark = (s) => console.log(`   … ${s}`);
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
/* 默认 30s 太长：一条断言失败会拖住整轮，直接把失败暴露出来 */
page.setDefaultTimeout(8000);

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2400);

const selId = () => page.evaluate(() => mmSelectedId);
const treeSize = () => page.evaluate(() => mmTree.size);
const outlineCount = () => page.locator('#outline .topic').count();
const clickNode = async (sel) => {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(250);
};

mark('§1');
/* ---------- 1. 树模型存在（之前 markmap 模式下 mmModel 是空的） ---------- */
const ts = await treeSize();
ok('markmap 模式有树模型', ts > 40, `${ts} 个节点`);
ok('mmModelOf 能取到模型', await page.evaluate(() => !!mmModelOf('t1')), 't1');

mark('§2');
/* ---------- 2. 点击选中 + 键盘导航 ---------- */
await clickNode('#mm-mk-stage g[data-mm-id="t4"] foreignObject > div > div');
ok('点击选中', (await selId()) === 't4', String(await selId()));

await page.keyboard.press('ArrowDown');
const afterDown = await selId();
ok('↓ 往下选兄弟/下级', afterDown !== 't4', `${afterDown}`);
await page.keyboard.press('ArrowUp');
ok('↑ 回到原位', (await selId()) === 't4', String(await selId()));

/* ArrowRight 要挑一个真·父节点来测（叶子节点本来就没子级可进） */
const parentId = await page.evaluate(() => {
  const e = Array.from(mmTree.entries()).find(([, m]) => m.depth === 2 && m.childIds.length);
  return e ? e[0] : null;
});
await clickNode(`#mm-mk-stage g[data-mm-id="${parentId}"] foreignObject > div > div`);
await page.keyboard.press('ArrowRight');
const right = await selId();
const rightChild = await page.evaluate((id) => (mmTree.get(id) || {}).childIds, parentId);
ok('→ 进入子级（或先展开折叠节点）', rightChild.includes(right), `${parentId} → ${right}（子级 ${rightChild}）`);
await page.keyboard.press('ArrowLeft');
ok('← 回到父级', (await selId()) === parentId, String(await selId()));
await clickNode('#mm-mk-stage g[data-mm-id="t4"] foreignObject > div > div');
await page.keyboard.press('Home');
ok('Home 回到第一个节点（中心主题）', (await selId()) === '__doc__', String(await selId()));

mark('§3');
/* ---------- 3. F2 / 双击进入编辑 ---------- */
await clickNode('#mm-mk-stage g[data-mm-id="t9"] foreignObject > div > div');
await page.keyboard.press('F2');
await page.waitForTimeout(400);
ok('F2 进入编辑态', await page.locator('#mm-mk-stage [contenteditable="true"]').count() === 1);
await page.keyboard.type('粗排改');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
ok('F2 编辑回写大纲',
  (await page.locator(`#outline li[data-id="t9"] .topic-content`).innerText()).includes('粗排改'));

mark('§4');
/* ---------- 4. Enter 新建同级 ---------- */
const n0 = await outlineCount();
await clickNode('#mm-mk-stage g[data-mm-id="t10"] foreignObject > div > div');
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
ok('Enter 新建同级（并进入编辑）', await outlineCount() === n0 + 1, `${n0} → ${await outlineCount()}`);
ok('Enter 后进入编辑态', await page.locator('#mm-mk-stage [contenteditable="true"]').count() === 1);
await page.keyboard.type('新同级');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const newId = await selId();
ok('新同级写入大纲',
  (await page.locator(`#outline li[data-id="${newId}"] .topic-content`).innerText()).includes('新同级'), newId);

mark('§5');
/* ---------- 5. Alt+←→ 提级 / 降级 ---------- */
const depthBefore = await page.evaluate((id) => parseInt(mmTree.get(id).depth, 10), newId);
if (depthBefore >= 2) {
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(900);
  const depthOut = await page.evaluate((id) => parseInt(mmTree.get(id).depth, 10), newId);
  ok('Alt+← 提一级', depthOut === depthBefore - 1, `${depthBefore} → ${depthOut}`);
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(900);
  const depthIn = await page.evaluate((id) => parseInt(mmTree.get(id).depth, 10), newId);
  ok('Alt+→ 降一级', depthIn === depthOut + 1, `${depthOut} → ${depthIn}`);
} else {
  /* 新建同级落在深度 1，提级本就该是 no-op —— 先降一级再提，才测得到真逻辑 */
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(900);
  const d2 = await page.evaluate((id) => parseInt(mmTree.get(id).depth, 10), newId);
  ok('Alt+→ 降一级', d2 === depthBefore + 1, `${depthBefore} → ${d2}`);
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Alt');
  await page.waitForTimeout(900);
  const d3 = await page.evaluate((id) => parseInt(mmTree.get(id).depth, 10), newId);
  ok('Alt+← 提一级', d3 === d2 - 1, `${d2} → ${d3}`);
}

mark('§6');
/* ---------- 6. Delete ---------- */
const n1 = await outlineCount();
await page.keyboard.press('Delete');
await page.waitForTimeout(900);
ok('Delete 删除选中节点', await outlineCount() === n1 - 1, `${n1} → ${await outlineCount()}`);

mark('§7');
/* ---------- 7. 拖拽：改成别的父的子级 ---------- */
await page.evaluate(() => { window.__d = null; });
/* 找一个叶子节点，拖到另一条分支的节点外侧 → 应成为它的子级 */
const before = await page.evaluate(() => {
  const snap = Array.from(mmTree.entries()).filter(([, m]) => !m.hasChildren && m.depth === 2);
  const src = snap[0][0];
  /* 目标：另一个一级分支（有子节点的） */
  const t = Array.from(mmTree.entries()).find(([, m]) => m.depth === 2 && m.hasChildren && m.id !== src);
  return { src, target: t ? t[0] : null, srcParent: mmTree.get(src).parentId };
});
ok('找到可拖拽的测试节点', !!before.src && !!before.target, JSON.stringify(before));

const dragTo = async (dragSel, tx, ty) => {
  const b = await page.locator(dragSel).first().boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 2 + 10, { steps: 4 });
  await page.mouse.move(tx, ty, { steps: 12 });
  await page.waitForTimeout(250);
  const indicator = await page.locator('.mm-drag-bar:not([hidden])').count();
  const ghost = await page.locator('.mm-drag-ghost').count();
  await page.mouse.up();
  await page.waitForTimeout(1400);
  console.log(`   … drop→${tx},${ty} indicator=${indicator}`);
  return { indicator, ghost };
};

/* 压在目标节点上（盒子正中间）→ 变成它的子级 */
const tb = await page.locator(`#mm-mk-stage g[data-mm-id="${before.target}"] foreignObject`).first().boundingBox();
const r1 = await dragTo(`#mm-mk-stage g[data-mm-id="${before.src}"] foreignObject > div > div`,
  tb.x + tb.width / 2, tb.y + tb.height / 2);
ok('拖拽时出现落点指示', r1.indicator === 1, `indicator=${r1.indicator} ghost=${r1.ghost}`);
ok('拖拽时有跟手幽灵节点', r1.ghost === 1, `ghost=${r1.ghost}`);
const newParent = await page.evaluate((id) => mmTree.get(id).parentId, before.src);
ok('拖拽后改了父节点', newParent === before.target, `${before.srcParent} → ${newParent}`);
ok('新父节点自动展开', await page.evaluate((id) => document.querySelector(`#outline li[data-id="${id}"]`).dataset.state === 'open', before.target));
ok('落点后 DOM 深度正确', await page.evaluate((id) => {
  const li = document.querySelector(`#outline li[data-id="${id}"]`);
  const p = document.querySelector(`#outline li[data-id="${mmTree.get(id).parentId}"]`);
  return parseInt(li.dataset.depth, 10) === parseInt(p.dataset.depth, 10) + 1;
}, before.src));

mark('§8');
/* ---------- 8. 拖拽：改成兄弟并调整顺序 ---------- */
const orderBefore = await page.evaluate((id) => {
  const kids = Array.from(document.querySelectorAll('#outline > .topic')).map((li) => li.dataset.id);
  return kids.indexOf(id);
}, before.src);
ok('§8 前置：节点此刻挂在 t1-1 底下（不在一级）', orderBefore === -1, `index=${orderBefore}`);

const sibs = await page.evaluate(() => Array.from(document.querySelectorAll('#outline > .topic')).map((li) => li.dataset.id));
const other = sibs.find((x) => x !== before.src);
const ob = await page.locator(`#mm-mk-stage g[data-mm-id="${other}"] foreignObject`).first().boundingBox();
const r2 = await dragTo(`#mm-mk-stage g[data-mm-id="${before.src}"] foreignObject > div > div`,
  ob.x + ob.width / 2, ob.y + ob.height + 6);   /* 盒子正下方的空档 → 变兄弟 */
const orderAfter = await page.evaluate((id) => {
  const kids = Array.from(document.querySelectorAll('#outline > .topic')).map((li) => li.dataset.id);
  return kids.indexOf(id);
}, before.src);
ok('拖到空档 → 升回一级并成为它的兄弟', orderAfter >= 0, `${orderBefore} → ${orderAfter}`);
ok('兄弟顺序真的变了', orderAfter !== orderBefore, `${orderBefore} → ${orderAfter}`);
ok('树模型与 DOM 一致', await page.evaluate((id) => {
  const m = mmTree.get(id);
  const sibIds = Array.from(document.querySelectorAll('#outline > .topic')).map((li) => li.dataset.id);
  return m && m.parentId === '__doc__' && sibIds.includes(id);
}, before.src));

mark('§9');
/* ---------- 9. 不能拖进自己的子树 ---------- */
const cycle = await page.evaluate(() => {
  const p = Array.from(mmTree.entries()).find(([, m]) => m.depth === 2 && m.hasChildren);
  if (!p) return 'skip';
  const [pid] = p;
  return pid;
});
if (cycle !== 'skip') {
  const cb = await page.locator(`#mm-mk-stage g[data-mm-id="${cycle}"] foreignObject`).first().boundingBox();
  const kids = await page.evaluate((id) => mmTree.get(id).childIds, cycle);
  const kb = await page.locator(`#mm-mk-stage g[data-mm-id="${kids[0]}"] foreignObject`).first().boundingBox();
  const structBefore = await page.evaluate((id) => JSON.stringify(mmTree.get(id).childIds), cycle);
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 20, cb.y + cb.height / 2 + 10, { steps: 4 });
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2, { steps: 14 });   /* 压在自己的孩子身上 */
  await page.waitForTimeout(250);
  /* 自己的子树已经被排除在命中集合之外，所以连落点指示都不该出现 ——
     出现「看着能放其实放不了」比直接不放更糟 */
  const barOnSelf = await page.locator('.mm-drag-bar:not([hidden])').count();
  await page.mouse.up();
  await page.waitForTimeout(1200);
  const structAfter = await page.evaluate((id) => JSON.stringify(mmTree.get(id).childIds), cycle);
  ok('不能把父节点拖进自己的子树（连落点都不给）', barOnSelf === 0 && structBefore === structAfter,
    `${cycle} · 指示=${barOnSelf} 结构${structBefore === structAfter ? '完好' : '被改坏'}`);
} else ok('不能把父节点拖进自己的子树（连落点都不给）', true, '无可测样本');

mark('§10');
/* ---------- 10. 内置引擎已下线（2026-10-12 决策：逻辑图 / 括号图整体砍掉）。
 * 验证：调用 mmApplyLayout('logic') 后应当静默退回 mindmap，markmap 节点仍正常渲染。 */
await page.evaluate(() => window.mmApplyLayout('logic'));
await page.waitForTimeout(600);
const afterBuiltinDown = await page.evaluate(() => ({
  bodyLayout: document.body.dataset.mmLayout,
  stored: localStorage.getItem('mm-layout'),
  mkStageDisplay: getComputedStyle(document.getElementById('mm-mk-stage')).display,
}));
ok('内置引擎下线：mmApplyLayout(logic) 退回 mindmap', afterBuiltinDown.bodyLayout === 'mindmap',
  `body.dataset.mmLayout=${afterBuiltinDown.bodyLayout}`);
ok('内置引擎下线：localStorage 已回写 mindmap', afterBuiltinDown.stored === 'mindmap',
  `localStorage=${afterBuiltinDown.stored}`);
await page.evaluate(() => window.mmApplyLayout('mindmap'));
await page.waitForTimeout(800);
ok('切回思维导图仍正常', await page.locator('#mm-mk-stage g.markmap-node').count() > 20);

await page.screenshot({ path: '/Users/baihe/blinko/.shots/06-思维导图-编辑态.png' });
await browser.close();

const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.n}${r.info ? '  — ' + r.info : ''}`);
/* 写到 stderr 避免被 process.exit(1) 截断 stdout 缓冲 */
process.stderr.write(`\n通过 ${results.length - bad.length}/${results.length}\n`);
process.stderr.write('console 问题：' + (logs.length ? '\n  ' + logs.join('\n  ') : ' (无)') + '\n');
if (typeof _mmFlush === 'function') _mmFlush();
process.exit(bad.length ? 1 : 0);