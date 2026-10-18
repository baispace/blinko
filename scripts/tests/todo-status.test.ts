import {it,expect} from 'bun:test';
import {getTodoStatus,todoStatusPatch,readTodoStatuses,todoStatusSchema,defaultTodoStatuses} from '../../shared/lib/todoStatus';
import {groupTodos} from '../../shared/lib/todoGrouping';
it('derives legacy tasks and completed state consistently',()=>{
 expect(getTodoStatus({})).toBe('todo');expect(getTodoStatus({metadata:{snoozeCount:2}})).toBe('delayed');expect(getTodoStatus({metadata:{taskStatus:'doing'}})).toBe('doing');expect(getTodoStatus({isArchived:true,metadata:{taskStatus:'doing'}})).toBe('done');expect(getTodoStatus({isArchived:false,metadata:{taskStatus:'done'}})).toBe('todo');
});
it('moving into and out of completed updates the canonical completion flag',()=>{expect(todoStatusPatch('done')).toEqual({isArchived:true,metadata:{taskStatus:'done'}});expect(todoStatusPatch('doing')).toEqual({isArchived:false,metadata:{taskStatus:'doing'}});});
it('custom states remain separate and empty columns are available for dragging',()=>{const statuses=[...defaultTodoStatuses,{id:'review',name:'待评审',color:'#ff0000'}];const groups=groupTodos([{id:1,metadata:{taskStatus:'review'}},{id:2,isArchived:true}],'status',undefined,true,statuses);expect(groups.find(g=>g.key==='review')!.items.map(t=>t.id)).toEqual([1]);expect(groups.find(g=>g.key==='done')!.items.map(t=>t.id)).toEqual([2]);expect(groups.find(g=>g.key==='doing')!.items).toEqual([]);});
it('keeps basic states and rejects duplicate IDs',()=>{expect(todoStatusSchema.safeParse(defaultTodoStatuses.filter(s=>s.id!=='done')).success).toBe(false);expect(todoStatusSchema.safeParse([...defaultTodoStatuses,defaultTodoStatuses[0]]) .success).toBe(false);expect(readTodoStatuses(null)).toEqual(defaultTodoStatuses);});
