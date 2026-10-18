import { expect, test } from 'bun:test';
import { resolveBodyFontWeight } from '../../app/src/lib/fontTypography';

test('WenKai normal text stays 400 even for legacy high weight preferences', () => {
  for (const weight of [300, 400, 500, 600, 700, '600', undefined]) {
    expect(resolveBodyFontWeight('LXGW WenKai', weight)).toBe(400);
  }
});

test('switching to another font preserves its valid requested weight', () => {
  expect(resolveBodyFontWeight('Inter', 600)).toBe(600);
  expect(resolveBodyFontWeight('default', 500)).toBe(500);
  for (const invalid of [undefined, null, 'invalid', 900, 200]) {
    expect(resolveBodyFontWeight('Inter', invalid)).toBe(400);
  }
});
