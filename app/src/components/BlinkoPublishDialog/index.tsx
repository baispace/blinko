import { useEffect, useState } from 'react';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Note } from '@shared/lib/types';
import { Copy } from '../Common/Copy';

type Status = Awaited<ReturnType<typeof api.notes.publicationStatus.query>>;
export function BlinkoPublishDialog({ note }: { note: Note }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => { const next = await api.notes.publicationStatus.query({ id: note.id! }); setStatus(next); return next; };
  useEffect(() => { let active = true; api.notes.publicationStatus.query({ id: note.id! }).then(s => { if (active) setStatus(s); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [note.id]);
  const act = async (isCancel: boolean) => {
    if (!status || busy) return;
    setBusy(true); setError('');
    try {
      await api.notes.publishNote.mutate({ id: note.id!, isCancel, ...(!isCancel && { expectedUpdatedAt: status.draftUpdatedAt }) });
      await refresh();
      RootStore.Get(BlinkoStore).updateTicker++;
      RootStore.Get(ToastPlugin).success(isCancel ? '已撤回，公开链接已停止访问' : '已发布已保存的正文快照');
    } catch (e: any) {
      setError(e.message || '操作失败，请重试');
      try { await refresh(); } catch {}
    } finally { setBusy(false); }
  };
  const url = status?.publishId ? `${window.location.origin}/blog/${status.publishId}` : '';
  return <div className="flex flex-col gap-4 px-1 pb-2">
    <p className="text-sm leading-6 text-default-600">发布会生成一份公开正文。此后保存笔记只修改草稿，点击“更新发布”才会替换公开版本。</p>
    {error && <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger">{error}</p>}
    {!status ? <button type="button" className="text-sm text-primary" disabled={!error || busy} onClick={() => { setError(''); refresh().catch(e => setError(e.message)); }}>{error ? '重试加载发布状态' : '正在读取发布状态…'}</button> : <>
      <div className="rounded-xl border border-default-200 p-3 text-sm">
        <div className="flex items-center justify-between gap-2"><strong>{status.isPublished ? '已发布' : status.legacyPublished ? '需要重新确认发布' : '未公开'}</strong><span className="text-default-500">{status.revision > 0 ? `版本 ${status.revision}` : '首次发布'}</span></div>
        {status.legacyPublished && <p className="mt-2 text-default-600">旧发布没有独立快照，公开访问已暂停。请确认已保存正文后重新发布。</p>}
        {status.publishedUpdatedAt && <p className="mt-2 text-xs text-default-500">公开版本保存于 {new Date(status.publishedUpdatedAt).toLocaleString()}</p>}
        {status.isPublished && <p className="mt-2 text-default-600">{status.hasChanges ? '草稿有修改，公开版本保持不变。' : '已保存正文与公开版本一致。'}</p>}
      </div>
      <p className="text-xs leading-5 text-default-500">本轮只发布已保存正文，不包含私有标签、关联笔记和独立附件。站内图片暂不支持发布；未保存的编辑请先保存。{status.attachmentCount > 0 ? `当前 ${status.attachmentCount} 个独立附件不会公开。` : ''}</p>
      {status.isPublished && <div className="flex items-center gap-2 rounded-lg bg-default-100 px-3 py-2"><a className="min-w-0 flex-1 truncate text-sm text-primary" href={url} target="_blank" rel="noopener noreferrer">打开公开版本 ↗</a><Copy content={url} size={18} /></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-default-100 pt-3">
        <button type="button" disabled={busy} className="rounded-lg px-3 py-2 text-sm hover:bg-default-100 disabled:opacity-50" onClick={() => RootStore.Get(DialogStore).close()}>关闭</button>
        {(status.isPublished || status.legacyPublished) && <button type="button" disabled={busy} className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-50 disabled:opacity-50" onClick={() => act(true)}>撤回发布</button>}
        <button type="button" disabled={busy || !status.canPublish || (status.isPublished && !status.hasChanges)} className="ml-auto rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" onClick={() => act(false)}>{busy ? '正在处理…' : status.isPublished ? '更新发布' : status.revision ? '重新发布' : '发布已保存正文'}</button>
      </div>
    </>}
  </div>;
}
