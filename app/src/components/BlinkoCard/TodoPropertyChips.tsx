import { readTodoStatuses, type TodoStatus } from '@shared/lib/todoStatus';
import { TODO_PRIORITIES, todoPriorityMetadata, type TodoPriority } from '@shared/lib/todoPriority';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

/**
 * 任务属性的胶囊控件。
 *
 * 主张：详情页里「状态 / 优先级」不是表单字段，是属性本身。
 * 所以渲染成一行可点的胶囊（点开即改），而不是带 label 的大下拉框 ——
 * 后者占了整块纵向空间却只承载一个值，还让人以为要「填表」而不是「看属性」。
 * 列表、看板、详情弹窗三处共用同一份实现，避免三套长得不一样的控件。
 */

interface ChipProps {
  className?: string;
  disabled?: boolean;
}

export function TodoStatusChip({ statusId, statuses, onPick, className = '', disabled }: ChipProps & { statusId: string; statuses: TodoStatus[]; onPick: (id: string) => void }) {
  const current = statuses.find(item => item.id === statusId);
  const label = current?.name || '其他';
  return (
    <Dropdown isDisabled={disabled}>
      <DropdownTrigger>
        <button
          type="button"
          disabled={disabled}
          aria-label={`任务状态：${label}`}
          className={`todo-attr-chip ${className}`}
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: current?.color || '#94a3b8' }} />
          <span className="truncate">{label}</span>
        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label="修改任务状态" selectionMode="single" selectedKeys={[statusId]} onAction={key => onPick(String(key))}>
        {statuses.map(item => (
          <DropdownItem key={item.id} startContent={<span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />}>
            {item.name}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

export function TodoPriorityChip({ priorityKey, onPick, busy, className = '' }: ChipProps & { priorityKey: TodoPriority; onPick: (key: TodoPriority) => void; busy?: boolean }) {
  const { t } = useTranslation();
  const current = TODO_PRIORITIES.find(item => item.key === priorityKey)!;
  return (
    <Dropdown isDisabled={busy}>
      <DropdownTrigger>
        <button
          type="button"
          disabled={busy}
          aria-label={`${t('priority')}：${t(current.labelKey)}`}
          className={`todo-attr-chip todo-attr-pill ${className}`}
          style={{ color: current.color, backgroundColor: `${current.color}18` }}
        >
          <span className="truncate">{busy ? t('saving') : t(current.labelKey)}</span>
        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label={t('priority')} selectionMode="single" selectedKeys={[priorityKey]} onAction={key => onPick(key as TodoPriority)}>
        {TODO_PRIORITIES.map(option => (
          <DropdownItem key={option.key} textValue={t(option.labelKey)} startContent={<span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: option.color }} />}>
            {t(option.labelKey)}
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}

/** 描述 / 优先级元信息 → 服务端 metadata 补丁（服务端是合并语义，只传要改的字段） */
export const priorityPatch = todoPriorityMetadata;

/** 从全局配置读自定义状态，列表、看板、弹窗共用 */
export function useTodoStatuses(): TodoStatus[] {
  return readTodoStatuses(RootStore.Get(BlinkoStore).config.value?.todoStatuses);
}
