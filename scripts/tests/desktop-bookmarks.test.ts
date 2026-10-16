import { expect,test } from 'bun:test';
import { bookmarkTitle, decodeDesktopBookmarks, desktopBookmarkKey } from '../../app/src/lib/desktopBookmarkData';
test('desktop bookmarks are isolated by account and server, with normalized endpoints',()=>{
  expect(desktopBookmarkKey('"https://ink.baispace.cn/"','1')).toBe(desktopBookmarkKey('https://ink.baispace.cn','1'));
  expect(desktopBookmarkKey('https://ink.baispace.cn','1')).not.toBe(desktopBookmarkKey('https://ink.baispace.cn','2'));
  expect(desktopBookmarkKey('https://ink.baispace.cn','1')).not.toBe(desktopBookmarkKey('https://other.example','1'));
});
test('corrupt, duplicate and invalid bookmarks do not break the account menu',()=>{
  expect(decodeDesktopBookmarks('broken')).toEqual([]);
  expect(decodeDesktopBookmarks('{}')).toEqual([]);
  expect(decodeDesktopBookmarks(JSON.stringify([null,{id:0,title:'bad'},{id:1,title:'a'},{id:1,title:'duplicate'},{id:2,title:2}]))).toEqual([{id:1,title:'a'}]);
  expect(decodeDesktopBookmarks(JSON.stringify(Array.from({length:110},(_,id)=>({id:id+1,title:'x'.repeat(100)}))))).toHaveLength(100);
  expect(decodeDesktopBookmarks('[{"id":1,"title":"'+'x'.repeat(100)+'"}]')[0]?.title).toHaveLength(60);
});
test('bookmark titles preserve a compact first line without formatting markers',()=>{
  expect(bookmarkTitle('# 今日想法\n第二行')).toBe('今日想法');
  expect(bookmarkTitle('<p>跨应用记录</p>')).toBe('跨应用记录');
  expect(bookmarkTitle('   ')).toBe('未命名闪念');
});

test('closing waits for pending save and never rewrites a clean document',async()=>{
  const {settleBeforeClose}=await import('../../app/src/components/BlinkoEditor/settleBeforeClose');
  let dirty=true,writeCount=0;
  expect(await settleBeforeClose({flush:async()=>{dirty=false;},isDirty:()=>dirty,save:async()=>{writeCount++;return true;}})).toBe(true);
  expect(writeCount).toBe(0);
});
test('failed saves prevent close and dirty drafts can be retried',async()=>{
  const {settleBeforeClose}=await import('../../app/src/components/BlinkoEditor/settleBeforeClose');
  expect(await settleBeforeClose({flush:async()=>{},isDirty:()=>true,save:async()=>false})).toBe(false);
  expect(await settleBeforeClose({flush:async()=>{},isDirty:()=>true,save:async()=>true})).toBe(true);
  expect(await settleBeforeClose({flush:async()=>{throw Error('offline');},isDirty:()=>true,save:async()=>true})).toBe(false);
});
