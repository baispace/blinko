import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveFontStylesheetUrl, WENKAI_LOCAL_CSS } from '../../shared/lib/fontStylesheetUrl';
import { buildStaticCdnBase, buildStaticCdnKeyPrefix, STATIC_CDN_DIRS } from '../../shared/lib/pathConstant';

test('bundled font follows the existing static CDN base and path', () => {
  const legacy='https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css';
  expect(resolveFontStylesheetUrl(legacy)).toBe(WENKAI_LOCAL_CSS);
  expect(resolveFontStylesheetUrl('/font-assets/lxgw-wenkai/1.7.0/style.css')).toBe(WENKAI_LOCAL_CSS);
  const base=buildStaticCdnBase('https://cdn.example.com/', 'ink');
  expect(resolveFontStylesheetUrl(legacy,base)).toBe('https://cdn.example.com/ink'+WENKAI_LOCAL_CSS);
  expect(resolveFontStylesheetUrl(WENKAI_LOCAL_CSS,base)).toBe('https://cdn.example.com/ink'+WENKAI_LOCAL_CSS);
  expect(resolveFontStylesheetUrl('https://custom.example.com/mine.css','https://cdn.example.com/font/style.css')).toBe('https://custom.example.com/mine.css');
  expect(STATIC_CDN_DIRS).toContain('font-assets');
  expect(buildStaticCdnKeyPrefix('ink')+WENKAI_LOCAL_CSS.slice(1)).toBe('ink/font-assets/lxgw-wenkai/1.7.0/style-v2.css');
  expect(buildStaticCdnKeyPrefix('font-assets')).toBe('');
  expect(buildStaticCdnBase('https://cdn.example.com','font-assets')).toBe('https://cdn.example.com');
});
test('every bundled stylesheet and font subset reference resolves locally', () => {
  const base=resolve(import.meta.dir,'../../app/public/font-assets/lxgw-wenkai/1.7.0');
  let fonts=0;
  for(const filename of ['style.css','lxgwwenkai-regular.css','lxgwwenkai-bold.css']) {
    const css=readFileSync(resolve(base,filename),'utf8');
    for(const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) {
      expect(match[1]!.startsWith('./')).toBe(true);
      expect(existsSync(resolve(base,match[1]!))).toBe(true);
      if(match[1]!.endsWith('.woff2'))fonts++;
    }
  }
  expect(fonts).toBe(194);
  expect(existsSync(resolve(base,'OFL.txt'))).toBe(true);
  expect(existsSync(resolve(base,'lxgwwenkai-light.css'))).toBe(false);
  expect(readFileSync(resolve(base,'startup-v2.css'),'utf8')).not.toContain('font-weight: 300');
});
