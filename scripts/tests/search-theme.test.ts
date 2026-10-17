import { expect, test } from 'bun:test';
import { searchSnippet, tagPath } from '../../app/src/components/Layout/searchUtils';
import { hslChannels, syncHeroAccent } from '../../app/src/lib/themeAccent';

test('search summaries preserve a heading boundary and find late matches',()=>{
  expect(searchSnippet('# 项目标题\n\n正文内容','正文').title).toBe('项目标题');
  const content='标题\n'+'前文'.repeat(100)+'关键结论'+'后文'.repeat(100);
  expect(searchSnippet(content,'关键结论').summary).toContain('关键结论');
  expect(searchSnippet('- [x] 已完成任务','任务').title).toBe('已完成任务');
  expect(searchSnippet('[文档](https://example.com)','文档').title).toBe('文档');
});
test('tag paths stop at cycles and tolerate missing ancestors',()=>{
  const tags=[{id:1,name:'工作',parent:2},{id:2,name:'项目',parent:1}];
  expect(tagPath(tags[0],tags)).toBe('项目/工作');
  expect(tagPath({id:3,name:'孤立',parent:9},tags)).toBe('孤立');
});
test('app color formats convert to HeroUI HSL channels',()=>{
  expect(hslChannels('#fff')).toBe('0 0% 100%');
  expect(hslChannels('#000000')).toBe('0 0% 0%');
  expect(hslChannels('#ff0000')).toBe('0 100% 50%');
  expect(hslChannels('hsl(210 40% 98%)')).toBe('210 40% 98%');
  expect(hslChannels('hsl(210, 40%, 98%)')).toBe('210 40% 98%');
  expect(hslChannels('invalid')).toBeNull();
});
test('accent synchronization updates foreground and clears stale invalid values',()=>{
  const values=new Map([['--primary','#ff0000'],['--primary-foreground','#fff']]);
  const element={style:{getPropertyValue:(key:string)=>values.get(key)||'',setProperty:(key:string,value:string)=>values.set(key,value),removeProperty:(key:string)=>values.delete(key)}} as unknown as HTMLElement;
  syncHeroAccent(element);
  expect(values.get('--heroui-primary')).toBe('0 100% 50%');
  expect(values.get('--heroui-focus')).toBe('0 100% 50%');
  expect(values.get('--heroui-primary-foreground')).toBe('0 0% 100%');
  values.set('--primary','invalid');syncHeroAccent(element);
  expect(values.has('--heroui-primary')).toBe(false);
  expect(values.has('--heroui-focus')).toBe(false);
});
