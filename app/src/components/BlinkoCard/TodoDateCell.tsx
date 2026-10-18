import { useMemo, useState } from 'react';
import { Calendar, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { parseDate, type CalendarDate } from '@internationalized/date';
import dayjs from 'dayjs';
import { Icon } from '@/components/Common/Iconify/icons';
import './todoTable.css';

/**
 * 截止时间单元格 —— 就地编辑，不开弹窗。
 *
 * 原来点日期会打开整个任务编辑弹窗，改一个字段要先找控件再保存。
 * 这里改成点一下就在本格弹出一个轻量浮层：常用日期用 chip 一键选，
 * 需要具体日期再翻日历。浮层锚定在单元格上，不遮挡上下文。
 */

interface TodoDateCellProps {
  /** expireAt（ISO 字符串），null / undefined 表示未设置 */
  value?: string | null;
  isOverdue: boolean;
  overdueDays: number;
  /** 移动端把日期塞在标题下方，桌面端占一整列 */
  onPick: (iso: string | null) => void;
  /** 无障碍标签前缀。弹窗里同时有开始/截止两个日期格，必须区分 */
  label?: string;
  /**
   * 可见前缀。弹窗里「截止 10/18」和「开始 未设置」并排时，
   * 只有日期文字无法分辨谁是谁，必须显式写出来。
   * 列表布局下这列本来就窄，不传。
   */
  prefix?: string;
  icon?: string;
}

const QUICK_PICKS = [
  { label: '今天', offset: (d: dayjs.Dayjs) => d },
  { label: '明天', offset: (d: dayjs.Dayjs) => d.add(1, 'day') },
  { label: '后天', offset: (d: dayjs.Dayjs) => d.add(2, 'day') },
  { label: '下周一', offset: (d: dayjs.Dayjs) => {
      const day = d.add(1, 'day');
      // dayjs 的 day() 是 0-6：0=周日。这里推到下一个周一。
      const delta = (8 - day.day()) % 7 || 7;
      return day.add(delta, 'day');
    } },
];

/** CalendarDate → 本地零点 ISO，与 TodoEditModal 的 dayjs(...).toISOString() 保持同一语义 */
function toIso(date: CalendarDate): string {
  return dayjs(new Date(date.year, date.month - 1, date.day)).toISOString();
}

export const TodoDateCell = ({ value, isOverdue, overdueDays, onPick, label = '截止时间', prefix, icon }: TodoDateCellProps) => {
  const [open, setOpen] = useState(false);

  const due = useMemo(() => {
    if (!value) return null;
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed : null;
  }, [value]);

  const calendarValue = useMemo(() => {
    if (!due) return undefined;
    try { return parseDate(due.format('YYYY-MM-DD')); } catch { return undefined; }
  }, [due]);

  const commit = (iso: string | null) => {
    onPick(iso);
    setOpen(false);
  };

  const handleCalendarChange = (next: CalendarDate | null | undefined) => {
    // 点空档时 next 可能为 undefined/null，此时不主动清空——
    // 避免误触就把已设的日期丢掉，清除要走显式的 chip。
    if (next) onPick(toIso(next));
  };

  return (
    <Popover
      isOpen={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      offset={6}
      shouldFlip={false}
    >
      <PopoverTrigger>
        <button
          type="button"
          className={`todo-cell-btn ${prefix ? 'todo-attr-chip' : ''}`}
          data-empty={due ? undefined : 'true'}
          data-overdue={isOverdue ? 'true' : undefined}
          aria-label={due ? `编辑${label}：${due.format('MM月DD日')}` : `设置${label}`}
          title={due ? `点击修改${label}` : `点击设置${label}`}
        >
          {icon && <Icon icon={icon} width={13} height={13} className="shrink-0 opacity-70" />}
          {prefix && <span className="shrink-0 text-default-400">{prefix}</span>}
          {due ? (
            <>
              <span className="shrink-0 tabular-nums">{due.format('MM/DD')}</span>
              {isOverdue && <span className="shrink-0 text-[11px]">逾期 {overdueDays} 天</span>}
            </>
          ) : (
            <>
              <span className="shrink-0">未设置</span>
              <Icon icon="tabler:plus" width={12} className="todo-cell-add shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="flex w-[268px] flex-col gap-3 p-3" aria-label={label}>
        <div className="todo-date-quick">
          {QUICK_PICKS.map(pick => (
            <button
              key={pick.label}
              type="button"
              className="todo-date-chip"
              onClick={() => commit(pick.offset(dayjs().startOf('day')).toISOString())}
            >
              {pick.label}
            </button>
          ))}
          {due && (
            <button
              type="button"
              className="todo-date-chip"
              onClick={() => commit(null)}
            >
              清除
            </button>
          )}
        </div>

        <Calendar
          aria-label={`选择${label}`}
          value={(calendarValue ?? null) as any}
          onChange={handleCalendarChange as any}
          className="w-full"
          classNames={{
            base: 'w-full max-w-none',
            grid: 'w-full',
            title: 'text-xs',
            cell: 'text-xs',
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
