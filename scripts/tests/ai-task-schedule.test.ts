import { expect, test } from 'bun:test';
import { taskSchedule, readTaskSchedule } from '../../shared/lib/aiTaskSchedule';

test('Beijing schedules convert to UTC including previous-day weekdays', () => {
  expect(taskSchedule('09:30', 'weekdays')).toBe('30 1 * * 1-5');
  expect(taskSchedule('07:30', 'weekdays')).toBe('30 23 * * 0-4');
  expect(taskSchedule('07:00', 'weekly')).toBe('0 23 * * 4');
  for (const time of ['00:00', '07:59', '08:00', '18:30', '23:59']) for (const frequency of ['daily', 'weekly', 'weekdays'])
    expect(readTaskSchedule(taskSchedule(time, frequency))).toEqual({ time, frequency });
});
test('unsupported cron plans stay intact instead of silently being changed', () => {
  expect(readTaskSchedule('0 */6 * * *')).toBeNull();
  expect(() => taskSchedule('25:00', 'daily')).toThrow();
  expect(() => taskSchedule('09:60', 'daily')).toThrow();
  expect(() => taskSchedule('09:00', 'unknown')).toThrow();
});
