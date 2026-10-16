#!/usr/bin/env node
/* 思维导图模式编辑/拖拽行为的专属截图
 *   node tools/mm-shots.mjs
 * 输出到 .shots/06-..11-.. 系列 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const OUT = '/Users/baihe/blinko/.shots';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR:', m.text()); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

/* 1) 默认视角（已修复的导图） */
await page.screenshot({ path: `${OUT}/06-思维导图-编辑态.png` });
console.log('06 ✓ 思维导图-编辑态');

/* 2) 选中态：选一级分支的第一个孩子 */
const t4 = await page.locator('#mm-mk-stage g[data-mm-id="t4"] foreignObject > div > div').first().boundingBox();
await page.mouse.click(t4.x + t4.width / 2, t4.y + t4.height / 2);
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/07-思维导图-选中态.png` });
console.log('07 ✓ 思维导图-选中态');

/* 3) 拖拽：改父 —— 落点指示 = 虚线框（变子级） */
const pick = await page.evaluate(() => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m)); return e ? e[0] : null; };
  return { src: f((m) => !m.hasChildren && m.depth === 2), tgt: f((m) => m.depth === 2 && m.hasChildren) };
});
const tgt = await page.locator(`#mm-mk-stage g[data-mm-id="${pick.tgt}"] foreignObject`).first().boundingBox();
const src = await page.locator(`#mm-mk-stage g[data-mm-id="${pick.src}"] foreignObject > div > div`).first().boundingBox();
const dropX = tgt.x + tgt.width / 2;        /* 压中 = 变子级 */
const dropY = tgt.y + tgt.height / 2;
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
await page.mouse.move(src.x + src.width / 2 + 20, src.y + src.height / 2 + 10, { steps: 4 });
await page.mouse.move(dropX, dropY, { steps: 12 });
await page.waitForTimeout(300);              /* 留出 ghost 跟手时间 */
await page.screenshot({ path: `${OUT}/08-思维导图-拖拽-变子级指示.png` });
console.log('08 ✓ 思维导图-拖拽-变子级指示');
await page.mouse.up();
await page.waitForTimeout(1200);

/* 4) 拖拽：改兄弟序 —— 落点指示 = 横线（变兄弟） */
const pick2 = await page.evaluate(() => {
  const e = Array.from(mmTree.entries()).find(([, m]) => !m.hasChildren && m.parentId === '__doc__');
  return e ? e[0] : null;
});
const sibs = await page.evaluate(() => Array.from(document.querySelectorAll('#outline > .topic')).map((li) => li.dataset.id));
const other = sibs.find((x) => x !== pick2);
const ob = await page.locator(`#mm-mk-stage g[data-mm-id="${other}"] foreignObject`).first().boundingBox();
const sb = await page.locator(`#mm-mk-stage g[data-mm-id="${pick2}"] foreignObject > div > div`).first().boundingBox();
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await page.mouse.down();
await page.mouse.move(sb.x + sb.width / 2 + 20, sb.y + sb.height / 2 + 10, { steps: 4 });
await page.mouse.move(ob.x + ob.width / 2, ob.y + ob.height + 6, { steps: 12 });   /* 盒子正下方的空档 = 变兄弟 */
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/09-思维导图-拖拽-变兄弟指示.png` });
console.log('09 ✓ 思维导图-拖拽-变兄弟指示');
await page.mouse.up();
await page.waitForTimeout(1200);

/* 5) 拖到自己的孩子身上：连落点都不给（自指子树防护） */
const cycle = await page.evaluate(() => {
  const p = Array.from(mmTree.entries()).find(([, m]) => m.depth === 2 && m.hasChildren);
  if (!p) return null;
  const [pid] = p;
  return { pid, kid: mmTree.get(pid).childIds[0] };
});
if (cycle) {
  const cb = await page.locator(`#mm-mk-stage g[data-mm-id="${cycle.pid}"] foreignObject > div > div`).first().boundingBox();
  const kb = await page.locator(`#mm-mk-stage g[data-mm-id="${cycle.kid}"] foreignObject`).first().boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 20, cb.y + cb.height / 2 + 10, { steps: 4 });
  await page.mouse.move(kb.x + kb.width / 2, kb.y + kb.height / 2, { steps: 14 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10-思维导图-拖拽-自指子树无指示.png` });
  console.log('10 ✓ 思维导图-拖拽-自指子树无指示');
  await page.mouse.up();
}

await browser.close();
console.log('完成。');