import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FONT_NAME_KEY,
  FONT_STACK_KEY,
  FONT_WEIGHTS_KEY,
  clearSavedFontPreference,
  readSavedFontPreference,
  writeSavedFontPreference,
} from '../../app/src/lib/fontPreference';

const INDEX_HTML = join(import.meta.dir, '../../app/index.html');

/**
 * index.html 的首屏内联脚本是手写的纯 JS，没法 import fontPreference 的常量。
 * 栈的 key 一旦漂移，首屏脚本会静默读不到值，整个 FOUT 优化就失效了 ——
 * 而且不会有任何报错，只有肉眼可见的字体跳变能发现。这里把它钉死。
 *
 * 只钉 FONT_STACK_KEY：内联脚本的全部职责就是首帧套上 font-family，只需要栈本身。
 * name / weights 是首屏之后由 `FontManager.restoreSavedFont` 在 JS 里读的，
 * 不需要（也不应该）出现在 HTML 里。
 */
test('index.html inline bootstrap reads the same font stack key as fontPreference', () => {
  const html = readFileSync(INDEX_HTML, 'utf8');
  expect(html).toContain(`'${FONT_STACK_KEY}'`);
  // 首屏脚本必须真的把栈写进 --font-family，否则只是读到了值却没生效
  expect(html).toContain("--font-family");
});

test('the two font keys never collide', () => {
  expect(FONT_STACK_KEY).not.toBe(FONT_NAME_KEY);
  expect(FONT_STACK_KEY).not.toBe(FONT_WEIGHTS_KEY);
  expect(FONT_NAME_KEY).not.toBe(FONT_WEIGHTS_KEY);
});

test('preference round-trips through localStorage', () => {
  const values = new Map<string, string>();
  const old = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); },
    removeItem: (k: string) => { values.delete(k); },
  } as any;
  try {
    expect(readSavedFontPreference()).toBeNull();

    writeSavedFontPreference({ name: 'LXGW WenKai', stack: '"LXGW WenKai", sans-serif', weights: [400, 700] });
    expect(readSavedFontPreference()).toEqual({
      name: 'LXGW WenKai',
      stack: '"LXGW WenKai", sans-serif',
      weights: [400, 700],
    });

    clearSavedFontPreference();
    expect(readSavedFontPreference()).toBeNull();
  } finally {
    globalThis.localStorage = old;
  }
});

test('corrupt weights payload degrades to an empty list instead of throwing', () => {
  const values = new Map<string, string>([
    [FONT_NAME_KEY, 'Inter'],
    [FONT_STACK_KEY, '"Inter", sans-serif'],
    [FONT_WEIGHTS_KEY, '{not json'],
  ]);
  const old = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); },
    removeItem: (k: string) => { values.delete(k); },
  } as any;
  try {
    expect(readSavedFontPreference()).toEqual({
      name: 'Inter',
      stack: '"Inter", sans-serif',
      weights: [],
    });
  } finally {
    globalThis.localStorage = old;
  }
});
