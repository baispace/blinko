import {describe,it,expect} from 'bun:test';
import {defaultTodoViews,readTodoWorkspace,todoWorkspaceSchema,todoWorkspaceOutputSchema} from '../../shared/lib/todoViews';
import {groupTodos} from '../../shared/lib/todoGrouping';
describe('saved task views',()=>{
 it('recovers safely from invalid preferences',()=>{expect(readTodoWorkspace(null).activeId).toBe('all');expect(readTodoWorkspace({views:[],activeId:'missing'}).views.length).toBe(6);});
 it('requires unique IDs and an existing active view',()=>{
  expect(todoWorkspaceSchema.safeParse({views:[defaultTodoViews[0],defaultTodoViews[0]],activeId:'all'}).success).toBe(false);
  expect(todoWorkspaceSchema.safeParse({views:defaultTodoViews,activeId:'missing'}).success).toBe(false);
 });
 it('round trips independently configured named views',()=>{const views=defaultTodoViews.map(v=>({...v}));views[0]!.sort='updated';const restored=readTodoWorkspace({views,activeId:'board'});expect(restored.activeId).toBe('board');expect(restored.views[0]!.sort).toBe('updated');expect(restored.views[1]!.sort).toBe('priority');expect(defaultTodoViews[0]!.sort).toBe('due');});
 it('preserves server ordering inside groups',()=>{const tasks=[{id:1,metadata:{}},{id:2,metadata:{priority:1}}];expect(groupTodos(tasks,'none',undefined,true)[0]!.items.map(t=>t.id)).toEqual([1,2]);});
});
it('rejects inverted and missing date ranges',()=>{
 const base=defaultTodoViews[0]!;
 expect(todoWorkspaceSchema.safeParse({version:4,activeId:'all',views:[{...base,dueMode:'range'}]}).success).toBe(false);
 expect(todoWorkspaceSchema.safeParse({version:4,activeId:'all',views:[{...base,dueMode:'range',dueFrom:'2026-10-21',dueTo:'2026-10-18'}]}).success).toBe(false);
 expect(todoWorkspaceSchema.safeParse({version:4,activeId:'all',views:[{...base,dueMode:'range',dueFrom:'2026-02-30'}]}).success).toBe(false);
 expect(todoWorkspaceSchema.safeParse({version:4,activeId:'all',views:[{...base,dueMode:'range',dueTo:'2026-10-18'}]}).success).toBe(true);
});
it('preserves all differentiated view conditions and visible fields',()=>{
 const configured={...defaultTodoViews[0]!,priorities:['ui','in'],tagIds:[1,2],tagMatch:'all',dueMode:'none',attachment:'yes',fields:['due','created']};
 const restored=readTodoWorkspace({version:4,activeId:'all',views:[configured]}).views[0]!;
 expect(restored.tagIds).toEqual([1,2]);expect(restored.priorities).toEqual(['ui','in']);expect(restored.attachment).toBe('yes');expect(restored.fields).toEqual(['due','created']);
});
describe('坏配置不能被静默写回覆盖用户数据',()=>{
 const customId='8933c2bc-adaa-4b7c-8470-0c4941c71d3b';
 const dbRaw={version:4,views:[
  {...defaultTodoViews[0]!,id:'all',name:'全部任务'},
  {...defaultTodoViews[4]!,id:customId,name:'工作看板',layout:'board'},
  {id:'broken-probe',name:'坏视图',sort:'nonsense'},
 ],activeId:'all'};

 it('抢救时只丢弃非法视图，其余（含自建视图）保留',()=>{
  const rescued=readTodoWorkspace(dbRaw);
  expect(rescued.views.length).toBe(2);
  expect(rescued.views.some(v=>v.id===customId)).toBe(true);
  expect(rescued.broken).toBe(true);
 });
 it('输出校验不会把 broken 标记洗掉',()=>{
  // config.list 的 output schema 若用严格版 todoWorkspaceSchema，
  // zod 会 strip 未声明字段，守卫随之失效 —— 这里锁住这个行为。
  const rescued=readTodoWorkspace(dbRaw);
  const out=todoWorkspaceOutputSchema.safeParse(rescued);
  expect(out.success).toBe(true);
  expect(out.success&&out.data.broken).toBe(true);
 });
 it('客户端二次解析仍保留 broken（否则界面解锁 → 写回 → 数据丢失）',()=>{
  const onWire=todoWorkspaceOutputSchema.parse(readTodoWorkspace(dbRaw));
  const again=readTodoWorkspace(onWire);
  expect(again.broken).toBe(true);
  expect(again.views.length).toBe(2);
 });
 it('客户端二次解析仍保留 dropped（否则界面说不清到底少了什么）',()=>{
  const damaged={version:4,activeId:'all',views:[...defaultTodoViews.slice(0,1),{id:'bad',name:'坏视图',sort:'nonsense'}]};
  const onWire=todoWorkspaceOutputSchema.parse(readTodoWorkspace(damaged));
  const again=readTodoWorkspace(onWire);   // 走「已合法」分支，严格 schema 会剥掉 dropped
  expect(again.broken).toBe(true);
  expect(again.dropped).toEqual(['坏视图']);
 });
 it('正常配置不被误判为 broken',()=>{
  const good={version:4,views:defaultTodoViews.map(v=>({...v})),activeId:'all'};
  const rescued=readTodoWorkspace(good);
  expect(rescued.broken).toBeUndefined();
  expect(readTodoWorkspace(rescued).broken).toBeUndefined();
  expect(todoWorkspaceOutputSchema.safeParse(rescued).success).toBe(true);
 });
 it('全部视图都非法时退回默认值并标 broken',()=>{
  const dead=readTodoWorkspace({version:4,views:[{id:'a',sort:'nonsense'},{id:'b',sort:'yikes'}],activeId:'a'});
  expect(dead.views.length).toBe(6);
  expect(dead.broken).toBe(true);
 });
});

describe('从没配置过 ≠ 配置损坏',()=>{
 // 曾把这个分支也标成 broken，结果任何全新部署第一次打开待办页
 // 就弹出「配置读不出来」并锁死全部写入口，而库里其实一行配置都没有。
 for(const [label,input] of [
  ['undefined',undefined],
  ['null',null],
  ['空对象',{}],
  ['空视图数组',{version:4,views:[],activeId:'all'}],
 ] as const){
  it(`${label} → 给默认视图且不锁写`,()=>{
   const r=readTodoWorkspace(input);
   expect(r.views.length).toBe(6);
   expect(r.broken).toBeUndefined();
   expect(r.activeId).toBe('all');
  });
 }
 it('默认视图可写回，不会被守卫拦住',()=>{
  // 模拟 persist 的前置判断：broken 为假才允许写
  const r=readTodoWorkspace(undefined);
  expect(r.broken===true).toBe(false);
  expect(todoWorkspaceSchema.safeParse({version:4,activeId:r.activeId,views:r.views}).success).toBe(true);
 });
 it('报出被丢弃的视图名，界面才能说清少了什么',()=>{
  const r=readTodoWorkspace({version:4,activeId:'all',views:[
   {...defaultTodoViews[0]!,id:'all',name:'全部任务'},
   {id:'bad',name:'坏视图',sort:'nonsense'},
  ]});
  expect(r.broken).toBe(true);
  expect(r.dropped).toEqual(['坏视图']);
  expect(r.views.length).toBe(1);
 });
 it('dropped 能穿过输出校验不被剥掉',()=>{
  const r=readTodoWorkspace({version:4,activeId:'all',views:[{id:'bad',name:'坏视图',sort:'nonsense'},{...defaultTodoViews[0]!,id:'all'}]});
  const parsed=todoWorkspaceOutputSchema.safeParse(r);
  expect(parsed.success).toBe(true);
  expect(parsed.success&&parsed.data.dropped).toEqual(['坏视图']);
  expect(parsed.success&&parsed.data.broken).toBe(true);
 });
});
