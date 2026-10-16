import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8934/blinko-mubu-prototype.html?view=mindmap&layout=mindmap', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// 检查 mm-drag-line 的所有计算样式
const info = await page.evaluate(() => {
  const svg = document.getElementById('mm-drag-line');
  if (!svg) return null;
  const cs = getComputedStyle(svg);
  return {
    hidden: svg.hidden,
    display: cs.display,
    position: cs.position,
    visibility: cs.visibility,
    opacity: cs.opacity,
    width: cs.width,
    height: cs.height,
    top: cs.top,
    left: cs.left,
    inlineStyle: svg.getAttribute('style'),
    classList: [...svg.classList],
    pathD: svg.querySelector('path')?.getAttribute('d'),
    pathStroke: svg.querySelector('path')?.getAttribute('stroke'),
  };
});
console.log(JSON.stringify(info, null, 2));

// 试 toggle hidden 看 display 怎么变
const toggle = await page.evaluate(() => {
  const svg = document.getElementById('mm-drag-line');
  svg.hidden = false;
  const before = getComputedStyle(svg).display;
  svg.hidden = true;
  const after = getComputedStyle(svg).display;
  return { beforeDisplay: before, afterDisplay: after };
});
console.log('toggle:', JSON.stringify(toggle));

await browser.close();
