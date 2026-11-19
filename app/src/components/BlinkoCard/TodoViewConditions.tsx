import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TaskDatePicker } from './TaskDatePicker';
import { readTodoStatuses } from '@shared/lib/todoStatus';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Select, SelectItem, SelectSection, Tooltip } from '@heroui/react';
import type { TodoView } from '@shared/lib/todoViews';
import { Icon } from '@/components/Common/Iconify/icons';

export const PRIORITY_LABELS = {ui:'紧急且重要',in:'重要不紧急',un:'紧急不重要',nn:'不急不重要'} as const;
export const SCOPE_LABELS = {all:'全部任务',today:'今天（含逾期及无日期）',week:'本周到期的任务',important:'重要事项',done:'已完成任务'} as const;
const DUE_PRESETS: [TodoView['dueMode'], string][] = [['today','今天'],['tomorrow','明天'],['yesterday','昨天'],['week','本周'],['lastWeek','上周'],['nextWeek','下周'],['month','本月'],['lastMonth','上月'],['nextMonth','下月']];
export const FIELD_LABELS = {
  scope:'任务范围',
  status:'完成状态',
  statusIds:'任务状态',
  priorities:'优先级',
  tags:'标签',
  due:'截止日期',
  attachment:'附件',
} as const;
export type ConditionField = keyof typeof FIELD_LABELS;
const FIELD_ORDER = Object.keys(FIELD_LABELS) as ConditionField[];

export const CLEARED_CONDITIONS: Partial<TodoView> = {
  scope:'all', status:'all', statusIds:[], priorities:[], tagId:null, tagIds:[], tagMatch:'any',
  dueMode:'any', dueFrom:undefined, dueTo:undefined, attachment:'any', conditionMatch:'all',
};

const FIELD_RESET: Record<ConditionField, Partial<TodoView>> = {
  scope:{scope:'all'},
  status:{status:'all'},
  statusIds:{statusIds:[]},
  priorities:{priorities:[]},
  tags:{tagId:null, tagIds:[], tagMatch:'any'},
  due:{dueMode:'any', dueFrom:undefined, dueTo:undefined},
  attachment:{attachment:'any'},
};

const STATUS_OPTIONS = {pending:'未完成', done:'已完成'} as const;
const ATTACHMENT_OPTIONS = {yes:'包含附件', no:'不含附件'} as const;
const selectClass = {trigger:'h-8 min-h-8 min-w-0 bg-default-100 shadow-none rounded-md', value:'text-sm', innerWrapper:'pt-0'};
const selectPopover = {disableAnimation:true as const, shouldCloseOnScroll:false, shouldBlockScroll:true, style:{zIndex:10080}, classNames:{content:'!z-[10080]'}};

export function todoConditionCount(view: TodoView) {
  return Number(!!view.statusIds.length)+Number(view.scope!=='all')+Number(view.status!=='all')+Number(!!(view.tagIds.length||view.tagId))+Number(!!view.priorities.length)+Number(view.dueMode!=='any')+Number(view.attachment!=='any');
}

export function activeConditionFields(view: TodoView): ConditionField[] {
  return FIELD_ORDER.filter(field => {
    if (field==='scope') return view.scope!=='all';
    if (field==='status') return view.status!=='all';
    if (field==='statusIds') return view.statusIds.length>0;
    if (field==='priorities') return view.priorities.length>0;
    if (field==='tags') return !!(view.tagIds.length||view.tagId);
    if (field==='due') return view.dueMode!=='any';
    return view.attachment!=='any';
  });
}

export function applyConditionPatch(view: TodoView, patch: Partial<TodoView>): TodoView {
  const next = {...view, ...patch};
  if (patch.scope==='done') next.status='done';
  if (patch.status && next.scope==='done' && patch.status!=='done') next.scope='all';
  return next;
}

function CompactSelect<T extends string>({
  label, className, selected, placeholder, selectionMode='single', onSingle, onMany, children,
}:{
  label:string; className?:string; selected:string[]; placeholder?:string;
  selectionMode?:'single'|'multiple';
  onSingle?:(value:T)=>void; onMany?:(values:string[])=>void; children:ReactNode;
}) {
  return (
    <Select
      disableAnimation
      popoverProps={selectPopover}
      aria-label={label}
      size="sm"
      placeholder={placeholder}
      className={className}
      classNames={selectClass}
      selectionMode={selectionMode}
      selectedKeys={selected}
      disallowEmptySelection={selectionMode==='single' && selected.length>0}
      onChange={selectionMode==='single' && onSingle ? e => { if (e.target.value) onSingle(e.target.value as T); } : undefined}
      onSelectionChange={selectionMode==='multiple' && onMany ? keys => onMany(keys==='all' ? [] : [...keys].map(String)) : undefined}
    >
      {children as any}
    </Select>
  );
}

export function TodoViewConditions({value, onChange, tags, heading=true}:{
  value:TodoView;
  onChange:(patch:Partial<TodoView>)=>void;
  tags:{id:number;name:string}[];
  heading?:boolean;
}) {
  const statuses = readTodoStatuses(RootStore.Get(BlinkoStore).config.value?.todoStatuses);
  const committed = activeConditionFields(value);
  const [pending, setPending] = useState<ConditionField[]>([]);
  const [rangeDraft, setRangeDraft] = useState<{from?:string;to?:string}|null>(null);
  useEffect(() => { setPending([]); setRangeDraft(null); }, [value.id]);
  useEffect(() => { setPending(current => current.filter(field => !committed.includes(field))); }, [committed.join('|')]);
  const rows = useMemo(() => {
    const seen = new Set<ConditionField>();
    const list: ConditionField[] = [];
    for (const field of [...committed, ...pending]) {
      if (seen.has(field)) continue;
      seen.add(field);
      list.push(field);
    }
    return list;
  }, [committed, pending]);
  const unused = FIELD_ORDER.filter(field => !rows.includes(field));

  const addRow = () => {
    const field = unused[0];
    if (!field) return;
    setPending(current => [...current, field]);
  };
  const removeRow = (field: ConditionField) => {
    setPending(current => current.filter(item => item!==field));
    if (field==='due') setRangeDraft(null);
    onChange(FIELD_RESET[field]);
  };
  const switchField = (from: ConditionField, to: ConditionField) => {
    if (from===to || rows.includes(to)) return;
    setPending(current => [...current.filter(item => item!==from && item!==to), to]);
    if (from==='due') setRangeDraft(null);
    onChange({...FIELD_RESET[from], ...FIELD_RESET[to]});
  };
  const setDue = (mode: TodoView['dueMode'], from?: string, to?: string) => {
    if (mode==='range' && !from && !to) {
      setRangeDraft({});
      if (value.dueMode!=='any') onChange(FIELD_RESET.due);
      return;
    }
    setRangeDraft(null);
    onChange({dueMode:mode, dueFrom:from, dueTo:to});
  };

  const renderValue = (field: ConditionField) => {
    if (field==='scope') {
      return (
        <CompactSelect label="任务范围取值" className="flex-1" selected={value.scope==='all'?[]:[value.scope]} placeholder="请选择" onSingle={(scope: TodoView['scope']) => onChange({scope})}>
          {Object.entries(SCOPE_LABELS).filter(([key]) => key!=='all').map(([key,title]) => <SelectItem key={key}>{title}</SelectItem>)}
        </CompactSelect>
      );
    }
    if (field==='status') {
      return (
        <CompactSelect label="完成状态取值" className="flex-1" selected={value.status==='all'?[]:[value.status]} placeholder="请选择" onSingle={(status: TodoView['status']) => onChange({status})}>
          {Object.entries(STATUS_OPTIONS).map(([key,title]) => <SelectItem key={key}>{title}</SelectItem>)}
        </CompactSelect>
      );
    }
    if (field==='statusIds') {
      return (
        <CompactSelect label="任务状态取值" className="flex-1" selectionMode="multiple" selected={value.statusIds} placeholder="请选择" onMany={keys => onChange({statusIds:keys})}>
          {statuses.map(item => <SelectItem key={item.id}>{item.name}</SelectItem>)}
        </CompactSelect>
      );
    }
    if (field==='priorities') {
      return (
        <CompactSelect label="优先级取值" className="flex-1" selectionMode="multiple" selected={[...value.priorities]} placeholder="请选择" onMany={keys => onChange({priorities: keys.filter(key => key in PRIORITY_LABELS) as TodoView['priorities']})}>
          {Object.entries(PRIORITY_LABELS).map(([key,title]) => <SelectItem key={key}>{title}</SelectItem>)}
        </CompactSelect>
      );
    }
    if (field==='tags') {
      const selected = (value.tagIds.length?value.tagIds:value.tagId?[value.tagId]:[]).map(String);
      return (
        <CompactSelect label="标签取值" className="flex-1" selectionMode="multiple" selected={selected} placeholder="请选择" onMany={keys => onChange({tagId:null, tagIds:keys.map(Number).filter(Number.isFinite)})}>
          {tags.map(tag => <SelectItem key={String(tag.id)}>{tag.name}</SelectItem>)}
        </CompactSelect>
      );
    }
    if (field==='attachment') {
      return (
        <CompactSelect label="附件取值" className="flex-1" selected={value.attachment==='any'?[]:[value.attachment]} placeholder="请选择" onSingle={(attachment: TodoView['attachment']) => onChange({attachment})}>
          {Object.entries(ATTACHMENT_OPTIONS).map(([key,title]) => <SelectItem key={key}>{title}</SelectItem>)}
        </CompactSelect>
      );
    }
    const operator = rangeDraft || value.dueMode==='range' ? 'range' : value.dueMode==='none' ? 'none' : 'equals';
    const equalValue = operator==='equals' && value.dueMode!=='any' && value.dueMode!=='none' && value.dueMode!=='range' ? value.dueMode : '';
    const from = rangeDraft ? rangeDraft.from : value.dueFrom;
    const to = rangeDraft ? rangeDraft.to : value.dueTo;
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <CompactSelect label="截止日期运算符" className="w-[104px] shrink-0" selected={[operator]} onSingle={(next: 'equals'|'none'|'range') => {
          if (next==='none') setDue('none');
          else if (next==='range') setDue('range', from, to);
          else if (equalValue) setDue(equalValue as TodoView['dueMode']);
          else { setRangeDraft(null); if (value.dueMode!=='any') onChange(FIELD_RESET.due); }
        }}>
          <SelectItem key="equals">等于</SelectItem>
          <SelectItem key="none">为空</SelectItem>
          <SelectItem key="range">范围</SelectItem>
        </CompactSelect>
        {operator==='equals' && (
          <CompactSelect label="截止日期取值" className="min-w-[140px] flex-1" selected={equalValue?[equalValue]:[]} placeholder="请选择" onSingle={(mode: TodoView['dueMode']) => setDue(mode)}>
            <SelectSection title="快捷范围">{DUE_PRESETS.map(([key,title]) => <SelectItem key={key}>{title}</SelectItem>)}</SelectSection>
            <SelectSection title="其他"><SelectItem key="overdue">已逾期（未完成）</SelectItem></SelectSection>
          </CompactSelect>
        )}
        {operator==='range' && (
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <TaskDatePicker label="开始日期" value={from} onChange={date => setDue('range', date, to)}/>
            <TaskDatePicker label="结束日期（含当天）" value={to} onChange={date => setDue('range', from, date)}/>
          </div>
        )}
      </div>
    );
  };

  const renderOperator = (field: ConditionField) => {
    if (field==='due') return null;
    if (field==='tags') {
      return (
        <CompactSelect label="标签匹配" className="w-[118px] shrink-0" selected={[value.tagMatch||'any']} onSingle={(tagMatch: TodoView['tagMatch']) => onChange({tagMatch})}>
          <SelectItem key="any">包含任一</SelectItem>
          <SelectItem key="all">包含全部</SelectItem>
        </CompactSelect>
      );
    }
    if (field==='statusIds' || field==='priorities') {
      return <div className="flex h-8 w-[72px] shrink-0 items-center px-1 text-sm text-default-600">包含</div>;
    }
    return <div className="flex h-8 w-[72px] shrink-0 items-center px-1 text-sm text-default-600">等于</div>;
  };

  return (
    <div className="flex flex-col gap-3">
      {heading && (
        <div className="flex items-center gap-1.5">
          <h3 className="text-[15px] font-medium text-foreground">设置筛选条件</h3>
          <Tooltip content="多条条件默认需全部满足；选择「任一」时满足其中一条即可。" delay={300} closeDelay={0} placement="top">
            <span className="inline-flex text-default-400">
              <Icon icon="tabler:info-circle" width="15" height="15"/>
            </span>
          </Tooltip>
        </div>
      )}
      {rows.length>=2 && (
        <div className="flex items-center gap-1.5 text-sm text-default-600">
          <span>符合以下</span>
          <CompactSelect label="条件匹配" className="w-[84px]" selected={[value.conditionMatch||'all']} onSingle={(conditionMatch: TodoView['conditionMatch']) => onChange({conditionMatch})}>
            <SelectItem key="all">所有</SelectItem>
            <SelectItem key="any">任一</SelectItem>
          </CompactSelect>
          <span>条件</span>
        </div>
      )}
      {rows.map(field => (
        <div key={field} className="flex items-start gap-2">
          <CompactSelect label="筛选字段" className="w-[124px] shrink-0" selected={[field]} onSingle={(next: ConditionField) => switchField(field, next)}>
            {FIELD_ORDER.filter(item => item===field || unused.includes(item)).map(item => <SelectItem key={item}>{FIELD_LABELS[item]}</SelectItem>)}
          </CompactSelect>
          {renderOperator(field)}
          {renderValue(field)}
          <button type="button" aria-label={`移除${FIELD_LABELS[field]}条件`} onClick={() => removeRow(field)} className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-default-400 hover:bg-default-100 hover:text-default-700">
            <Icon icon="tabler:x" width="16" height="16"/>
          </button>
        </div>
      ))}
      <button type="button" disabled={!unused.length} onClick={addRow} className="flex w-fit items-center gap-1 py-1 text-sm text-default-500 hover:text-foreground disabled:cursor-default disabled:opacity-40">
        <Icon icon="tabler:plus" width="15" height="15"/>
        添加条件
      </button>
    </div>
  );
}
