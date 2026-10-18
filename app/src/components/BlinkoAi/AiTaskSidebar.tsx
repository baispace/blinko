import {observer} from 'mobx-react-lite';
import {Tooltip} from '@heroui/react';
import {RootStore} from '@/store';
import {useNavigate, useLocation} from 'react-router-dom';
import {AiStore} from '@/store/aiStore';
import {Icon} from '@/components/Common/Iconify/icons';



/** Stable navigation actions; task forms and task history live in the panel. */
export const AiTaskSidebar=observer(({compact,onSelect}:{compact?:boolean;onSelect?:()=>void})=>{
 const navigate=useNavigate();
 const location=useLocation();
 const ai=RootStore.Get(AiStore);
 const items=[
  {label:'新建对话',icon:'hugeicons:edit-02',color:'text-primary',disabled:ai.isAnswering||ai.isPreparing||ai.currentConversation.loading.value,action:()=>{ai.newChat();navigate('/ai');}},
  {label:'定时任务',icon:'lucide:alarm-clock',color:'text-amber-600 dark:text-amber-400',disabled:false,action:()=>navigate('/ai/tasks')},
 ];
 return <nav aria-label="对话快捷操作" className="flex flex-col gap-0.5">{items.map(item=><Tooltip key={item.label} content={item.label} isDisabled={!compact} placement="right" delay={300}><button type="button" aria-label={item.label} aria-current={item.label==='定时任务' && location.pathname.startsWith('/ai/tasks')?'page':undefined} disabled={item.disabled} onClick={()=>{item.action();onSelect?.();}} className={`flex items-center gap-2.5 rounded-md py-[7px] text-sm font-medium text-foreground transition-colors hover:bg-hover aria-[current=page]:bg-default-100 focus-visible:outline-primary disabled:opacity-40 ${compact?'mx-auto size-10 justify-center':'w-full px-3 text-left'}`}><Icon icon={item.icon} width={20} height={20} className={`shrink-0 ${item.color}`}/>{!compact&&<span className="truncate">{item.label}</span>}</button></Tooltip>)}</nav>;
});
