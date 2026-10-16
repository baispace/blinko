#!/usr/bin/env node
/* 全套视觉验证：抓手、连接线、兄弟放大、折叠预览、toast、Alt复制 */
import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const OUT = '/Users/baihe/blinko/.shots';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(8000);
page.on('pageerror', (e) => console.log('PE:', e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

/* 1. 抓手：hover 节点 */
const t4 = await page.locator('#mm-mk-stage g[data-mm-id="t4"] foreignObject > div > div').first().boundingBox();
await page.mouse.move(t4.x + t4.width / 2, t4.y + t4.height / 2);
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/13-抓手-hover态.png` });
console.log('13 ✓ 抓手 hover 态');

/* 2. 兄弟放大版：拖到 t1-1 下方空档（变兄弟） */
const pick1 = await page.evaluate(() => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m)); return e ? e[0] : null; };
  return { src: f((m) => !m.hasChildren && m.depth === 2), tgt: f((m) => m.depth === 2 && m.hasChildren) };
});
const src = await page.locator(`#mm-mk-stage g[data-mm-id="${pick1.src}"] foreignObject > div > div`).first().boundingBox();
const tgt = await page.locator(`#mm-mk-stage g[data-mm-id="${pick1.tgt}"] foreignObject > div > div`).first().boundingBox();
const dropX = tgt.x + tgt.width / 2;
const dropY = tgt.y + tgt.height + 8;             /* 盒子正下方的空档 */
await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
await page.mouse.down();
await page.mouse.move(src.x + src.width / 2 + 20, src.y + src.height / 2 + 10, { steps: 4 });
await page.mouse.move(dropX, dropY, { steps: 12 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/14-兄弟放大版指示.png` });
console.log('14 ✓ 兄弟放大版指示（带 ⊕ 插入这里角标）');
await page.mouse.up();
await page.waitForTimeout(1200);

/* 3. 变子级：压中另一个目标 → 实时连接预览线 + ring + 复制线（普通） */
const pick2 = await page.evaluate((skipTgt) => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m)); return e ? e[0] : null; };
  return { src: f((m) => !m.hasChildren && m.depth === 2), tgt: f((m) => m.depth === 2 && m.hasChildren && m.id !== skipTgt) };
}, pick1.tgt);
const s2 = await page.locator(`#mm-mk-stage g[data-mm-id="${pick2.src}"] foreignObject > div > div`).first().boundingBox();
const t2 = await page.locator(`#mm-mk-stage g[data-mm-id="${pick2.tgt}"] foreignObject`).first().boundingBox();
await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2);
await page.mouse.down();
await page.mouse.move(s2.x + s2.width / 2 + 20, s2.y + s2.height / 2 + 10, { steps: 4 });
await page.mouse.move(t2.x + t2.width / 2, t2.y + t2.height / 2, { steps: 12 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/15-连接预览线-变子级.png` });
console.log('15 ✓ 实时连接预览线 + ring 变子级');
await page.mouse.up();
await page.waitForTimeout(1200);

/* 4. Alt 复制：拖到兄弟位但按住 Alt → ghost 白底+虚线+⊕ */
const pick3 = await page.evaluate(() => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m)); return e ? e[0] : null; };
  return { src: f((m) => !m.hasChildren && m.depth === 2), tgt: f((m) => m.depth === 2 && m.hasChildren) };
});
const s3 = await page.locator(`#mm-mk-stage g[data-mm-id="${pick3.src}"] foreignObject > div > div`).first().boundingBox();
const t3 = await page.locator(`#mm-mk-stage g[data-mm-id="${pick3.tgt}"] foreignObject`).first().boundingBox();
await page.keyboard.down('Alt');
await page.mouse.move(s3.x + s3.width / 2, s3.y + s3.height / 2);
await page.mouse.down();
await page.mouse.move(s3.x + s3.width / 2 + 20, s3.y + s3.height / 2 + 10, { steps: 4 });
await page.mouse.move(t3.x + t3.width / 2, t3.y + t3.height + 8, { steps: 12 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/16-Alt复制模式.png` });
console.log('16 ✓ Alt 复制模式：白底虚线 ghost + ⊕ 复制到此 角标');
await page.mouse.up();
await page.keyboard.up('Alt');
await page.waitForTimeout(1500);

/* 5. 撤销 / toast：drop 完会出 toast，截下来 */
await page.screenshot({ path: `${OUT}/17-drop后toast反馈.png` });
console.log('17 ✓ drop 后 toast 反馈');

/* 6. 折叠父预览：先折叠一个父，再 hover 它的位置 */
const foldId = await page.evaluate(() => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m)); return e ? e[0] : null; };
  return f((m) => m.depth === 1 && m.hasChildren);
});
await page.evaluate((id) => {
  const li = document.querySelector(`#outline li[data-id="${id}"]`);
  li.dataset.state = 'folded';
  mmRelayout(true);
}, foldId);
await page.waitForTimeout(800);
const fl = await page.locator(`#mm-mk-stage g[data-mm-id="${foldId}"] foreignObject > div > div`).first().boundingBox();
const fpick = await page.evaluate((skip) => {
  const f = (p) => { const e = Array.from(mmTree.entries()).find(([, m]) => p(m) && m.id !== skip); return e ? e[0] : null; };
  return f((m) => !m.hasChildren && m.depth === 2);
}, foldId);
const s4 = await page.locator(`#mm-mk-stage g[data-mm-id="${fpick}"] foreignObject > div > div`).first().boundingBox();
await page.mouse.move(s4.x + s4.width / 2, s4.y + s4.height / 2);
await page.mouse.down();
await page.mouse.move(s4.x + s4.width / 2 + 20, s4.y + s4.height / 2 + 10, { steps: 4 });
await page.mouse.move(fl.x + fl.width / 2, fl.y + fl.height / 2, { steps: 12 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/18-折叠父迷你预览.png` });
console.log('18 ✓ 折叠父迷你预览');
await page.mouse.up();

await browser.close();
console.log('全部完成');