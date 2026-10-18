import {it,expect} from 'bun:test';
import {todoPageInput,getTodoPage} from '../../server/lib/todoPages';
it('applies saved view constraints before pagination and hashes long search cursors',async()=>{
 const queries:any[]=[];
 const db:any={$queryRaw:async(q:any)=>{queries.push(q);return [];}};
 await getTodoPage(todoPageInput.parse({withCounts:false,view:{scope:'week',status:'pending',sort:'due'},searchText:'a'.repeat(1000)}),123,db);
 const q=queries[0];const sql=q.strings.join('?');
 expect(sql).toContain('NOT "isArchived"');
 expect(sql).toContain("date_trunc('week'");
 expect(sql.indexOf('NOT "isArchived"')).toBeLessThan(sql.indexOf('LIMIT'));
 expect(sql).toContain('COALESCE(extract(epoch FROM due)');
 expect(q.values).toContain(123);
});
it('completed view selects archived tasks and important view uses normalized priority',async()=>{
 for(const [scope,fragment] of [['done','"isArchived"'],['important','rank <= 1']] as const){
  let sql='';const db:any={$queryRaw:async(q:any)=>{sql=q.strings.join('?');return [];}};
  await getTodoPage(todoPageInput.parse({withCounts:false,view:{scope,status:scope==='done'?'done':'pending',sort:'priority'}}),123,db);
  expect(sql).toContain(fragment);
 }
});
it('combines priority, all-tag match, attachments and inclusive date bounds before paging',async()=>{
 let query:any;const db:any={$queryRaw:async(q:any)=>{query=q;return [];}};
 await getTodoPage(todoPageInput.parse({withCounts:false,view:{scope:'all',status:'pending',sort:'due',priorities:['in','un'],tagIds:[4,9],tagMatch:'all',attachment:'no',dueMode:'range',dueFrom:'2026-10-18',dueTo:'2026-10-20'}}),123,db);
 const sql=query.strings.join('?');expect(sql).toContain('count(DISTINCT nt."tagId")');expect(sql).toContain('NOT EXISTS (SELECT 1 FROM attachments');expect(sql).toContain('rank IN');expect(sql).toContain("interval '1 day'");expect(query.values).toContain('2026-10-20');expect(query.values).toContain('Asia/Shanghai');
});
it('missing due date and overdue filters have distinct null/completion behavior',async()=>{
 for(const mode of ['none','overdue']){let query:any;const db:any={$queryRaw:async(q:any)=>{query=q;return [];}};await getTodoPage(todoPageInput.parse({withCounts:false,view:{scope:'all',status:'all',sort:'due',dueMode:mode}}),123,db);expect(query.strings.join('?')).toContain(mode==='none'?'due IS NULL':'NOT "isArchived" AND due <');}
});
it('supports every relative calendar period in the selected timezone',async()=>{
 for(const mode of ['today','tomorrow','yesterday','week','lastWeek','nextWeek','month','lastMonth','nextMonth']){
  let q:any;const db:any={$queryRaw:async(v:any)=>{q=v;return [];}};
  await getTodoPage(todoPageInput.parse({withCounts:false,timezone:'Asia/Shanghai',view:{scope:'all',status:'all',sort:'due',dueMode:mode}}),123,db);
  expect(q.strings.join('?')).toContain('date_trunc(');expect(q.values).toContain('Asia/Shanghai');expect(q.values).toContain(mode.includes('Week')||mode==='week'?'1 week':mode.includes('Month')||mode==='month'?'1 month':'1 day');
 }
});
it('all six sort fields support both directions and nulls are explicitly last',async()=>{
 for(const sort of ['start','due','created','updated','completed','priority'])for(const direction of ['asc','desc']){
  let q:any;const db:any={$queryRaw:async(v:any)=>{q=v;return [];}};await getTodoPage(todoPageInput.parse({withCounts:false,view:{scope:'all',status:'all',sort,direction,statusIds:['doing']}}),123,db);
  expect(q.values).toContain(direction==='asc'?1:-1);expect(q.strings.join('?')).toContain('state IN');if(sort!=='priority')expect(q.strings.join('?')).toContain('IS NULL)::int::double precision AS s1');
 }
});
