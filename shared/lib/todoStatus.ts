import {z} from 'zod';
export const todoStatusSchema=z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),name:z.string().trim().min(1).max(16),color:z.string().regex(/^#[0-9a-fA-F]{6}$/)})).min(3).max(20).superRefine((items,ctx)=>{if(new Set(items.map(s=>s.id)).size!==items.length||!['todo','delayed','done'].every(id=>items.some(s=>s.id===id)))ctx.addIssue({code:z.ZodIssueCode.custom,message:'需保留待办、延期、完成三个基础状态'});});
export type TodoStatus=z.infer<typeof todoStatusSchema>[number];
export const defaultTodoStatuses:TodoStatus[]=[{id:'todo',name:'待办',color:'#94a3b8'},{id:'doing',name:'进行中',color:'#3b82f6'},{id:'delayed',name:'延期',color:'#f59e0b'},{id:'done',name:'已完成',color:'#22c55e'}];
export function readTodoStatuses(value:unknown){const result=todoStatusSchema.safeParse(value);return result.success?result.data:defaultTodoStatuses;}
export function getTodoStatus(task:{isArchived?:boolean;metadata?:any}):string {if(task.isArchived)return 'done';if(task.metadata?.taskStatus&&task.metadata.taskStatus!=='done')return task.metadata.taskStatus;return Number(task.metadata?.snoozeCount)>0?'delayed':'todo';}
export function todoStatusPatch(id:string){return {isArchived:id==='done',metadata:{taskStatus:id}};}
