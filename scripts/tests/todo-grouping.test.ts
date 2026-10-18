import { expect, test } from 'bun:test';
import { groupTodos } from '../../shared/lib/todoGrouping';

const tasks = [
  { id: 1, metadata: { priority: 1, expireAt: '2026-10-17T12:00:00' }, tags: [{ tag: { id: 1, name: '工作' } }, { tag: { id: 2, name: '项目A' } }] },
  { id: 2, metadata: { priority: 2, expireAt: '2026-10-18T12:00:00' }, tags: [{ tag: { id: 1, name: '工作' } }, { tag: { id: 1, name: '工作' } }] },
  { id: 3, metadata: { expireAt: '2026-10-20T12:00:00' } },
  { id: 4, metadata: { expireAt: 'invalid' } },
];
test('priority groups retain empty board columns and never change task data', () => {
  const before = JSON.stringify(tasks);
  const groups = groupTodos(tasks, 'priority');
  expect(groups.map(group => group.key)).toEqual(['ui', 'in', 'un', 'nn']);
  expect(groups.map(group => group.items.length)).toEqual([1, 1, 0, 2]);
  expect(JSON.stringify(tasks)).toBe(before);
});
test('deadline groups distinguish past, today, future and missing or invalid dates', () => {
  const groups = groupTodos(tasks, 'date', '2026-10-18');
  expect(groups.map(group => group.items.map(item => item.id))).toEqual([[1], [2], [3], [4]]);
  expect(groupTodos(tasks.map(task => ({ ...task, isArchived: true })), 'date', '2026-10-18')[0]!.title).toBe('较早日期');
});
test('multi-tag tasks appear once in each relevant group, and untagged tasks stay visible', () => {
  const groups = groupTodos(tasks, 'tag');
  expect(groups.find(group => group.key === '1')!.items.map(item => item.id)).toEqual([1, 2]);
  expect(groups.find(group => group.key === '2')!.items.map(item => item.id)).toEqual([1]);
  expect(groups[groups.length - 1]!.key).toBe('untagged');
  expect(groups[groups.length - 1]!.items.map(item => item.id)).toEqual([3, 4]);
});
test('empty inputs and default grouping do not invent tasks', () => {
  expect(groupTodos([], 'priority').every(group => !group.items.length)).toBe(true);
  expect(groupTodos([], 'tag')).toEqual([]);
  expect(groupTodos(tasks, 'none')[0]!.items).toHaveLength(4);
});
test('completed tasks carried in a mixed today feed are not classified as overdue', () => {
  const groups = groupTodos([{ id: 1, isArchived: true, metadata: { expireAt: '2026-10-17T12:00:00' } }, { id: 2, isArchived: false, metadata: { expireAt: '2026-10-17T12:00:00' } }], 'date', '2026-10-18');
  expect(groups.find(group => group.key === 'past')!.items.map(item => item.id)).toEqual([2]);
  expect(groups.find(group => group.key === 'done')!.items.map(item => item.id)).toEqual([1]);
});
