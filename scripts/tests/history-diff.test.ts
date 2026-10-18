import { expect, test } from 'bun:test';
import { compareHistory, diffTokens, historyText } from '../../app/src/lib/historyDiff';

test('Chinese edits preserve unchanged context and identify added and removed characters', () => {
  const parts = compareHistory('今天完成接口开发\n明天测试', '今天完成接口联调\n明天测试');
  expect(parts.filter(p => p.kind !== 'added').map(p => p.text).join('')).toBe('今天完成接口开发\n明天测试');
  expect(parts.filter(p => p.kind !== 'removed').map(p => p.text).join('')).toBe('今天完成接口联调\n明天测试');
  expect(parts.some(p => p.kind === 'removed' && p.text.includes('开发'))).toBe(true);
  expect(parts.some(p => p.kind === 'added' && p.text.includes('联调'))).toBe(true);
});
test('identical, empty, inserted and deleted documents reconstruct correctly', () => {
  for (const [before, after] of [['', '新内容'], ['旧内容', ''], ['', ''], ['相同', '相同'], ['a\nb\n', 'a\nc\nb\n']]) {
    const parts = compareHistory(before!, after!);
    expect(parts.filter(p => p.kind !== 'added').map(p => p.text).join('')).toBe(historyText(before!));
    expect(parts.filter(p => p.kind !== 'removed').map(p => p.text).join('')).toBe(historyText(after!));
  }
});
test('format-only Markdown and HTML changes do not create false text edits', () => {
  const parts = compareHistory('**加粗**与<span style="color:red">颜色</span>', '加粗与颜色');
  expect(parts.every(part => part.kind === 'same')).toBe(true);
  expect(historyText('<div data-type="outline-block"><ul><li><p>主题</p></li></ul></div>')).toContain('主题');
  expect(historyText('<div data-type="outline-block"><ul><li><p>主题</p></li></ul></div>')).not.toContain('data-type');
});
test('large unrelated inputs use a bounded fallback', () => {
  const parts = diffTokens(Array(20000).fill('旧'), Array(20000).fill('新'));
  expect(parts).toHaveLength(2);
  expect(parts[0]!.kind).toBe('removed');
  expect(parts[1]!.kind).toBe('added');
});
