import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { api } from '@/lib/trpc';

type Published = Awaited<ReturnType<typeof api.notes.publicPublishedDetail.mutate>>['data'];
// This reader deliberately has no draft editor, backlink lookup, author-profile
// lookup or file-token handling. Raw editor HTML is reduced to semantic markup.
const elements = ['p','div','section','span','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','b','i','u','s','del','blockquote','pre','code','br','hr','a','img','table','thead','tbody','tr','th','td','sup','sub'];
export default function PublishedNotePage() {
  const { id } = useParams();
  const [data, setData] = useState<Published>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(false); setData(null);
    api.notes.publicPublishedDetail.mutate({ publishId: id || '' }).then(res => { if (active) setData(res.data); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, request]);
  // Recheck on focus: an open reader must not keep treating withdrawn content as current.
  useEffect(() => { const refresh = () => setRequest(n => n + 1); addEventListener('focus', refresh); return () => removeEventListener('focus', refresh); }, []);
  return <main className="min-h-dvh bg-background px-5 py-8 text-foreground sm:px-8">
    <div className="mx-auto max-w-3xl"><header className="mb-8 border-b border-default-200 pb-4"><span className="text-lg font-semibold">Ink</span><span className="ml-3 text-xs text-default-500">公开文章</span></header>
      {loading ? <p role="status" className="text-default-500">正在加载文章…</p> : error ? <div role="alert"><h1 className="text-xl font-semibold">暂时无法加载</h1><button className="mt-3 text-primary" onClick={() => setRequest(n => n + 1)}>重试</button></div> : !data ? <div><h1 className="text-xl font-semibold">文章未公开或已撤回</h1><p className="mt-3 text-sm text-default-500">该链接当前无法访问。</p></div> : <>
        <p className="mb-6 text-xs text-default-500">公开版本 {data.metadata?.publicationRevision} · 更新于 {new Date(data.updatedAt).toLocaleString()}</p>
        <article className="markdown-body break-words [&_img]:max-w-full [&_table]:block [&_table]:overflow-x-auto [&_pre]:overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} allowedElements={elements} urlTransform={url => /^https?:\/\//i.test(url) ? url : ''} components={{ a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span> }}>{data.content}</ReactMarkdown>
        </article>
      </>}
    </div>
  </main>;
}
