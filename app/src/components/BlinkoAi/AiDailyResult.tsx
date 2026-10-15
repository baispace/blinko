import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { MarkdownRender } from '../Common/MarkdownRender';
import Editor from '../Common/Editor';
import { NoteType } from '@shared/lib/types';
import type { DailyDraft, DailyAction } from '@shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '@shared/lib/dailyTaskPatch';
import { getTodoPriority } from '@shared/lib/todoPriority';

const priorityNames = { ui: '紧急且重要', in: '重要不紧急', un: '紧急不重要', nn: '普通' };
const dateLabel = (value: unknown) => value && Number.isFinite(Date.parse(String(value))) ? new Date(String(value)).toLocaleDateString('zh-CN') : '未设置';
export const AiDailyResult = observer(({ draft, messageId, initialSaved }: { draft: DailyDraft; messageId: number; initialSaved?: { reportId?: number; actions?: Record<string, number> } }) => {
  const ai = RootStore.Get(AiStore);
  const messages = ai.currentConversation.value?.messages || [];
  const position = messages.findIndex(message => message.id === messageId);
  const user = (position < 0 ? messages : messages.slice(0, position)).filter(message => message.role === 'user').at(-1);
  const sources: any[] = (user?.metadata as any)?.sources || [];
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [editing, setEditing] = useState(false);
  const [saveReport, setSaveReport] = useState(true);
  const [actions, setActions] = useState(() => draft.actions.map(value => ({ value, selected: false, dueMode: value.due === null ? 'keep' : value.due === '' ? 'clear' : 'set' })));
  const [saved, setSaved] = useState(initialSaved || { actions: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const patch = (index: number, value: Partial<DailyAction>) => setActions(items => items.map((item, i) => i === index ? { ...item, value: { ...item.value, ...value } } : item));
  const pending = actions.map((item, index) => ({ ...item, index })).filter(item => item.selected && !saved.actions?.[item.index]);
  return <div className="ai-daily-result space-y-4">
    <section className="rounded-xl border border-default-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="text-xs text-default-500">日报草稿</span>
        {saved.reportId ? <Link className="text-xs text-primary" to={`/detail?id=${saved.reportId}`}>打开已保存日报</Link> : <button type="button" disabled={busy} className="text-xs text-primary" onClick={() => setEditing(!editing)}>{editing ? '预览' : '编辑日报'}</button>}
      </div>
      {editing && !saved.reportId ? <><input aria-label="日报标题" disabled={busy} value={title} onChange={event => setTitle(event.target.value)} className="w-full text-lg font-semibold bg-transparent outline-none mb-3" />
        <Editor mode="edit" fixedNoteType={NoteType.BLINKO} content={content} onChange={setContent} onSend={async () => {}} hiddenToolbar hideNoteTypeButton hideFullscreenButton focusOnMount={false} editable={!busy} />
      </> : <><h3 className="text-lg font-semibold mb-3">{title}</h3><MarkdownRender content={content} variant="chat" /></>}
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-medium">待办变更 · {draft.actions.length} 项建议</h4><span className="text-xs text-default-400">勾选后才会写入</span></div>
      {!actions.length && <p className="text-sm text-default-500">没有明确需要同步的任务变更，可以只保存日报。</p>}
      {actions.map((item, index) => {
        const source = sources.find(source => source.id === item.value.taskId && source.type === 2);
        const existing = item.value.action === 'update';
        const valid = !existing || !!source;
        const next = buildDailyTaskPatch(source || { content: '', metadata: {} }, item.value);
        const savedId = saved.actions?.[index];
        return <div key={index} className={`rounded-xl border p-3 ${item.selected ? 'border-primary/30 bg-primary/[.025]' : 'border-default-200'}`}>
          <div className="flex items-start gap-2"><input type="checkbox" className="mt-1" aria-label={`确认${existing ? '更新' : '创建'} ${item.value.title || source?.metadata?.title || `任务 ${item.value.taskId}`}`} disabled={busy || !!savedId || !valid} checked={!!savedId || item.selected} onChange={event => setActions(items => items.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />
            <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><span className="text-xs text-default-500">{existing ? `更新 #${item.value.taskId}` : '新建任务'}</span>{savedId && <Link className="text-xs text-primary" to={`/detail?id=${savedId}`}>已同步 · 打开待办</Link>}</div>
              <p className="text-sm font-medium mt-1">{item.value.title || source?.metadata?.title || source?.content?.split('\n')[0] || '待办事项'}</p>
              <p className="text-xs text-default-500 leading-5 mt-1">{item.value.reason}</p>
            </div>
          </div>
          {!valid && <p className="text-xs text-danger mt-2">未找到本次引用的原始任务，不能更新。请重新读取来源并生成。</p>}
          {existing && source && <details className="mt-2 text-xs text-default-500"><summary className="cursor-pointer">查看原任务内容</summary><div className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap leading-6">{source.content}</div></details>}
          {existing && source && <div className="grid grid-cols-2 gap-3 text-xs rounded-lg bg-default-50 p-3 mt-3">
            <div><p className="text-default-400 mb-1">修改前</p><p>{source.isArchived ? '已完成' : '未完成'} · {priorityNames[getTodoPriority(source.metadata)]}</p><p className="mt-1">截止：{dateLabel(source.metadata?.expireAt)}</p></div>
            <div><p className="text-default-400 mb-1">修改后</p><p>{(next.isArchived ?? source.isArchived) ? '已完成' : '未完成'} · {priorityNames[getTodoPriority(next.metadata)]}</p><p className="mt-1">截止：{dateLabel(next.metadata.expireAt)}</p></div>
          </div>}
          {!savedId && <details className="mt-3"><summary className="text-xs text-default-500 cursor-pointer">检查并调整变更</summary><div className="mt-3 space-y-3 text-xs">
            <label className="block">标题<input disabled={busy} value={item.value.title ?? ''} placeholder={existing ? '保留原标题' : '填写任务标题'} onChange={event => patch(index, { title: event.target.value || null })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
            <label className="block">描述<textarea disabled={busy} value={item.value.description ?? ''} placeholder={existing ? '保留原描述' : '来源依据、下一步动作'} onChange={event => patch(index, { description: event.target.value || null })} rows={3} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
            <div className="flex flex-wrap gap-3"><label>状态 <select disabled={busy} value={item.value.status ?? ''} onChange={event => patch(index, { status: (event.target.value || null) as any })} className="rounded bg-background border border-default-200 p-1"><option value="">{existing ? '保持原状态' : '默认未完成'}</option><option value="open">未完成</option><option value="done">已完成</option></select></label>
              <label>优先级 <select disabled={busy} value={item.value.priority ?? ''} onChange={event => patch(index, { priority: (event.target.value || null) as any })} className="rounded bg-background border border-default-200 p-1"><option value="">{existing ? '保持原优先级' : '未指定（站点默认普通）'}</option>{Object.entries(priorityNames).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap items-center gap-2"><span>截止日期</span><select aria-label="截止日期修改方式" disabled={busy} value={item.dueMode} onChange={event => { const dueMode = event.target.value; setActions(items => items.map((item, i) => i === index ? { ...item, dueMode, value: { ...item.value, due: dueMode === 'keep' ? null : dueMode === 'clear' ? '' : item.value.due || '' } } : item)); }} className="rounded bg-background border border-default-200 p-1"><option value="keep">{existing ? '保持原日期' : '不设置'}</option><option value="set">指定日期</option><option value="clear">清除日期</option></select>
              {item.dueMode === 'set' && <input aria-label="新的截止日期" type="date" value={item.value.due || ''} disabled={busy} onChange={event => patch(index, { due: event.target.value })} className="rounded bg-background border border-default-200 p-1" />}
            </div>
            <label className="block">延期原因（日期修正可留空）<input disabled={busy} value={item.value.postponeReason} onChange={event => patch(index, { postponeReason: event.target.value })} placeholder="延期时会同步站点的顺延次数" className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
          </div></details>}
        </div>;
      })}
    </section>
    {!saved.reportId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveReport} disabled={busy} onChange={event => setSaveReport(event.target.checked)} />同时保存日报为笔记</label>}
    {error && <p role="alert" className="text-sm text-danger leading-6">{error}</p>}
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy || (!pending.length && (!saveReport || !!saved.reportId)) || !title.trim()} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm disabled:opacity-40" onClick={async () => {
      if (pending.some(item => item.dueMode === 'set' && !item.value.due)) { setError('请填写已选择指定日期的待办截止日期'); return; }
      setBusy(true); setError('');
      try { const result = await api.ai.syncDaily.mutate({ messageId, saveReport: saveReport && !saved.reportId, title, content, actions: pending.map(item => ({ index: item.index, value: item.value })) }); setSaved(result); setEditing(false); RootStore.Get(BlinkoStore).refreshData(); }
      catch (error) { setError(error instanceof Error ? error.message : '同步失败，本次未写入，请重试'); }
      finally { setBusy(false); }
    }}>{busy ? '正在同步…' : pending.length ? `确认同步 ${pending.length} 项${saveReport && !saved.reportId ? '并保存日报' : ''}` : '保存日报'}</button><span className="text-xs text-default-400">未勾选的待办保持原样</span></div>
  </div>;
});
