import {useState} from 'react';
import {Button,Input,Modal,ModalContent,ModalHeader,ModalBody,ModalFooter} from '@heroui/react';
import {readTodoStatuses,todoStatusSchema,type TodoStatus} from '@shared/lib/todoStatus';
import {RootStore} from '@/store';
import {BlinkoStore} from '@/store/blinkoStore';
import {api} from '@/lib/trpc';
export function TodoStatusSettings({onClose}:{onClose:()=>void}){
 const blinko=RootStore.Get(BlinkoStore);
 const [items,setItems]=useState<TodoStatus[]>(()=>readTodoStatuses(blinko.config.value?.todoStatuses).map(s=>({...s})));
 const [saving,setSaving]=useState(false);const [error,setError]=useState('');
 const save=async()=>{const valid=todoStatusSchema.safeParse(items);if(!valid.success){setError('请填写状态名称并保留基础状态');return;}setSaving(true);try{await api.config.update.mutate({key:'todoStatuses',value:valid.data});blinko.config.value={...blinko.config.value,todoStatuses:valid.data};onClose();}catch{setError('保存失败，请重试');}finally{setSaving(false);}};
 return <Modal isOpen onClose={()=>{if(!saving)onClose();}} size="md" scrollBehavior="inside"><ModalContent><ModalHeader>管理任务状态</ModalHeader><ModalBody><p className="text-xs leading-5 text-default-500">可修改名称和颜色，或添加自己的工作阶段。“已完成”用于完成任务；其余状态均为未完成。</p>{items.map((item,index)=><div key={item.id} className="flex items-center gap-2"><input aria-label={`${item.name}的颜色`} type="color" value={item.color} onChange={e=>setItems(v=>v.map((s,i)=>i===index?{...s,color:e.target.value}:s))} className="size-8 shrink-0 cursor-pointer rounded border-0 bg-transparent"/><Input aria-label={`状态名称${index+1}`} value={item.name} maxLength={16} size="sm" onValueChange={name=>setItems(v=>v.map((s,i)=>i===index?{...s,name}:s))}/></div>)}<Button variant="light" size="sm" isDisabled={items.length>=20} onPress={()=>setItems(v=>[...v,{id:crypto.randomUUID(),name:'新状态',color:'#8b5cf6'}])}>＋ 添加状态</Button>{error&&<p role="alert" className="text-sm text-danger">{error}</p>}</ModalBody><ModalFooter><Button variant="light" isDisabled={saving} onPress={onClose}>取消</Button><Button color="primary" isLoading={saving} onPress={()=>void save()}>保存状态</Button></ModalFooter></ModalContent></Modal>;
}
