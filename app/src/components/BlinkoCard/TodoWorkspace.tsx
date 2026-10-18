import {TodoStatusSettings} from './TodoStatusSettings';
import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Checkbox, CheckboxGroup, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, DropdownSection, Input, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem } from '@heroui/react';
import { readTodoWorkspace, todoViewSchema, todoQuerySchema, defaultTodoViews, type TodoView } from '@shared/lib/todoViews';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { TodoGroupedView } from './TodoGroupedView';
import { TodoViewConditions, todoConditionCount, SCOPE_LABELS } from './TodoViewConditions';

const sorts = {start:'开始时间',due:'截止时间',created:'创建时间',updated:'更新时间',completed:'完成时间',priority:'优先级'};
const directions = {asc:'升序',desc:'降序'};
const groups = {status:'任务状态',none:'无分组',date:'截止日期',priority:'优先级',tag:'标签'};
const fields = {status:'任务状态',start:'开始时间',priority:'优先级',due:'截止时间',tags:'标签',created:'创建时间'};
export const TodoWorkspace = observer(({composer}:{composer:React.ReactNode})=>{
 const blinko=RootStore.Get(BlinkoStore);
 const workspace=readTodoWorkspace(blinko.config.value?.todoWorkspace);
 // 配置读不出来时 workspace.broken=true，此刻界面显示的是兜底默认值。
 // 若还允许写入，用户随手改一次排序/筛选就会把默认值 PUT 回去，
 // 自建的视图被永久覆盖（已真实发生过）。所以这里直接锁死写入口。
 const broken=workspace.broken===true;
 const view=workspace.views.find(v=>v.id===workspace.activeId)!;
 const [statusSettings,setStatusSettings]=useState(false);
 const [panelOpen,setPanelOpen]=useState(false);
 const [panel,setPanel]=useState<'filter'|'settings'|'create'|null>(null);
 const [draft,setDraft]=useState<TodoView>(view);
 const [composerOpen,setComposerOpen]=useState(false);
 const [search,setSearch]=useState('');
 const [saving,setSaving]=useState(false);
 const savingRef=useRef(false);
 // 最后一次服务端确认的快照：失败时回滚到这里，而不是回滚到「本次调用时的旧值」
 // —— 排队期间读到的那份其实已经是乐观更新后的值，回滚它等于什么都没回滚。
 const committedRef=useRef(blinko.config.value?.todoWorkspace);
 const queuedRef=useRef<typeof workspace|null>(null);
 const [error,setError]=useState(false);
 const [resetting,setResetting]=useState(false);
 const [formError,setFormError]=useState('');
 const [confirmDelete,setConfirmDelete]=useState(false);
 const last=useRef('');
 const query=todoQuerySchema.parse(view);
 const signature=JSON.stringify([query,search]);
 useEffect(()=>{
  const timer=setTimeout(()=>{
   if(last.current===signature)return;
   last.current=signature;blinko.todoViewQuery=query;blinko.todoViewSearch=search;setError(false);
   void blinko.todoFeed.resetAndCall({}).catch(()=>setError(true));
  },search?250:0);
  return()=>clearTimeout(timer);
 },[signature,blinko]);
 useEffect(()=>()=>{blinko.todoViewQuery=undefined;blinko.todoViewSearch='';},[blinko]);
 // 先本地生效再串行落库：
 //  · 乐观更新让排序/顺序/分组切换是即时的，不会等一次网络往返；
 //  · 串行化保证连点时后到的改动会排队发出去，而不是被 savingRef 静默丢弃
 //    （旧实现直接 return false，用户点了排序再点顺序，第二下就没了）。
 const persist=async(next:typeof workspace)=>{
  if(broken)return false;
  blinko.config.value={...blinko.config.value,todoWorkspace:{...next,version:4 as const}};
  queuedRef.current=next;
  if(savingRef.current){setSaving(true);return true;}
  savingRef.current=true;setSaving(true);
  try{
   while(queuedRef.current){
    const pending=queuedRef.current;queuedRef.current=null;
    await api.config.update.mutate({key:'todoWorkspace',value:pending});
    committedRef.current={...pending,version:4 as const};
   }
   return true;
  }catch{
   const rolledBack=queuedRef.current;queuedRef.current=null;
   if(!rolledBack)blinko.config.value={...blinko.config.value,todoWorkspace:committedRef.current};
   RootStore.Get(ToastPlugin).error('视图保存失败，请重试');
   return false;
  }finally{savingRef.current=false;setSaving(false);}
 };
 // 始终基于最新已保存状态打补丁，避免连点时用上一帧的 workspace 覆盖掉前一次改动
 const update=(patch:Partial<TodoView>)=>{
  const latest=readTodoWorkspace(blinko.config.value?.todoWorkspace);
  const active=latest.views.find(v=>v.id===latest.activeId)!;
  return persist({...latest,views:latest.views.map(v=>v.id===active.id?{...v,...patch}:v)});
 };
 const open=(next:typeof panel)=>{setDraft({...view,id:next==='create'?crypto.randomUUID():view.id,name:next==='create'?'':view.name,statusIds:[...view.statusIds],tagIds:[...view.tagIds],priorities:[...view.priorities],fields:[...view.fields]});setConfirmDelete(false);setFormError('');setPanel(next);setPanelOpen(true);};
 // 显式覆盖：只在用户主动点「改用默认视图」时才绕过 broken 守卫写库。
 // 这是唯一一条能主动丢弃原配置的路径，所以做成显式动作而不是让它悄悄发生。
 const resetWorkspace=async()=>{
  if(resetting)return;
  if(!confirm(`这会用 ${defaultTodoViews.length} 个默认视图覆盖当前读不出来的待办视图配置，且不可撤销。确定继续吗？`))return;
  setResetting(true);
  try{
   const next={version:4 as const,views:defaultTodoViews.map(v=>({...v})),activeId:'all'};
   await api.config.update.mutate({key:'todoWorkspace',value:next});
   blinko.config.value={...blinko.config.value,todoWorkspace:next};
  }catch{RootStore.Get(ToastPlugin).error('重置失败，请重试');}
  finally{setResetting(false);}
 };
 const apply=async()=>{const parsed=todoViewSchema.safeParse(draft);if(!parsed.success){setFormError(parsed.error.issues[0]?.message||'请检查条件');return;}const next=panel==='create'?{...workspace,activeId:draft.id,views:[...workspace.views,parsed.data]}:{...workspace,views:workspace.views.map(v=>v.id===view.id?parsed.data:v)};if(await persist(next))setPanelOpen(false);};
 const menu=(label:string,icon:string,value:string,options:Record<string,string>,onSelect:(key:string)=>void,disabled=saving)=><Dropdown><DropdownTrigger><Button size="sm" variant="light" isDisabled={disabled||broken} className="gap-1.5 px-2 text-default-500" startContent={<Icon icon={icon} width={16} height={16}/>}>{label}：{options[value]}</Button></DropdownTrigger><DropdownMenu aria-label={label} selectionMode="single" selectedKeys={[value]} onAction={key=>onSelect(String(key))}>{Object.entries(options).map(([key,title])=><DropdownItem key={key}>{title}</DropdownItem>)}</DropdownMenu></Dropdown>;
 const feed=blinko.todoFeed;
 const count=todoConditionCount(view);
 return <div className="py-2">
  <div className="flex items-center gap-2 border-b border-default-200">
   <div className="flex min-w-0 flex-1 items-center overflow-x-auto" role="tablist" aria-label="待办视图" onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||saving)return;e.preventDefault();const index=workspace.views.findIndex(v=>v.id===view.id);const next=e.key==='Home'?0:e.key==='End'?workspace.views.length-1:(index+(e.key==='ArrowRight'?1:-1)+workspace.views.length)%workspace.views.length;void persist({...workspace,activeId:workspace.views[next]!.id});e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();}}>
    {workspace.views.map(v=><button type="button" key={v.id} role="tab" tabIndex={v.id===view.id?0:-1} aria-selected={v.id===view.id} disabled={saving} onClick={()=>void persist({...workspace,activeId:v.id})} className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm ${v.id===view.id?'border-primary text-primary':'border-transparent text-default-500 hover:text-foreground'}`}><Icon icon={v.layout==='board'?'tabler:layout-columns':'tabler:table'} width={16} height={16}/>{v.name}</button>)}
    <Button isIconOnly size="sm" variant="light" aria-label="添加视图" title="添加视图" isDisabled={broken||saving||workspace.views.length>=20} onPress={()=>open('create')}><Icon icon="tabler:plus" width={16} height={16}/></Button>
   </div>
  </div>
  <div className="flex flex-wrap items-center gap-1.5 py-3">
   <Button size="sm" color="primary" variant="flat" onPress={()=>setComposerOpen(true)} startContent={<Icon icon="tabler:plus" width={16} height={16}/>}>新建任务</Button>
   <Button size="sm" variant="light" isDisabled={broken} onPress={()=>open('filter')} className="text-default-500" startContent={<Icon icon="tabler:filter" width={16} height={16}/>}>筛选{count>0&&<span className="rounded bg-primary/10 px-1.5 text-xs text-primary">{count}</span>}</Button>
   {/* 排序字段与升降序合成一个控件：两件事本来就是一个决定，分成两个下拉反而要点两次 */}
   <Dropdown><DropdownTrigger><Button size="sm" variant="light" isDisabled={saving||broken} className="gap-1.5 px-2 text-default-500" startContent={<Icon icon="tabler:arrows-sort" width={16} height={16}/>} endContent={<Icon icon={view.direction==='asc'?'tabler:arrow-up':'tabler:arrow-down'} width={14} height={14}/>}>排序：{sorts[view.sort]} · {directions[view.direction]}</Button></DropdownTrigger><DropdownMenu aria-label="排序" selectionMode="single" selectedKeys={[view.sort]} onAction={key=>{if(String(key).startsWith('dir-'))return;void update({sort:key as TodoView['sort']});}}>
    <DropdownSection title="排序字段">{Object.entries(sorts).map(([key,title])=><DropdownItem key={key} startContent={<span className="w-4">{view.sort===key&&<Icon icon="tabler:check" width={13} height={13} className="text-primary"/>}</span>}>{title}</DropdownItem>)}</DropdownSection>
    <DropdownSection title="顺序">{Object.entries(directions).map(([key,title])=><DropdownItem key={`dir-${key}`} onAction={()=>void update({direction:key as 'asc'|'desc'})} startContent={<span className="w-4">{view.direction===key&&<Icon icon="tabler:check" width={13} height={13} className="text-primary"/>}</span>}>{title}</DropdownItem>)}</DropdownSection>
   </DropdownMenu></Dropdown>
   {menu('分组','tabler:layout-rows',view.grouping,groups,key=>void update({grouping:key as TodoView['grouping']}))}
   <Button size="sm" variant="light" isDisabled={broken} onPress={()=>setStatusSettings(true)} className="text-default-500">管理状态</Button>
   <Button size="sm" variant="light" isDisabled={broken} onPress={()=>open('settings')} className="text-default-500" startContent={<Icon icon="tabler:adjustments-horizontal" width={16} height={16}/>}>视图设置</Button>
   <Input aria-label="搜索任务" placeholder="搜索任务" value={search} onValueChange={setSearch} isClearable onClear={()=>setSearch('')} size="sm" variant="flat" startContent={<Icon icon="tabler:search" width={15} height={15}/>} className="ml-auto w-40" classNames={{inputWrapper:'h-8 min-h-8 bg-default-50 shadow-none'}}/>
  </div>
  {broken&&<div role="alert" className="mb-3 flex flex-wrap items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs leading-5 text-danger"><Icon icon="tabler:alert-triangle" width={15} height={15} className="mt-0.5 shrink-0"/><span className="min-w-0 flex-1">{workspace.dropped?.length
   // 告诉用户到底少了什么。笼统的「配置读不出来」让人无从下手，
   // 也没法判断是哪个视图需要修 —— 上一版提示里写的「在设置里清理」更是
   // 指向一个根本不存在的入口，已一并删掉。
   ? <>有 {workspace.dropped.length} 个视图因为字段不合法没能读出来（{workspace.dropped.join('、')}），当前显示的是其余 {workspace.views.length} 个。已暂停保存，避免把这份残缺配置写回去覆盖原数据。修好对应视图后刷新即可恢复。</>
   : <>待办视图配置读不出来，当前显示的是默认视图。已暂停保存，避免覆盖原数据。</>}
  <button type="button" disabled={resetting} onClick={()=>void resetWorkspace()} className="ml-1 font-medium underline underline-offset-2 disabled:opacity-50">{resetting?'重置中…':'改用默认视图（覆盖原配置）'}</button></span></div>}
  {count>0&&<div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-default-500"><span>已设 {count} 项条件</span>{view.scope!=='all'&&<span className="rounded bg-default-100 px-2 py-1">{SCOPE_LABELS[view.scope]}</span>}{view.status!=='all'&&<span className="rounded bg-default-100 px-2 py-1">{view.status==='pending'?'未完成':'已完成'}</span>}<button type="button" onClick={()=>open('filter')} className="text-primary">查看条件</button></div>}
  {error?<Button variant="light" onPress={()=>{setError(false);void feed.resetAndCall({}).catch(()=>setError(true));}}>加载失败，点击重试</Button>:feed.isLoading&&!feed.value?.length?<div role="status" className="py-16 text-center text-sm text-default-400">正在加载任务…</div>:<TodoGroupedView key={`${view.id}-${view.grouping}-${view.layout}`} tasks={feed.value||[]} mode={view.grouping} board={view.layout==='board'} fields={view.fields} preserveOrder/>}
  {!feed.isLoadAll&&!!feed.value?.length&&<div className="mt-3 text-center text-xs text-default-400">已加载 {feed.value.length} 项，分组数量随加载更新。<Button size="sm" variant="light" isLoading={feed.isLoading} onPress={()=>void blinko.onBottom()}>加载更多</Button></div>}
  <Button variant="light" className="mt-1 w-full justify-start text-default-400" onPress={()=>setComposerOpen(true)} startContent={<Icon icon="tabler:plus" width={16} height={16}/>}>新建任务</Button>
  {statusSettings&&<TodoStatusSettings onClose={()=>setStatusSettings(false)}/>}
  <Modal isOpen={composerOpen} onOpenChange={setComposerOpen} size="2xl" scrollBehavior="inside"><ModalContent><ModalHeader>新建任务</ModalHeader><ModalBody className="pb-5">{composer}</ModalBody></ModalContent></Modal>
  <Modal isOpen={panelOpen} onClose={()=>{if(!saving)setPanelOpen(false);}} isDismissable={!saving} size="2xl" scrollBehavior="inside"><ModalContent><ModalHeader>{panel==='filter'?'筛选任务':panel==='create'?'新建视图':'视图设置'}</ModalHeader><ModalBody className="gap-5">
   {panel!=='filter'&&<><Input autoFocus label="视图名称" labelPlacement="outside" placeholder="例如：本周重要事项" value={draft.name} maxLength={24} onValueChange={name=>setDraft(v=>({...v,name}))}/><div className="grid grid-cols-2 gap-3"><Select aria-label="视图布局" label="布局" labelPlacement="outside" size="sm" selectedKeys={[draft.layout]} disallowEmptySelection onChange={e=>setDraft(v=>({...v,layout:e.target.value as TodoView['layout']}))}><SelectItem key="list">列表</SelectItem><SelectItem key="board">看板</SelectItem></Select><Select aria-label="视图分组" label="分组" labelPlacement="outside" size="sm" selectedKeys={[draft.grouping]} disallowEmptySelection onChange={e=>setDraft(v=>({...v,grouping:e.target.value as TodoView['grouping']}))}>{Object.entries(groups).map(([key,title])=><SelectItem key={key}>{title}</SelectItem>)}</Select></div><Select aria-label="排序方向" label="顺序" labelPlacement="outside" size="sm" selectedKeys={[draft.direction]} disallowEmptySelection onChange={e=>setDraft(v=>({...v,direction:e.target.value as 'asc'|'desc'}))}><SelectItem key="asc">升序</SelectItem><SelectItem key="desc">降序</SelectItem></Select><Select aria-label="视图排序" label="排序" labelPlacement="outside" size="sm" selectedKeys={[draft.sort]} disallowEmptySelection onChange={e=>setDraft(v=>({...v,sort:e.target.value as TodoView['sort']}))}>{Object.entries(sorts).map(([key,title])=><SelectItem key={key}>{title}</SelectItem>)}</Select><CheckboxGroup label="展示字段" orientation="horizontal" size="sm" value={draft.fields} onValueChange={selected=>setDraft(v=>({...v,fields:selected as TodoView['fields']}))}>{Object.entries(fields).map(([key,title])=><Checkbox value={key} key={key}>{title}</Checkbox>)}</CheckboxGroup><h3 className="border-t border-default-200 pt-4 text-sm font-medium">筛选条件</h3></>}
   <TodoViewConditions value={draft} onChange={patch=>{setDraft(v=>({...v,...patch,...(patch.scope==='done'?{status:'done' as const}:{}),...(patch.status&&draft.scope==='done'?{scope:'all' as const}:{})}));setFormError('');}} tags={(blinko.tagList.value?.falttenTags||[]).map(tag=>({id:tag.id,name:tag.name}))}/>
   {formError&&<p role="alert" className="text-sm text-danger">{formError}</p>}
   {panel==='settings'&&<div className="flex justify-between border-t border-default-200 pt-4"><Button size="sm" variant="light" isDisabled={saving||workspace.views.length>=20} onPress={async()=>{const id=crypto.randomUUID();if(await persist({...workspace,activeId:id,views:[...workspace.views,{...view,id,name:view.name.slice(0,20)+' 副本'}]}))setPanelOpen(false);}}>复制视图</Button><Button size="sm" color="danger" variant="light" isDisabled={saving||workspace.views.length===1} onPress={async()=>{if(!confirmDelete){setConfirmDelete(true);return;}const views=workspace.views.filter(v=>v.id!==view.id);if(await persist({...workspace,views,activeId:views[0]!.id}))setPanelOpen(false);}}>{confirmDelete?'确认删除视图（保留任务）':'删除视图'}</Button></div>}
  </ModalBody><ModalFooter><Button variant="light" isDisabled={saving} onPress={()=>setPanelOpen(false)}>取消</Button><Button variant="flat" isDisabled={saving} onPress={()=>setDraft(v=>({...v,scope:'all',status:'all',statusIds:[],priorities:[],tagId:null,tagIds:[],tagMatch:'any',dueMode:'any',dueFrom:undefined,dueTo:undefined,attachment:'any'}))}>清除条件</Button><Button color="primary" isLoading={saving} onPress={()=>void apply()}>{panel==='create'?'创建视图':panel==='filter'?'应用并保存':'保存视图'}</Button></ModalFooter></ModalContent></Modal>
 </div>;
});
