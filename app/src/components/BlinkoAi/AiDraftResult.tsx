import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import Editor from '@/components/Common/Editor';
import { NoteType } from '@shared/lib/types';
import { observer } from 'mobx-react-lite';

const stripTags = (text: string) => text.replace(/(?<!:\/\/)(?<=\s|^)#[^\s#]+(?=\s|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();

export function parseDraft(content: string) {
  try {
    const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const value = JSON.parse(clean.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? clean);
    if (value.kind === 'note' && typeof value.title === 'string' && typeof value.content === 'string') return value;
    if (value.kind === 'tasks' && Array.isArray(value.tasks) && value.tasks.length <= 100 && value.tasks.every(t => typeof t.title === 'string' && typeof t.description === 'string' && (!t.due || /^\d{4}-\d{2}-\d{2}$/.test(t.due)))) return value;
  } catch {}
  return null;
}
export const AiDraftResult = observer(function AiDraftResult({ draft, messageId, initialSaved = {} }: { draft: any; messageId: number; initialSaved?: Record<string, number> }) {
  const blinko = RootStore.Get(BlinkoStore);
  useEffect(() => { void blinko.tagList.call(); }, []);
  const [items, setItems] = useState(() => draft.kind === 'note' ? [{ title: draft.title, content: stripTags(draft.content), due: '', priority: '', tags: [] as string[], selected: true }] : draft.tasks.map(t => ({ title: t.title, content: stripTags(t.description), due: t.due ? t.due.slice(0, 16) + (t.due.length === 10 ? 'T23:59' : '') : '', priority: ['ui','in','un','nn'].includes(t.priority) ? t.priority : '', tags: [] as string[], selected: true })));
  const [saved, setSaved] = useState<Record<string, number>>(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = (index: number, patch: any) => setItems(previous => previous.map((item, i) => i === index ? { ...item, ...patch } : item));
  const pending = items.map((item, index) => ({ ...item, index })).filter(item => item.selected && !saved[item.index]);
  return <div className="space-y-3 my-3">
    <p className="text-sm font-medium">{draft.kind === 'note' ? '笔记草稿 · 编辑后保存' : '待办草稿 · 勾选后创建'}</p>
    {!items.length && <p className="text-sm text-default-500">没有提取到明确的待办，可以补充内容后再试。</p>}
    {items.map((item, index) => <div key={index} className="rounded-xl border border-default-200 p-3 space-y-2">
      {saved[index] ? <div className="flex justify-between text-sm"><span>已保存 · {item.title}</span><Link className="text-primary" to={`/detail?id=${saved[index]}`}>打开{draft.kind === 'note' ? '笔记' : '待办'}</Link></div> : <>
        <div className="flex gap-2 items-center">{draft.kind === 'tasks' && <input type="checkbox" aria-label={`选择 ${item.title}`} checked={item.selected} disabled={busy} onChange={e => edit(index, { selected: e.target.checked })} />}<input aria-label="标题" disabled={busy} value={item.title} onChange={e => edit(index, { title: e.target.value })} className="w-full bg-transparent font-medium outline-none" /></div>
        {draft.kind === 'tasks' && <label className="flex gap-2 items-center text-xs text-default-500">截止时间<input type="datetime-local" aria-label="截止时间" disabled={busy} value={item.due} onChange={e => edit(index, { due: e.target.value })} className="bg-transparent" /><span>{!item.due && '未提供'}</span></label>}
        {draft.kind === 'tasks' && <label className="flex gap-2 text-xs text-default-500">优先级<select aria-label="优先级" disabled={busy} value={item.priority} onChange={e => edit(index, { priority: e.target.value })} className="bg-transparent"><option value="">待确认</option><option value="ui">紧急且重要</option><option value="in">重要不紧急</option><option value="un">紧急不重要</option><option value="nn">普通</option></select></label>}
        <div className="flex flex-wrap gap-2 text-xs"><span className="text-default-500">站点标签：</span>{blinko.tagList.value?.pathTags?.map(tag => <label key={tag} className="flex items-center gap-1"><input type="checkbox" disabled={busy} checked={item.tags.includes(tag)} onChange={e => edit(index, { tags: e.target.checked ? [...item.tags, tag] : item.tags.filter(t => t !== tag) })} />{tag}</label>)}{!blinko.tagList.value?.pathTags?.length && <span className="text-default-400">暂无标签</span>}</div>
        {draft.kind === 'note' ? <Editor mode="edit" content={item.content} onChange={content => edit(index, { content })} onSend={async () => {}} hiddenToolbar hideNoteTypeButton hideFullscreenButton focusOnMount={false} editable={!busy} fixedNoteType={NoteType.BLINKO} /> : <textarea aria-label={draft.kind === 'note' ? '笔记正文' : '任务描述'} disabled={busy} value={item.content} onChange={e => edit(index, { content: e.target.value })} rows={draft.kind === 'note' ? 12 : 4} className="w-full bg-transparent text-sm resize-y outline-none" />}
      </>}
    </div>)}
    {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    {!!pending.length && <button type="button" disabled={busy || pending.some(t => !t.title.trim())} onClick={async () => {
      setBusy(true); setError('');
      try { const result = await api.ai.saveDraft.mutate({ messageId, drafts: pending.map(({ index, title, content, due, priority, tags }) => ({ index, title, content, due: due ? new Date(due).toISOString() : '', priority, tags })) }); setSaved(result as Record<string, number>); RootStore.Get(BlinkoStore).refreshData(); }
      catch { setError('保存失败，未完成的条目可以重试。'); }
      finally { setBusy(false); }
    }} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm disabled:opacity-50 transition-opacity">{busy ? '正在保存…' : draft.kind === 'note' ? '保存为笔记' : `创建选中的 ${pending.length} 个待办`}</button>}
  </div>;
});
