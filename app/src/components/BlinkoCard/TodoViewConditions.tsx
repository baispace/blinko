import { TaskDatePicker } from './TaskDatePicker';
import { readTodoStatuses } from '@shared/lib/todoStatus';
import {RootStore} from '@/store';
import {BlinkoStore} from '@/store/blinkoStore';
import { Checkbox, CheckboxGroup, Select, SelectItem, SelectSection } from '@heroui/react';
import type { TodoView } from '@shared/lib/todoViews';

export const PRIORITY_LABELS = {ui:'紧急且重要',in:'重要不紧急',un:'紧急不重要',nn:'不急不重要'};
export const SCOPE_LABELS = {all:'全部任务',today:'今天（含逾期及无日期）',week:'本周到期的任务',important:'重要事项',done:'已完成任务'};
/** 相对日期预设：按「日 → 周 → 月」的自然顺序排，和 scope 里的「本周」区分开 */
const DUE_PRESETS: [string,string][] = [['today','今天'],['tomorrow','明天'],['yesterday','昨天'],['week','本周'],['lastWeek','上周'],['nextWeek','下周'],['month','本月'],['lastMonth','上月'],['nextMonth','下月']];
const selectClass = {trigger:'min-h-9 h-9 bg-default-100 shadow-none',value:'text-sm'};
export function TodoViewConditions({value,onChange,tags}:{value:TodoView;onChange:(patch:Partial<TodoView>)=>void;tags:{id:number;name:string}[]}) {
 const statuses=readTodoStatuses(RootStore.Get(BlinkoStore).config.value?.todoStatuses);
 const select = (key:'scope'|'status'|'dueMode'|'attachment'|'tagMatch',label:string,options:Record<string,string>) => <Select disableAnimation popoverProps={{disableAnimation:true,shouldCloseOnScroll:false}} label={label} labelPlacement="outside" aria-label={label} size="sm" classNames={selectClass} selectedKeys={[value[key]]} disallowEmptySelection onChange={e=>onChange({[key]:e.target.value})}>{Object.entries(options).map(([id,title])=><SelectItem key={id}>{title}</SelectItem>)}</Select>;
 return <div className="space-y-5">
  <p className="rounded-lg bg-default-50 px-3 py-2 text-xs leading-5 text-default-500">任务需同时满足以下条件；不选优先级或标签表示不限。</p>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{select('scope','任务范围',SCOPE_LABELS)}{select('status','完成状态',{all:'全部状态',pending:'未完成',done:'已完成'})}</div>
  <Select disableAnimation popoverProps={{disableAnimation:true}} label="任务状态" labelPlacement="outside" aria-label="筛选任务状态" placeholder="不限状态" selectionMode="multiple" size="sm" selectedKeys={value.statusIds} onSelectionChange={keys=>onChange({statusIds:keys==='all'?statuses.map(s=>s.id):[...keys].map(String)})}>{statuses.map(status=><SelectItem key={status.id}>{status.name}</SelectItem>)}</Select>
  <CheckboxGroup label="优先级" orientation="horizontal" size="sm" value={value.priorities} onValueChange={priorities=>onChange({priorities:priorities as TodoView['priorities']})} classNames={{wrapper:'gap-x-5 gap-y-3',label:'text-sm text-foreground'}}>{Object.entries(PRIORITY_LABELS).map(([key,label])=><Checkbox key={key} value={key}>{label}</Checkbox>)}</CheckboxGroup>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_150px]">
   <Select disableAnimation popoverProps={{disableAnimation:true,shouldCloseOnScroll:false}} label="标签" labelPlacement="outside" aria-label="筛选标签" placeholder="不限标签" selectionMode="multiple" size="sm" classNames={selectClass} selectedKeys={(value.tagIds.length?value.tagIds:value.tagId?[value.tagId]:[]).map(String)} onSelectionChange={keys=>onChange({tagId:null,tagIds:keys==='all'?tags.map(t=>t.id):[...keys].map(Number)})}>{tags.map(tag=><SelectItem key={String(tag.id)}>{tag.name}</SelectItem>)}</Select>
   {select('tagMatch','标签匹配',{any:'包含任意一个',all:'包含全部'})}
  </div>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
   <Select disableAnimation popoverProps={{disableAnimation:true,shouldCloseOnScroll:false}} label="截止日期" labelPlacement="outside" aria-label="筛选截止日期" size="sm" classNames={selectClass} selectedKeys={[value.dueMode]} disallowEmptySelection onChange={e=>onChange({dueMode:e.target.value as TodoView['dueMode']})}>
    <SelectSection title="快捷范围">{DUE_PRESETS.map(([key,title])=><SelectItem key={key}>{title}</SelectItem>)}</SelectSection>
    <SelectSection title="其他">
     <SelectItem key="overdue">已逾期（未完成）</SelectItem>
     <SelectItem key="none">未设置日期</SelectItem>
     <SelectItem key="any">不限日期</SelectItem>
    </SelectSection>
    <SelectSection title="自定义"><SelectItem key="range">自定义日期范围</SelectItem></SelectSection>
   </Select>
   {select('attachment','附件',{any:'不限',yes:'包含附件',no:'不含附件'})}
  </div>
  {value.dueMode==='range'&&<div className="grid grid-cols-2 gap-3">{(['dueFrom','dueTo'] as const).map((key,i)=><TaskDatePicker key={key} label={i?'结束日期（含当天）':'开始日期'} value={value[key]} onChange={date=>onChange({[key]:date})}/>)}</div>}
 </div>;
}
export function todoConditionCount(view:TodoView) {
 return Number(!!view.statusIds.length)+Number(view.scope!=='all')+Number(view.status!=='all')+Number(!!(view.tagIds.length||view.tagId))+Number(!!view.priorities.length)+Number(view.dueMode!=='any')+Number(view.attachment!=='any');
}
