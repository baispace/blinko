import { z } from 'zod';
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请选择有效日期').refine(value => { const date = new Date(value+'T00:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value; }, '日期无效');
export const todoConditionShape = {
 scope: z.enum(['all','today','week','important','done']).default('all'),
 statusIds: z.array(z.string().min(1).max(80)).max(30).default([]),
 status: z.enum(['pending','done','all']).default('all'),
 tagId: z.number().int().positive().nullable().optional(),
 tagIds: z.array(z.number().int().positive()).max(30).default([]),
 tagMatch: z.enum(['any','all']).default('any'),
 priorities: z.array(z.enum(['ui','in','un','nn'])).max(4).default([]),
 dueMode: z.enum(['any','today','tomorrow','yesterday','week','lastWeek','nextWeek','month','lastMonth','nextMonth','overdue','none','range']).default('any'),
 dueFrom: day.optional(), dueTo: day.optional(),
 attachment: z.enum(['any','yes','no']).default('any'),
};
const validateRange = (v: {dueMode:string;dueFrom?:string;dueTo?:string}, ctx:z.RefinementCtx) => {
 if(v.dueMode==='range' && !v.dueFrom && !v.dueTo) ctx.addIssue({code:z.ZodIssueCode.custom,message:'请设置至少一个截止日期边界',path:['dueFrom']});
 if(v.dueMode==='range' && v.dueFrom && v.dueTo && v.dueFrom>v.dueTo) ctx.addIssue({code:z.ZodIssueCode.custom,message:'结束日期不能早于开始日期',path:['dueTo']});
};
export const todoQuerySchema = z.object({...todoConditionShape,sort:z.enum(['start','due','created','updated','completed','priority']).default('due'),direction:z.enum(['asc','desc']).default('asc')}).superRefine(validateRange);
export type TodoQuery = z.infer<typeof todoQuerySchema>;
export const todoViewSchema = z.object({
 ...todoConditionShape,
 id: z.string().min(1).max(80), name: z.string().trim().min(1).max(24),
 layout: z.enum(['list','board']).default('list'),
 grouping: z.enum(['none','status','date','priority','tag']).default('none'),
 sort: z.enum(['start','due','created','updated','completed','priority']).default('due'),
 direction:z.enum(['asc','desc']).default('asc'),
 fields: z.array(z.enum(['status','start','priority','due','tags','created'])).max(6).default(['status','priority','due','tags']),
}).superRefine(validateRange);
export type TodoView = z.infer<typeof todoViewSchema>;
const workspaceShape = { version: z.literal(4).optional(), views: z.array(todoViewSchema).min(1).max(20), activeId: z.string().max(80) };
const refineWorkspace = (v:{views:TodoView[];activeId:string}, ctx:z.RefinementCtx) => {
 if (new Set(v.views.map(x=>x.id)).size !== v.views.length || !v.views.some(x=>x.id===v.activeId)) ctx.addIssue({code:z.ZodIssueCode.custom,message:'视图标识无效'});
};
export const todoWorkspaceSchema = z.object(workspaceShape).superRefine(refineWorkspace);
/**
 * 仅供 **输出**（config.list）使用。
 *
 * 与 todoWorkspaceSchema 的区别只在于显式声明了 `broken` / `dropped`：
 * zod 的 object 默认会剥掉未声明的字段，若输出侧用严格 schema，
 * readTodoWorkspace 抢救后带上的标记会被静默丢弃，前端因此不知道
 * 「这份配置有视图被丢弃过」，仍会照常写回并覆盖数据。这个守卫失效过一次，
 * 代价是用户自建的视图被永久覆盖。
 */
export const todoWorkspaceOutputSchema = z.object({ ...workspaceShape, broken: z.boolean().optional(), dropped: z.array(z.string()).optional() }).superRefine(refineWorkspace);
export const defaultTodoViews: TodoView[] = [
 {id:'all',name:'全部任务',scope:'all',layout:'list',grouping:'none',sort:'due',status:'all'},
 {id:'today',name:'今天',scope:'today',layout:'list',grouping:'none',sort:'priority',status:'pending'},
 {id:'week',name:'本周',scope:'week',layout:'list',grouping:'date',sort:'due',status:'pending'},
 {id:'important',name:'优先处理',scope:'important',layout:'list',grouping:'priority',sort:'priority',status:'pending'},
 {id:'board',name:'看板',scope:'all',layout:'board',grouping:'status',sort:'priority',status:'all'},
 {id:'done',name:'已完成',scope:'done',layout:'list',grouping:'none',sort:'updated',status:'done'},
].map(v=>todoViewSchema.parse(v));
/**
 * 读取待办视图配置。
 *
 * `broken` 只表示「**存过**一份配置、但里面读不出东西」，调用方**必须**据此禁用写回。
 * 原因：兜底默认值看起来完全正常，用户不会察觉异常；而任何一次「改排序 / 改筛选」
 * 都会把这份默认值 PUT 回服务端，把用户自建的视图永久覆盖掉
 * （曾真实发生过：自建的看板视图被 6 个默认视图替换）。
 *
 * ⚠️ 「从没存过配置」**不是** broken —— 那是全新用户的正常状态，
 * 给一份可编辑的默认视图即可。曾把这个分支也标成 broken，
 * 结果任何全新部署第一次打开待办页就弹出「配置读不出来」并锁死全部写入口。
 */
export type TodoWorkspace = {version:4;views:TodoView[];activeId:string;broken?:boolean;dropped?:string[]};
export function readTodoWorkspace(value: unknown):TodoWorkspace {
 const raw = value as any;
 const migrated = Array.isArray(raw?.views) && raw.version !== 4 ? {...raw,version:4,views:raw.views.map((v:any)=>{
  if(!v || typeof v!=='object')return v;
  const next={...v,direction:v.direction||(['updated','completed'].includes(v.sort)?'desc':'asc')};
  if(v.id==='all'){if(raw.version!==3)Object.assign(next,{name:'全部任务',grouping:'none',status:'all'});next.fields=[...new Set(['status',...(v.fields||['priority','due','tags'])])];}
  if(v.id==='board')Object.assign(next,{grouping:'status',status:'all'});
  return next;
 })} : value;
 const result = todoWorkspaceSchema.safeParse(migrated);
 // 已合法时把上游的标记透传下去。
 // 服务端 getGlobalConfig 已经先抢救过一次并打好 broken/dropped，前端再跑一遍
 // readTodoWorkspace 会命中这个「成功」分支；而 todoWorkspaceSchema 是严格版，
 // zod 会把未声明的 broken/dropped 剥掉 —— 不显式带过去，守卫就被第二次解析洗掉了：
 // 界面解锁 → 用户改一次排序 → 兜底默认值写回 → 被丢弃的视图彻底没了。
 if(result.success) return {
  ...result.data,
  ...(raw?.broken===true?{broken:true}:{}),
  ...(Array.isArray(raw?.dropped)&&raw.dropped.length?{dropped:raw.dropped as string[]}:{}),
 };
 // 逐个视图抢救：多半只是某一个视图的字段不合法，不该连累其他视图整体退回默认。
 // 只要有视图能救就用救回来的这份；只有「一个都救不回来」才退回默认。
 if(migrated && typeof migrated==='object' && Array.isArray((migrated as any).views)){
  const all=(migrated as any).views;
  // 一次解析同时拿到「救回来的」和「被丢弃的」，避免为算 dropped 再跑一遍 safeParse
  const checked=all.map((v:any)=>{const one=todoViewSchema.safeParse(v);return one.success?one.data:null});
  const views=checked.filter(Boolean) as TodoView[];
  if(views.length){
   const activeId=views.some(v=>v.id===(migrated as any).activeId)?(migrated as any).activeId:views[0]!.id;
   // 真的丢掉过视图才标 broken —— 这种情况下写回会把丢掉的视图彻底抹掉。
   // dropped 带上被丢弃的视图名，界面才能告诉用户「到底少了什么」，
   // 而不是笼统地说「配置读不出来」，让人无从下手。
   const dropped=all.filter((_:any,i:number)=>!checked[i]).map((v:any)=>typeof v?.name==='string'&&v.name?v.name:'未命名视图');
   return {version:4,views,activeId,broken:dropped.length>0,...(dropped.length?{dropped}:{})};
  }
 }
 // 走到这里说明没能救回任何视图。此时要分清两种情况：
 //  · 库里压根没有这份配置（undefined / null / {} / 空数组）
 //    —— 全新用户的正常状态，给默认视图并且**不标 broken**，否则第一次打开待办页就被锁死；
 //  · 库里有配置但一个视图都救不回来
 //    —— 真正的损坏，必须标 broken 拦住写回。
 const stored = migrated!=null && typeof migrated==='object' && Array.isArray((migrated as any).views) && (migrated as any).views.length>0;
 return {version:4 as const,views: defaultTodoViews.map(v=>({...v})), activeId:'all', ...(stored?{broken:true}:{})};
}
