import { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { MarkdownRender } from '../Common/MarkdownRender';
import Editor from '../Common/Editor';
import { Icon } from '@/components/Common/Iconify/icons';
import { NoteType } from '@shared/lib/types';
import type { DailyDraft, DailyAction } from '@shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '@shared/lib/dailyTaskPatch';
import { getTodoPriority } from '@shared/lib/todoPriority';

const priorityNames = { ui: '紧急且重要', in: '重要不紧急', un: '紧急不重要', nn: '普通' };
const dateLabel = (value: unknown) => value && Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toLocaleDateString('zh-CN') : '未设置';

/** 拆出日报正文的前两段做预览，避免整篇 markdown 直接铺满对话流 */
const previewOf = (content: string) => {
  const blocks = (content || '').trim().split(/\n{2,}/).filter(Boolean);
  return { head: blocks.slice(0, 2), rest: Math.max(0, blocks.length - 2) };
};

export const AiDailyResult = observer(({ draft, messageId, initialSaved }: { draft: DailyDraft; messageId: number; initialSaved?: { reportId?: number; actions?: Record<string, number> } }) => {
  const ai = RootStore.Get(AiStore);
  const messages = ai.currentConversation.value?.messages || [];
  const position = messages.findIndex(message => message.id === messageId);
  const user = (position < 0 ? messages : messages.slice(0, position)).filter(message => message.role === 'user').at(-1);
  const sources: any[] = (user?.metadata as any)?.sources || [];

  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [editing, setEditing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saveReport, setSaveReport] = useState(true);
  const [actions, setActions] = useState(() => draft.actions.map(value => ({ value, selected: false, dueMode: value.due === null ? 'keep' : value.due === '' ? 'clear' : 'set' })));
  const [saved, setSaved] = useState(initialSaved || { actions: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const patch = (index: number, value: Partial<DailyAction>) => setActions(items => items.map((item, i) => i === index ? { ...item, value: { ...item.value, ...value } } : item));
  const pending = actions.map((item, index) => ({ ...item, index })).filter(item => item.selected && !saved.actions?.[item.index]);
  const syncedCount = Object.keys(saved.actions || {}).length;
  const allSynced = !!saved.reportId && syncedCount === 0 && !pending.length;
  const preview = useMemo(() => previewOf(editing ? content : draft.content), [editing, content, draft.content]);

  const findSource = (index: number) => {
    const action = actions[index]?.value;
    return action ? sources.find(source => source.id === action.taskId && source.type === 2) : undefined;
  };
  /** 还没同步、且来源可用的条目才能勾选 */
  const selectable = (index: number) => !saved.actions?.[index] && (actions[index]?.value.action !== 'update' || !!findSource(index));
  const selectableIndexes = actions.map((_, i) => i).filter(selectable);
  const allSelected = selectableIndexes.length > 0 && selectableIndexes.every(i => actions[i].selected);
  const toggleAll = () => setActions(items => items.map((item, i) => selectable(i) ? { ...item, selected: !allSelected } : item));

  /** 已同步后整体收成一行，不再占用对话流高度 */
  if (allSynced) return <div className="ai-daily-result ai-daily-result--done">
    <Icon icon="tabler:circle-check" width="16" height="16" className="text-success" />
    <span>{syncedCount ? `日报与 ${syncedCount} 项待办变更已同步` : '日报已保存'}</span>
    {saved.reportId && <Link className="text-xs text-primary" to={`/detail?id=${saved.reportId}`}>打开日报</Link>}
    {!!syncedCount && <span className="text-xs text-default-400">各条待办入口见下方</span>}
  </div>;

  return <div className="ai-daily-result space-y-3">
    {/* ── 日报草稿：收起时保留一行摘要，展开才铺开全文 ── */}
    <section className="rounded-xl border border-default-200 overflow-hidden">
      <button type="button" disabled={busy} aria-expanded={reportOpen || editing} onClick={() => setReportOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left hover:bg-default-100/50 transition-colors disabled:opacity-50">
        <Icon icon="tabler:file-text" width="16" height="16" className="shrink-0 text-default-400" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">{title || '日报草稿'}</span>
          {!reportOpen && !editing && preview.head[0] && <span className="mt-0.5 block truncate text-xs text-default-400">{preview.head[0].replace(/^#+\s*/, '')}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-default-400">
          {draft.actions.length > 0 && <span>{draft.actions.length} 项变更</span>}
          <Icon icon="tabler:chevron-down" width="14" height="14" className={`transition-transform ${reportOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {reportOpen && !editing && <div className="border-t border-default-200 px-3.5 py-3">
        <MarkdownRender content={content} variant="chat" />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="text-xs text-primary disabled:opacity-40">编辑日报</button>
        </div>
      </div>}
      {editing && <div className="border-t border-default-200 px-3.5 py-3">
        <input aria-label="日报标题" disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className="w-full text-lg font-semibold bg-transparent outline-none mb-3" />
        <Editor mode="edit" fixedNoteType={NoteType.BLINKO} content={content} onChange={setContent} onSend={async () => {}} hiddenToolbar hideNoteTypeButton hideFullscreenButton focusOnMount={false} editable={!busy} />
        <div className="mt-3"><button type="button" disabled={busy} onClick={() => setEditing(false)} className="text-xs text-primary disabled:opacity-40">完成编辑</button></div>
      </div>}
    </section>

    {/* ── 待办变更：一行一条，展开才显示详情与编辑 ── */}
    {draft.actions.length > 0 && <section className="rounded-xl border border-default-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 py-2 border-b border-default-200 bg-default-100/40">
        <Icon icon="tabler:checkbox" width="16" height="16" className="shrink-0 text-default-400" />
        <span className="text-sm font-medium">待办变更</span>
        <span className="text-xs text-default-400">{draft.actions.length} 项</span>
        <button type="button" disabled={busy || !selectableIndexes.length} onClick={toggleAll}
          className="ml-auto text-xs text-primary disabled:opacity-40">
          {allSelected ? '取消全选' : '全选'}
        </button>
      </div>
      <ul className="divide-y divide-default-200">
        {actions.map((item, index) => {
          const source = findSource(index);
          const existing = item.value.action === 'update';
          const valid = !existing || !!source;
          const next = buildDailyTaskPatch(source || { content: '', metadata: {} }, item.value);
          const savedId = saved.actions?.[index];
          const open = expanded === index;
          const label = item.value.title || source?.metadata?.title || source?.content?.split('\n')[0] || '待办事项';

          /* 一行式变更摘要：不展开也能看清改了什么 */
          const deltas: string[] = [];
          const wasDone = source?.isArchived, nowDone = next.isArchived ?? source?.isArchived;
          if (existing && source && wasDone !== nowDone) deltas.push(`${wasDone ? '已完成' : '未完成'} → ${nowDone ? '已完成' : '未完成'}`);
          const wasPrio = source ? priorityNames[getTodoPriority(source.metadata)] : '', nowPrio = priorityNames[getTodoPriority(next.metadata)];
          if (existing && source && wasPrio !== nowPrio) deltas.push(`${wasPrio} → ${nowPrio}`);
          const wasDue = dateLabel(source?.metadata?.expireAt), nowDue = dateLabel(next.metadata.expireAt);
          if (existing && source && wasDue !== nowDue) deltas.push(`${wasDue} → ${nowDue}`);

          return <li key={index} className={item.selected || savedId ? 'bg-primary/[.03]' : ''}>
            <div className="flex items-start gap-2.5 px-3.5 py-2.5">
              <input type="checkbox" className="mt-0.5 shrink-0" aria-label={`确认${existing ? '更新' : '创建'} ${label}`} disabled={busy || !selectable(index)} checked={!!savedId || item.selected}
                onChange={event => setActions(items => items.map((it, i) => i === index ? { ...it, selected: event.target.checked } : it))} />
              <button type="button" disabled={busy || !valid} onClick={() => setExpanded(open ? null : index)}
                className="min-w-0 flex-1 text-left disabled:cursor-default">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${existing ? 'bg-default-100 text-default-500' : 'bg-success/15 text-success'}`}>{existing ? '更新' : '新建'}</span>
                  <span className="text-sm font-medium truncate">{label}</span>
                  {savedId && <Link className="text-xs text-primary" to={`/detail?id=${savedId}`} onClick={event => event.stopPropagation()}>已同步</Link>}
                  {!valid && <span className="text-xs text-danger">无法更新</span>}
                  {!!deltas.length && <span className="text-xs text-default-400 truncate">{deltas.join(' · ')}</span>}
                  {open && valid && <Icon icon="tabler:chevron-up" width="14" height="14" className="ml-auto shrink-0 text-default-400" />}
                </div>
                {!open && <p className="mt-1 truncate text-xs text-default-500">{item.value.reason}</p>}
              </button>
            </div>
            {open && valid && <div className="px-3.5 pb-3 space-y-3">
              <p className="text-xs text-default-500 leading-5">{item.value.reason}</p>
              {!valid && <p className="text-xs text-danger">未找到本次引用的原始任务，不能更新。请重新读取来源并生成。</p>}
              {existing && source && <>
                <details className="text-xs text-default-500"><summary className="cursor-pointer">查看原任务内容</summary><div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap leading-6">{source.content}</div></details>
                <div className="grid grid-cols-2 gap-3 text-xs rounded-lg bg-default-50 p-3">
                  <div><p className="text-default-400 mb-1">修改前</p><p>{source.isArchived ? '已完成' : '未完成'} · {priorityNames[getTodoPriority(source.metadata)]}</p><p className="mt-1">截止：{dateLabel(source.metadata?.expireAt)}</p></div>
                  <div><p className="text-default-400 mb-1">修改后</p><p>{(next.isArchived ?? source.isArchived) ? '已完成' : '未完成'} · {priorityNames[getTodoPriority(next.metadata)]}</p><p className="mt-1">截止：{dateLabel(next.metadata.expireAt)}</p></div>
                </div>
              </>}
              {!savedId && <div className="space-y-3 text-xs border-t border-default-200 pt-3">
                <label className="block">标题<input disabled={busy} value={item.value.title ?? ''} placeholder={existing ? '保留原标题' : '填写任务标题'} onChange={event => patch(index, { title: event.target.value || null })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
                <label className="block">描述<textarea disabled={busy} value={item.value.description ?? ''} placeholder={existing ? '保留原描述' : '来源依据、下一步动作'} onChange={event => patch(index, { description: event.target.value || null })} rows={3} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
                <div className="flex flex-wrap gap-3"><label>状态 <select disabled={busy} value={item.value.status ?? ''} onChange={event => patch(index, { status: (event.target.value || null) as any })} className="rounded bg-background border border-default-200 p-1"><option value="">{existing ? '保持原状态' : '默认未完成'}</option><option value="open">未完成</option><option value="done">已完成</option></select></label>
                  <label>优先级 <select disabled={busy} value={item.value.priority ?? ''} onChange={event => patch(index, { priority: (event.target.value || null) as any })} className="rounded bg-background border border-default-200 p-1"><option value="">{existing ? '保持原优先级' : '未指定（站点默认普通）'}</option>{Object.entries(priorityNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
                <div className="flex flex-wrap items-center gap-2"><span>截止日期</span><select aria-label="截止日期修改方式" disabled={busy} value={item.dueMode} onChange={event => { const dueMode = event.target.value; setActions(items => items.map((it, i) => i === index ? { ...it, dueMode, value: { ...it.value, due: dueMode === 'keep' ? null : dueMode === 'clear' ? '' : it.value.due || '' } } : it)); }} className="rounded bg-background border border-default-200 p-1"><option value="keep">{existing ? '保持原日期' : '不设置'}</option><option value="set">指定日期</option><option value="clear">清除日期</option></select>
                  {item.dueMode === 'set' && <input aria-label="新的截止日期" type="date" value={item.value.due || ''} disabled={busy} onChange={event => patch(index, { due: event.target.value })} className="rounded bg-background border border-default-200 p-1" />}</div>
                <label className="block">延期原因（日期修正可留空）<input disabled={busy} value={item.value.postponeReason} onChange={event => patch(index, { postponeReason: event.target.value })} placeholder="延期时会同步站点的顺延次数" className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
              </div>}
            </div>}
          </li>;
        })}
      </ul>
    </section>}

    {draft.actions.length === 0 && <p className="px-1 text-xs text-default-400">没有需要同步的待办变更，本次只保存日报。</p>}

    {/* ── 操作条 ── */}
    <div className="rounded-xl border border-default-200 px-3.5 py-3 space-y-3">
      {!saved.reportId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveReport} disabled={busy} onChange={event => setSaveReport(event.target.checked)} />同时保存日报为笔记</label>}
      {error && <p role="alert" className="text-sm text-danger leading-6">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || (!pending.length && (!saveReport || !!saved.reportId)) || !title.trim()} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40" onClick={async () => {
          if (pending.some(item => item.dueMode === 'set' && !item.value.due)) { setError('请填写已选择指定日期的待办截止日期'); return; }
          setBusy(true); setError('');
          try {
            const result = await api.ai.syncDaily.mutate({ messageId, saveReport: saveReport && !saved.reportId, title, content, actions: pending.map(item => ({ index: item.index, value: item.value })) });
            setSaved(result); setEditing(false); setExpanded(null); setReportOpen(false);
            RootStore.Get(BlinkoStore).refreshData();
          }
          catch (error) { setError(error instanceof Error ? error.message : '同步失败，本次未写入，请重试'); }
          finally { setBusy(false); }
        }}>{busy ? '正在同步…' : pending.length ? `确认同步 ${pending.length} 项${saveReport && !saved.reportId ? '并保存日报' : ''}` : '保存日报'}</button>
        <span className="text-xs text-default-400">未勾选的待办保持原样</span>
      </div>
    </div>
  </div>;
});
