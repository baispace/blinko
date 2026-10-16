#!/usr/bin/env node
import { chromium } from 'playwright';
const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=bracket';
const OUT = '/Users/baihe/blinko/.shots';
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
p.setDefaultTimeout(8000);
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.screenshot({ path: `${OUT}/03-括号图.png` });
console.log('03 ✓ 括号图');
await b.close();