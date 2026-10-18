/** The task scheduler stores UTC cron; the UI explicitly uses Beijing time. */
export function taskSchedule(time: string, frequency: string): string {
  if (!['daily', 'weekdays', 'weekly'].includes(frequency)) throw new Error('不支持的重复频率');
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || +match[1]! > 23 || +match[2]! > 59) throw new Error('请选择有效时间');
  const hour = +match[1]!;
  const utcHour = (hour + 16) % 24;
  const day = hour < 8 ? (frequency === 'weekdays' ? '0-4' : '4') : (frequency === 'weekdays' ? '1-5' : '5');
  return `${+match[2]!} ${utcHour} * * ${frequency === 'daily' ? '*' : day}`;
}

export function readTaskSchedule(cron: string): { time: string; frequency: string } | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5 || parts[2] !== '*' || parts[3] !== '*' || !/^\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) return null;
  const hour = (+parts[1]! + 8) % 24;
  if (+parts[0]! > 59 || +parts[1]! > 23) return null;
  const frequency = parts[4] === '*' ? 'daily' : parts[4] === (hour < 8 ? '0-4' : '1-5') ? 'weekdays' : parts[4] === (hour < 8 ? '4' : '5') ? 'weekly' : null;
  return frequency ? { time: `${String(hour).padStart(2, '0')}:${parts[0]!.padStart(2, '0')}`, frequency } : null;
}
