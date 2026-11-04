import { useEffect, useState } from 'react';
import { Button } from '@heroui/react';
import { api } from '@/lib/trpc';
import { blogImageUrl } from '@/lib/blogImage';
import { confirmBlogAction } from './confirmBlogAction';

type Page = Awaited<ReturnType<typeof api.blog.managedMoments.query>>;
export function BlogMomentsPanel() {
  const [page,setPage]=useState<Page|null>(null);
  const [cursors,setCursors]=useState<(number|undefined)[]>([undefined]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setBusy(true);setError('');
    void api.blog.managedMoments.query({cursor:cursors.at(-1)}).then(value=>{if(active)setPage(value);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'加载失败');}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[cursors,revision]);
  const withdraw=async(id:number)=>{
    if(!await confirmBlogAction('撤回后动态不再公开展示，原闪念会保留。确定撤回？'))return;
    setBusy(true);setError('');
    try {await api.blog.momentPublish.mutate({noteId:id,published:false});setRevision(v=>v+1);}
    catch(e){setError(e instanceof Error?e.message:'撤回失败');setBusy(false);}
  };
  return <div className="space-y-4">
    <p className="rounded-2xl bg-primary-50 px-4 py-3 text-sm text-primary">已公开动态的编辑会立即同步到公开站。请在原闪念中编辑内容。</p>
    {error&&<div role="alert" className="text-sm text-danger">{error} <Button size="sm" variant="light" isDisabled={busy} onPress={()=>setRevision(v=>v+1)}>重试</Button></div>}
    {busy&&<p role="status" className="text-sm text-default-500">正在处理…</p>}
    {!busy&&!error&&page&&!page.items.length&&<p className="py-12 text-center text-sm text-default-500">暂无公开动态。在主站闪念菜单中选择“发布为动态”后，会显示在这里。</p>}
    <div aria-busy={busy} className="space-y-3">{page?.items.map(item=><article key={item.id} className="rounded-3xl border border-default-200/50 bg-content1 p-5 shadow-sm">
      <time className="text-xs text-default-500">{item.momentPublishedAt?new Date(item.momentPublishedAt).toLocaleString('zh-CN'):''}</time>
      <p className="my-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{item.content.slice(0,400)}{item.content.length>400?'…':''}</p>
      <div className="mb-3 flex flex-wrap gap-2">{item.attachments.filter(a=>a.type?.startsWith('image')).slice(0,4).map(a=><img key={a.id} src={blogImageUrl(a.path)} alt="动态图片" loading="lazy" className="h-20 w-20 rounded-xl object-cover"/>)}</div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="light" as="a" href={`/blog/moments#m${item.id}`} target="_blank" rel="noopener noreferrer">查看公开动态</Button>
        <Button size="sm" variant="flat" as="a" href={`/detail?id=${item.id}`} target="_blank" rel="noopener noreferrer">编辑原闪念</Button>
        <Button size="sm" variant="light" color="danger" isDisabled={busy} onPress={()=>void withdraw(item.id)}>撤回动态</Button>
      </div>
    </article>)}</div>
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="flat" isDisabled={busy||cursors.length===1} onPress={()=>setCursors(v=>v.slice(0,-1))}>上一页</Button>
      <Button size="sm" variant="flat" isDisabled={busy||!page?.nextCursor} onPress={()=>{if(page?.nextCursor)setCursors(v=>[...v,page.nextCursor!]);}}>下一页</Button>
    </div>
  </div>;
}
