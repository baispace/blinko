import { chromium } from 'playwright';

const URL = 'http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const { srcId, srcGrip, tgtRect } = await page.evaluate(() => {
  const gs = [...document.querySelectorAll('#mm-mk-r g[data-mm-depth="2"]')];
  const src = gs[0];
  const tgt = gs[1];
  const r = src.getBoundingClientRect();
  const tr = tgt.querySelector('foreignObject > div > div').getBoundingClientRect();
  return {
    srcId: src.getAttribute('data-mm-id'),
    srcGrip: { x: r.right - 6, y: r.top + 6 },
    tgtRect: { x: tr.left + tr.width / 2, y: tr.top + tr.height / 2 },
  };
});

await page.mouse.move(srcGrip.x, srcGrip.y);
await page.mouse.down();
await page.mouse.move(srcGrip.x + 80, srcGrip.y + 10, { steps: 5 });
await page.mouse.move(tgtRect.x, tgtRect.y, { steps: 12 });
await page.waitForTimeout(120);
await page.mouse.up();
await page.waitForTimeout(800);

await page.screenshot({ path: '.shots/19-拖一次后无幽灵边.png', fullPage: false });
console.log('saved .shots/19-拖一次后无幽灵边.png');
await browser.close();
