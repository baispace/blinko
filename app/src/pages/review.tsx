import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { MarkdownRender } from '@/components/Common/MarkdownRender';
import { FilesAttachmentRender } from '@/components/Common/AttachmentRender';
import { Icon } from '@/components/Common/Iconify/icons';
import './review.css';
import { cn } from '@/lib/utils';
import { reviewProgress } from './reviewUtils';

type ReviewNote = NonNullable<Awaited<ReturnType<typeof api.notes.dailyReviewNoteList.query>>>[number];
type Mode = 'daily' | 'random';
const ReviewPage = observer(() => {
  const { i18n } = useTranslation();
  const text = (zh: string, en: string) => i18n.language.startsWith('zh') ? zh : en;
  const blinko = RootStore.Get(BlinkoStore), toast = RootStore.Get(ToastPlugin), navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('daily');
  const [notes, setNotes] = useState<ReviewNote[]>([]), [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<number[]>([]), [skipped, setSkipped] = useState<number[]>([]);
  const [loading, setLoading] = useState(true), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false);
  const request = useRef(0), actionLock = useRef(false), reading = useRef<HTMLDivElement>(null);
  const current = notes[index];
  const progress = reviewProgress(notes.length, index, reviewed.length, skipped.length);
  const load = useCallback(async () => {
    const id = ++request.current;
    setLoading(true); setFailed(false);
    try {
      const rows = mode === 'daily' ? await api.notes.dailyReviewNoteList.query() : await api.notes.randomNoteList.query({ limit: 30 });
      if (id !== request.current) return;
      setNotes(rows); setIndex(0); setReviewed([]); setSkipped([]);
      if (mode === 'daily') blinko.dailyReviewNoteList.setValue(rows);
    } catch { if (id === request.current) setFailed(true); }
    finally { if (id === request.current) setLoading(false); }
  }, [mode]);
  useEffect(() => { void load(); return () => { request.current++; }; }, [load]);
  useEffect(() => { reading.current?.scrollTo({ top: 0 }); }, [current?.id]);
  const advance = () => setIndex(value => Math.min(value + 1, notes.length));
  const skip = () => {
    if (!current || actionLock.current || loading) return;
    setSkipped(ids => [...ids, current.id]); advance();
  };
  const finish = async () => {
    if (!current || actionLock.current || loading) return;
    actionLock.current = true; setBusy(true);
    const id = current.id;
    try {
      // Random browsing must not silently clear the daily review queue.
      if (mode === 'daily') {
        await api.notes.reviewNote.mutate({ id });
        blinko.dailyReviewNoteList.setValue((blinko.dailyReviewNoteList.value ?? []).filter(note => note.id !== id));
      }
      setReviewed(ids => [...ids, id]); advance();
    } catch { toast.error(text('标记失败，内容已保留，请重试', 'Could not mark as reviewed. Please try again.')); }
    finally { actionLock.current = false; setBusy(false); }
  };
  const openOriginal = () => {
    if (!current || actionLock.current) return;
    blinko.fullscreenEditorNoteId = current.id;
    navigate(`/detail?id=${current.id}`);
  };
  const archive = async () => {
    if (!current || actionLock.current) return;
    actionLock.current = true; setBusy(true);
    const id = current.id;
    try {
      await api.notes.upsert.mutate({ id, isArchived: true });
      blinko.dailyReviewNoteList.setValue((blinko.dailyReviewNoteList.value ?? []).filter(note => note.id !== id));
      blinko.refreshData();
      toast.success(text('已归档，可从头像菜单中的归档找回', 'Archived. Find it in Archive from your account menu.'));
      setReviewed(ids => [...ids, id]); advance();
    } catch { toast.error(text('归档失败，请重试', 'Could not archive. Please try again.')); }
    finally { actionLock.current = false; setBusy(false); }
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || target.closest('input,textarea,button,a,select,[contenteditable="true"],[role="dialog"],[role="combobox"]') || document.querySelector('[role="dialog"]')) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); skip(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current?.id, busy, loading, notes.length]);
  const kind = current?.type === 0 ? text('闪念', 'Memo') : current?.type === 2 ? text('待办', 'Task') : text('笔记', 'Note');
  const title = (current?.metadata as any)?.title;
  return <div className={cn('review-page', !blinko.config.value?.isHiddenMobileBar && 'review-page-with-mobile-nav')}>
    <div className="review-layout mx-auto w-full max-w-5xl">
      <div className="review-heading flex shrink-0 items-start justify-between gap-4 mb-4">
        <div><h1 className="text-xl font-semibold text-foreground">{text('回顾', 'Review')}</h1>
          <p className="review-intro mt-2 text-sm text-default-500">{text('回看记录，把零散的想法慢慢整理成积累。', 'Revisit your records and give your ideas a second look.')}</p></div>
        <Button size="sm" variant="light" onPress={() => navigate('/')} startContent={<Icon icon="tabler:arrow-left" width="16" />}>{text('返回主页', 'Home')}</Button>
      </div>
      <div className="review-mode flex shrink-0 flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex gap-1 rounded-xl bg-default-100 p-1" aria-label={text('回顾模式', 'Review mode')}>
          {(['daily', 'random'] as const).map(value => <button key={value} disabled={busy} aria-pressed={value === mode} onClick={() => setMode(value)} className={cn('rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50', mode === value ? 'bg-background text-foreground shadow-sm' : 'text-default-500 hover:text-foreground')}>{value === 'daily' ? text('每日回顾', 'Daily review') : text('随机回看', 'Rediscover')}</button>)}
        </div>
        <Button size="sm" variant="light" isDisabled={busy || loading} onPress={load} startContent={<Icon icon="tabler:clock" width="16" />}>{mode === 'random' ? text('换一批', 'New batch') : text('刷新', 'Refresh')}</Button>
      </div>
      <p className="review-description shrink-0 mb-3 text-xs leading-relaxed text-default-400">{mode === 'daily' ? text('最近 24 小时内尚未回顾的闪念和笔记；仅点击“标记已回顾”才会完成回顾。', 'Unreviewed memos and notes from the last 24 hours. Mark each item explicitly when done.') : text('从未归档的闪念和笔记中随机挑选，最多 30 条；浏览不会改变每日回顾状态。', 'Up to 30 random memos and notes from your active collection. Browsing does not change daily review status.')}</p>
      {loading ? <div role="status" className="flex min-h-0 flex-1 items-center justify-center gap-3 text-sm text-default-500"><Spinner size="sm" />{text('正在整理回顾内容…', 'Loading your review…')}</div>
      : failed ? <div role="alert" className="min-h-0 overflow-y-auto rounded-2xl border border-default-200 p-6 text-center"><p className="text-sm text-default-500 mb-4">{text('回顾内容加载失败，请重试。', 'Could not load your review.')}</p><Button onPress={load} color="primary" variant="flat">{text('重试', 'Retry')}</Button></div>
      : !current ? <div className="min-h-0 overflow-y-auto rounded-2xl border border-default-200 bg-background px-6 py-8 text-center">
        <Icon icon={notes.length ? 'tabler:list-check' : 'hugeicons:sticky-note-02'} width="32" className="text-primary mx-auto mb-4" />
        <h2 className="font-semibold text-lg">{notes.length ? text('这一轮回看结束了', 'This round is complete') : mode === 'daily' ? text('暂时没有待回顾内容', 'Nothing to review right now') : text('还没有可回看的内容', 'Nothing to rediscover yet')}</h2>
        <p className="mt-3 text-sm text-default-500">{notes.length ? text(`已处理 ${reviewed.length} 条，暂时跳过 ${skipped.length} 条。`, `${reviewed.length} handled, ${skipped.length} skipped.`) : text('写下一条闪念或笔记，之后再回来看看。', 'Capture a memo or note and come back later.')}</p>
        <div className="mt-6 flex justify-center flex-wrap gap-2">
          {skipped.length > 0 && <Button color="primary" variant="flat" onPress={() => { setNotes(notes.filter(note => skipped.includes(note.id))); setIndex(0); setReviewed([]); setSkipped([]); }}>{text('继续回看跳过的内容', 'Revisit skipped items')}</Button>}
          {mode === 'daily' && <Button variant="flat" onPress={() => setMode('random')}>{text('随机回看过去的记录', 'Rediscover past records')}</Button>}
          <Button variant="light" onPress={() => navigate('/')}>{text('返回主页', 'Home')}</Button>
        </div>
      </div> : <>
        <div className="mb-2 flex shrink-0 items-center justify-between text-xs text-default-400" aria-live="polite"><span>{text(`第 ${index + 1} / ${notes.length} 条`, `Item ${index + 1} of ${notes.length}`)}</span><span>{text(`已处理 ${reviewed.length} 条`, `${reviewed.length} handled`)}</span></div>
        <div role="progressbar" aria-label={text('回看进度', 'Review progress')} aria-valuemin={0} aria-valuemax={notes.length} aria-valuenow={progress.visited} className="mb-3 h-1 shrink-0 overflow-hidden rounded-full bg-default-100"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${progress.percent}%` }} /></div>
        <article className="review-card rounded-2xl border border-default-200 bg-background">
          <header className="review-card-header flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default-100 px-4 py-3 md:px-6"><span className="flex items-center gap-2 text-xs text-default-500"><Icon icon={current.type === 0 ? 'tabler:bulb' : 'hugeicons:sticky-note-02'} width="16" />{kind}<span className="text-default-300">·</span><time dateTime={new Date(current.createdAt).toISOString()}>{new Date(current.createdAt).toLocaleString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
            <Button size="sm" variant="light" isDisabled={busy} onPress={openOriginal}>{text('打开原文 / 编辑', 'Open / edit')}</Button></header>
          <div ref={reading} className="review-reading px-4 py-5 md:px-6" tabIndex={0} role="region" aria-label={text('回顾正文', 'Review content')}>
            {title && <h2 className="mb-4 text-xl font-semibold break-words">{title}</h2>}
            <div className="text-base leading-relaxed break-words"><MarkdownRender content={current.content ?? ''} /></div>
            {!current.content?.trim() && !(current.attachments?.length) && <p className="text-sm text-default-400">{text('这条记录暂无正文', 'This record has no text.')}</p>}
            {current.attachments?.length > 0 && <div className="mt-5 border-t border-default-100 pt-4"><FilesAttachmentRender files={current.attachments as any} columns={3} preview /></div>}
          </div>
          <footer className="review-card-footer flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default-100 bg-background px-3 py-3 md:px-6">
            <div className="flex gap-1"><Button size="sm" variant="light" isDisabled={busy} onPress={async () => { try { await navigator.clipboard.writeText(current.content ?? ''); toast.success(text('已复制', 'Copied')); } catch { toast.error(text('复制失败，请重试', 'Could not copy')); } }} startContent={<Icon icon="tabler:copy" width="15" />}>{text('复制', 'Copy')}</Button>
              <Tooltip content={text('归档后退出回顾，可在归档中找回', 'Remove from review and keep in Archive')}><Button size="sm" variant="light" isDisabled={busy} onPress={archive}>{text('归档', 'Archive')}</Button></Tooltip></div>
            <div className="flex gap-2"><Button size="sm" variant="flat" isDisabled={busy} onPress={skip}>{text('暂时跳过', 'Skip for now')}</Button><Button size="sm" color="primary" isLoading={busy} onPress={finish}>{mode === 'daily' ? text('标记已回顾', 'Mark reviewed') : text('看过了，下一条', 'Next item')}</Button></div>
          </footer>
        </article>
        <p className="review-shortcuts mt-3 shrink-0 text-center text-xs text-default-400">{text('→ 暂时跳过 · 正文可滚动阅读 · 编辑不会自动标记已回顾', '→ Skip · Scroll to read · Editing does not mark an item reviewed')}</p>
      </>}
    </div>
  </div>;
});
export default ReviewPage;
