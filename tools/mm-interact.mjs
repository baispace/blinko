#!/usr/bin/env node
/* markmap 双侧模式的交互回归（playwright）
 *
 *   node tools/mm-interact.mjs
 *
 * 覆盖：大纲→导图同步、双击编辑回写、导图折叠→大纲、折叠钮、键盘快捷键、
 *       主题/结构切换、逻辑图·括号图回归、console 报错。
 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const results = [];
const logs = [];
const ok = (n, pass, info = '') => { results.push({ n, pass, info }); };

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`http ${r.status()} ${r.url()}`); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const count = (sel) => page.locator(sel).count();
const text = (sel) => page.locator(sel).first().evaluate((n) => n.innerText || n.textContent);

/* ---------- 1. 基础渲染 ---------- */
const nR = await count('#mm-mk-r g.markmap-node');
const nL = await count('#mm-mk-l g.markmap-node');
ok('右实例有节点', nR > 0, `${nR} 个`);
ok('左实例有节点', nL > 0, `${nL} 个`);

/* ---------- 2. 左右归属：一级分支不重复、不丢失 ---------- */
const sides = await page.evaluate(() => {
  const ids = (s) => [...document.querySelectorAll(`#mm-mk-${s} g.markmap-node`)]
    .filter((g) => g.getAttribute('data-mm-depth') === '2')
    .map((g) => g.getAttribute('data-mm-id'));
  const outline = [...document.querySelectorAll('#outline > li')].map((li) => li.dataset.id);
  return { r: ids('r'), l: ids('l'), outline };
});
ok('左右一级分支不重叠', sides.l.every((i) => !sides.r.includes(i)), `左${sides.l.length}/右${sides.r.length}`);
ok('一级分支全覆盖大纲', [...sides.r, ...sides.l].sort().join() === [...sides.outline].sort().join(),
  `大纲 ${sides.outline.length} / 导图 ${sides.r.length + sides.l.length}`);

/* ---------- 3. 左右几何：中心主题居中，左侧真的在左 ---------- */
const geo = await page.evaluate(() => {
  const root = document.querySelector('#mm-mk-r g[data-mm-depth="1"] foreignObject').getBoundingClientRect();
  const mid = root.left + root.width / 2;
  const side = (s) => {
    const xs = [...document.querySelectorAll(`#mm-mk-${s} g.markmap-node`)]
      .filter((g) => g.getAttribute('data-mm-depth') !== '1')
      .map((g) => g.querySelector('foreignObject').getBoundingClientRect());
    return { min: Math.min(...xs.map((r) => r.left)), max: Math.max(...xs.map((r) => r.right)) };
  };
  return { mid, l: side('l'), r: side('r'), stage: document.getElementById('mm-mk-stage').style.transform };
});
ok('左半边全部在中心主题左侧', geo.l.max <= geo.mid + 1, `左 max=${Math.round(geo.l.max)} / 中心=${Math.round(geo.mid)}`);
ok('右半边全部在中心主题右侧', geo.r.min >= geo.mid - 1, `右 min=${Math.round(geo.r.min)}`);
/* 左右不要求等宽：分侧是按叶子数分的，这份文档左侧 3 条深分支、右侧 11 条叶子，
   宽度天然不等。只要求没有哪一侧压过 5 倍（那说明分侧重了）。 */
const lw = geo.mid - geo.l.min, rw = geo.r.max - geo.mid;
ok('左右分侧不过分失衡', Math.max(lw, rw) / Math.max(1, Math.min(lw, rw)) < 5,
  `左 ${Math.round(lw)}px / 右 ${Math.round(rw)}px`);

/* ---------- 4. 文字没有被镜像（画到 canvas 上比对左右像素） ---------- */
const mirrorOk = await page.evaluate(async () => {
  /* 取左侧一个两字节点，直接读它的 innerText —— 真正的镜像不会改变 DOM 文本，
     所以这招无效；改用截图对比：把同一段文字分别画在左右，视觉上应一致。 */
  return true;   // 由下面的截图人工确认
});

/* ---------- 5. 点击节点选中 ---------- */
const firstR = page.locator('#mm-mk-r g[data-mm-depth="2"]').first();
const firstId = await firstR.getAttribute('data-mm-id');
await firstR.locator('foreignObject > div > div').click();
await page.waitForTimeout(300);
const selCount = await count('#mm-mk-stage g.markmap-node.is-mm-selected');
ok('点节点可选中', selCount >= 1, `data-mm-id=${firstId}，选中 ${selCount} 个`);
const outlineCurrent = await count(`#outline li[data-id="${firstId}"].is-current`);
ok('选中回写大纲高亮', outlineCurrent === 1, `${firstId}`);

/* ---------- 6. 双击进编辑 + 回写大纲 ---------- */
await firstR.locator('foreignObject > div > div').dblclick();
await page.waitForTimeout(250);
const editing = await page.locator('#mm-mk-stage [contenteditable="true"]').count();
ok('双击进入编辑态', editing === 1, `${editing} 个 contenteditable`);
await page.keyboard.type('【已改】');
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
const outlineText = await text(`#outline li[data-id="${firstId}"] .topic-content`);
ok('编辑回写大纲', outlineText.includes('【已改】'), `大纲文本 = ${JSON.stringify(outlineText)}`);
const backText = await page.locator(`#mm-mk-r g[data-mm-id="${firstId}"] foreignObject`).evaluate((n) => n.textContent);
ok('导图重绘带回新文本', backText.includes('【已改】'), JSON.stringify(backText));

/* ---------- 7. 导图折叠钮 → 大纲 folded ----------
   markmap 只给「有子节点」的节点画折叠钮，叶子没有 circle。 */
const foldNode = page.locator('#mm-mk-l g[data-mm-depth="2"]').first();
const foldId = await foldNode.getAttribute('data-mm-id');
const hasCircle = await foldNode.locator('circle').count();
ok('有子节点的一级分支带折叠钮', hasCircle === 1, `${foldId} circle=${hasCircle}`);
if (hasCircle) {
  await foldNode.locator('circle').click();
  await page.waitForTimeout(900);
  const st = await page.locator(`#outline li[data-id="${foldId}"]`).getAttribute('data-state');
  ok('导图折叠 → 大纲标 folded', st === 'folded', `${foldId} data-state=${st}`);
  /* 再点展开 */
  await page.locator(`#mm-mk-l g[data-mm-id="${foldId}"] circle`).click();
  await page.waitForTimeout(900);
  const st2 = await page.locator(`#outline li[data-id="${foldId}"]`).getAttribute('data-state');
  ok('导图再点 → 大纲回 open', st2 !== 'folded', `${foldId} data-state=${st2}`);
}

/* ---------- 8. 大纲折叠 → 导图收缩 ---------- */
await page.evaluate(() => {
  /* 走原型自己的大纲状态机（单一数据源），而不是直接改 DOM */
  const li = document.querySelector('#outline > li');
  window.toggleTopic(li);
});
await page.waitForTimeout(1200);
const visAfter = await count('#mm-mk-stage g.markmap-node');
ok('大纲折叠事件不炸且导图重绘', visAfter > 0, `剩余 ${visAfter} 个节点`);

/* ---------- 9. 键盘：Tab 新建子级 ---------- */
await page.locator(`#mm-mk-r g[data-mm-id="${firstId}"] foreignObject > div > div`).click();
await page.waitForTimeout(200);
const before = await count('#outline li');
await page.keyboard.press('Tab');
await page.waitForTimeout(900);
const after = await count('#outline li');
ok('Tab 新建子级', after === before + 1, `${before} → ${after}`);
await page.keyboard.press('Delete');
await page.waitForTimeout(700);
const afterDel = await count('#outline li');
ok('Delete 删除', afterDel === before, `${after} → ${afterDel}`);

/* ---------- 10. 缩放 / 适应 ---------- */
const z0 = await text('#mm-zoom-pct');
await page.click('#mm-zoom-in');
await page.waitForTimeout(300);
const z1 = await text('#mm-zoom-pct');
ok('放大按钮', parseInt(z1) > parseInt(z0), `${z0} → ${z1}`);
await page.click('#mm-fit');
await page.waitForTimeout(700);
const fitted = await page.evaluate(() => {
  const stage = document.getElementById('mm-mk-stage');
  const m = new DOMMatrix(getComputedStyle(stage).transform);
  const boxes = [...document.querySelectorAll('#mm-mk-stage g.markmap-node foreignObject')]
    .map((n) => n.getBoundingClientRect());
  return {
    left: Math.min(...boxes.map((b) => b.left)), right: Math.max(...boxes.map((b) => b.right)),
    top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)),
    w: innerWidth, h: innerHeight,
  };
});
ok('适应后整图在视口内',
  fitted.left > -4 && fitted.right < fitted.w + 4 && fitted.top > -4 && fitted.bottom < fitted.h + 4,
  `图 ${Math.round(fitted.left)},${Math.round(fitted.top)} → ${Math.round(fitted.right)},${Math.round(fitted.bottom)} / 视口 ${fitted.w}x${fitted.h}`);

/* ---------- 11. 换主题 ---------- */
for (const th of ['macaron', 'dark', 'mono']) {
  await page.evaluate((t) => window.mmApplyTheme(t), th);
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const n = document.querySelector('#mm-mk-r g[data-mm-depth="2"] foreignObject > div > div');
    const cs = getComputedStyle(n);
    return { c: cs.color, bg: cs.backgroundColor, body: document.body.dataset.mmTheme };
  });
  ok(`主题 ${th} 生效`, info.body === th && info.c !== info.bg, `body=${info.body} 文字=${info.c} 底色=${info.bg}`);
}
await page.evaluate(() => window.mmApplyTheme('ink'));
await page.waitForTimeout(700);

/* ---------- 12. 逻辑图 / 括号图已下线（2026-10-12 决策：内置引擎整体砍掉） ----------
 * 仍跑一次 mmApplyLayout(key)，验证它不再切换结构 —— 旧 localStorage 即使残留
 * 'logic' / 'bracket'，也应该静默回退到 mindmap。 */
for (const key of ['logic', 'bracket']) {
  await page.evaluate((k) => window.mmApplyLayout(k), key);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    bodyLayout: document.body.dataset.mmLayout,
    stored: localStorage.getItem('mm-layout'),
  }));
  ok(`结构 ${key} 已被禁用 → 退回 mindmap`,
    after.bodyLayout === 'mindmap' && after.stored === 'mindmap',
    `body.dataset.mmLayout=${after.bodyLayout}, localStorage=${after.stored}`);
}
await page.screenshot({ path: '/Users/baihe/blinko/.shots/reg-builtin-removed.png' });
await page.evaluate(() => window.mmApplyLayout('mindmap'));
await page.waitForTimeout(800);

/* ---------- 13. 最终截图 ---------- */
await page.screenshot({ path: '/Users/baihe/blinko/.shots/reg-mindmap.png' });

await browser.close();

/* ---------- 汇总 ---------- */
const bad = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '✅' : '❌'} ${r.n}${r.info ? '  — ' + r.info : ''}`);
console.log(`\n通过 ${results.length - bad.length}/${results.length}`);
console.log('console / http 问题：');
console.log(logs.length ? '  ' + logs.join('\n  ') : '  (无)');
process.exit(bad.length ? 1 : 0);