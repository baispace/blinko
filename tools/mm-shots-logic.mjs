#!/usr/bin/env node
import { chromium } from 'playwright';
const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=logic';
const OUT = '/Users/baihe/blinko/.shots';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.setDefaultTimeout(8000);
p.on('pageerror', (e) => console.log('PE:', e.message));
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

await p.screenshot({ path: `${OUT}/04-逻辑图.png` });
console.log('04 ✓ 逻辑图-默认');

/* 选中一级分支 */
const nodes = await p.locator('.mm-node').all();
console.log('  nodes count:', nodes.length);
const firstBranch = await p.locator('.mm-node.mm-depth-1').first().boundingBox();
await p.mouse.click(firstBranch.x + firstBranch.width / 2, firstBranch.y + firstBranch.height / 2);
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/11-逻辑图-选中态.png` });
console.log('11 ✓ 逻辑图-选中态');

/* hover 一个 depth-2 节点 */
const d2 = await p.locator('.mm-node.mm-depth-2').first().boundingBox();
await p.mouse.move(d2.x + d2.width / 2, d2.y + d2.height / 2);
await p.waitForTimeout(300);
await p.screenshot({ path: `${OUT}/12-逻辑图-hover态.png` });
console.log('12 ✓ 逻辑图-hover态');

await b.close();