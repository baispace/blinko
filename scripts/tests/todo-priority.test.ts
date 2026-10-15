import { describe, test, expect } from 'bun:test';
import { getTodoPriority, todoPriorityMetadata, compareTodoPriority } from '../../shared/lib/todoPriority';
describe('Todo priority consistency', () => {
  test('all four priority choices survive saving and reopening', () => {
    for (const key of ['ui', 'in', 'un', 'nn'] as const) expect(getTodoPriority(todoPriorityMetadata(key))).toBe(key);
  });
  test('explicit normal overrides a stale legacy high priority', () => {
    expect(getTodoPriority({ priority: 1, priorityUrgent: false, priorityImportant: false })).toBe('nn');
    expect(getTodoPriority({ priorityUrgent: 'false', priorityImportant: 'true' })).toBe('in');
  });
  test('old numeric priorities remain visible', () => {
    expect(getTodoPriority({ priority: 1 })).toBe('ui');
    expect(getTodoPriority({ priority: 2 })).toBe('in');
    expect(getTodoPriority({ priority: 3 })).toBe('nn');
  });
  test('pending tasks precede completed tasks and sort by priority then deadline', () => {
    const rows = [
      { id: 1, metadata: todoPriorityMetadata('nn') },
      { id: 2, metadata: { ...todoPriorityMetadata('ui'), expireAt: '2026-10-20' } },
      { id: 3, metadata: { ...todoPriorityMetadata('ui'), expireAt: '2026-10-16' } },
      { id: 4, metadata: todoPriorityMetadata('ui'), isArchived: true },
    ];
    expect(rows.sort(compareTodoPriority).map(row => row.id)).toEqual([3, 2, 1, 4]);
  });
});
