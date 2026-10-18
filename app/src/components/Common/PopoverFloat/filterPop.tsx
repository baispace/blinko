import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Checkbox, DateRangePicker, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useSearchParams } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';
import dayjs from '@/lib/dayjs';

const flags = [
  ['withoutTag', '无标签'], ['withFile', '包含附件'], ['withLink', '包含链接'],
  ['hasTodo', '包含待办'], ['isShare', '已公开'],
] as const;
export const activeListFilterCount = (config: BlinkoStore['noteListFilterConfig']) =>
  flags.filter(([key]) => !!config[key]).length + (config.startDate && config.endDate ? 1 : 0);
const clearedFilters = {startDate:null, endDate:null, withoutTag:false, withFile:false, withLink:false, hasTodo:false, isShare:null};

const FilterForm = observer(({onDone}: {onDone:()=>void}) => {
  const store = RootStore.Get(BlinkoStore);
  const [params] = useSearchParams();
  const [draft, setDraft] = useState(() => ({...store.noteListFilterConfig}));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const apply = async (reset=false) => {
    if(saving) return;
    setSaving(true); setError('');
    store.noteListFilterConfig = {...store.noteListFilterConfig, ...(reset ? clearedFilters : draft)};
    try { await store.getListByPath(params.get('path')).resetAndCall({}); onDone(); }
    catch { setError('加载失败，请重试'); }
    finally { setSaving(false); }
  };
  const range = draft.startDate && draft.endDate ? {start:parseDate(dayjs(draft.startDate).format('YYYY-MM-DD')),end:parseDate(dayjs(draft.endDate).format('YYYY-MM-DD'))} : null;
  return <div className="space-y-4 py-3 text-sm">
    <p className="text-xs text-default-500">条件同时满足；标签通过列表上方的标签栏选择。</p>
    <DateRangePicker label="创建时间" aria-label="创建时间范围" size="sm" value={range as any} onChange={(value: any) => setDraft(current=>({...current, startDate:value ? dayjs(value.start.toString()).startOf('day').toDate() : null, endDate:value ? dayjs(value.end.toString()).endOf('day').toDate() : null}))} isDisabled={saving} disableAnimation popoverProps={{disableAnimation:true}} />
    {range && <button type="button" className="text-xs text-default-500 hover:text-foreground" onClick={()=>setDraft(current=>({...current,startDate:null,endDate:null}))}>清除时间范围</button>}
    <div className="flex flex-col gap-3">{flags.map(([key,label])=><Checkbox key={key} size="sm" isSelected={!!draft[key]} isDisabled={saving} onValueChange={value=>setDraft(current=>({...current,[key]: key==='isShare' ? (value || null) : value}))}>{label}</Checkbox>)}</div>
    {error && <p role="alert" className="text-danger text-xs">{error}</p>}
    <div className="flex gap-2 border-t border-default-200 pt-3"><Button size="sm" variant="light" isDisabled={saving} onPress={()=>void apply(true)}>清空条件</Button><Button size="sm" color="primary" className="flex-1" isLoading={saving} onPress={()=>void apply()}>应用筛选</Button></div>
  </div>;
});

const FilterPop = ({inline=false,onDone=()=>{}}:{inline?:boolean;onDone?:()=>void}) => {
  const [open,setOpen]=useState(false);
  if(inline)return <FilterForm onDone={onDone}/>;
  return <Popover isOpen={open} onOpenChange={setOpen} disableAnimation placement="bottom-end"><PopoverTrigger><Button isIconOnly size="sm" variant="light" aria-label="筛选内容"><Icon icon="tabler:filter" width={20}/></Button></PopoverTrigger><PopoverContent className="w-80 p-4"><FilterForm onDone={()=>setOpen(false)}/></PopoverContent></Popover>;
};
export default FilterPop;

export const ActiveListFilters = observer(() => {
  const store=RootStore.Get(BlinkoStore);
  const [params]=useSearchParams();
  const config=store.noteListFilterConfig;
  const chips: {key:string;label:string;patch:Partial<typeof config>}[]=flags.filter(([key])=>!!config[key]).map(([key,label])=>({key,label,patch:{[key]:key==='isShare'?null:false}}));
  if(config.startDate && config.endDate)chips.unshift({key:'date',label:`创建于 ${dayjs(config.startDate).format('YYYY/MM/DD')} – ${dayjs(config.endDate).format('YYYY/MM/DD')}`,patch:{startDate:null,endDate:null}});
  if(!chips.length)return null;
  const remove=(patch:Partial<typeof config>)=>{store.noteListFilterConfig={...config,...patch};void store.getListByPath(params.get('path')).resetAndCall({});};
  return <div aria-label="已生效的筛选条件" className="flex flex-wrap items-center gap-2 py-2 text-xs"><span className="text-default-500">筛选</span>{chips.map(chip=><button type="button" key={chip.key} aria-label={`移除筛选：${chip.label}`} onClick={()=>remove(chip.patch)} className="flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary hover:bg-primary/20">{chip.label}<Icon icon="tabler:x" width={13}/></button>)}<button type="button" className="px-1 py-1 text-default-500 hover:text-foreground" onClick={()=>remove(clearedFilters)}>清空筛选</button></div>;
});
