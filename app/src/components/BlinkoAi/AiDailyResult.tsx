import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { MarkdownRender } from '../Common/MarkdownRender';
import type { DailyDraft, DailyAction } from '@shared/lib/aiWorkflows';
import { buildDailyTaskPatch } from '@shared/lib/dailyTaskPatch';

const groups = ['已完成', '继续推进', '新增待办', '待确认'] as const;
const groupOf = (action: DailyAction) => action.needsConfirmation ? '待确认' : action.status === 'done' ? '已完成' : action.action === 'create' ? '新增待办' : '继续推进';
export const AiDailyResult = observer(({ draft, messageId, initialSaved }: { draft: DailyDraft; messageId: number; initialSaved?: { reportId?: number; actions?: Record<string, number> } }) => {
  const ai = RootStore.Get(AiStore);
  const messages = ai.currentConversation.value?.messages || [];
  const position = messages.findIndex(message => message.id === messageId);
  const user = (position < 0 ? messages : messages.slice(0, position)).filter(message => message.role === 'user').at(-1);
  const sources: any[] = (user?.metadata as any)?.sources || [];
  const tasks = sources.filter(source => source.type === 2);
  const [actions, setActions] = useState(() => draft.actions.map(value => ({ value, selected: !value.needsConfirmation && (value.action === 'create' || tasks.some(source => source.id === value.taskId)) })));
  const [saved, setSaved] = useState(initialSaved || { actions: {} });
  const [expanded, setExpanded] = useState<number | null>(null);
  const [saveReport, setSaveReport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState(draft.title);
  const findSource = (value: DailyAction) => tasks.find(source => source.id === value.taskId);
  const patch = (index: number, value: Partial<DailyAction>) => setActions(items => items.map((item, i) => i === index ? { ...item, value: { ...item.value, ...value } } : item));
  const pending = actions.map((item, index) => ({ ...item, index })).filter(item => item.selected && !saved.actions?.[item.index]);
  const untouched = tasks.filter(task => !actions.some(item => item.value.taskId === task.id) && !task.isArchived);
  const synced = Object.keys(saved.actions || {}).length;
  return <div className="ai-daily-result space-y-4">
    <div className="text-xs leading-6 text-default-500">核对任务关联与变更后一次同步。进度会追加到原任务，今日计划独立于截止时间；未选事项保持原样。</div>
    {saved.reportId && <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm"><span>已同步 {synced} 项</span><Link className="text-primary" to={`/detail?id=${saved.reportId}`}>打开已保存日报</Link><span className="text-xs text-default-500">同日补充会更新这份日报</span></div>}
    {groups.map(group => {
      const items = actions.map((item, index) => ({ ...item, index })).filter(item => groupOf(item.value) === group);
      if (!items.length && !(group === '待确认' && draft.questions.length)) return null;
      return <section key={group} className="overflow-hidden rounded-xl border border-default-200">
        <header className="flex items-center gap-2 bg-default-50 px-3 py-2"><h3 className="text-sm font-medium">{group}</h3><span className="text-xs text-default-500">{items.length}</span></header>
        <ul className="divide-y divide-default-200">{items.map(item => {
          const { value, index } = item;
          const source = findSource(value);
          const savedId = saved.actions?.[index];
          const label = value.title || source?.metadata?.title || source?.content?.split('\n')[0] || '待办事项';
          const valid = value.action === 'create' || !!source;
          const next = buildDailyTaskPatch(source || { content: '', metadata: {} }, value);
          return <li key={index}>
            <div className="flex items-start gap-2 px-3 py-3">
              <input type="checkbox" aria-label={`同步 ${label}`} checked={!!savedId || item.selected} disabled={busy || !!savedId || !valid} onChange={event => setActions(items => items.map((it, i) => i === index ? { ...it, selected: event.target.checked } : it))} className="mt-1" />
              <button type="button" disabled={busy} aria-expanded={expanded === index} onClick={() => setExpanded(expanded === index ? null : index)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium">{label}</p><p className="mt-1 text-xs leading-5 text-default-500">{value.progress || value.nextStep || value.reason}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-default-500"><span>{value.action === 'update' ? `关联原任务 ID ${value.taskId}` : '创建新任务'}</span>{value.planDate && <span>计划 {value.planDate}</span>}{value.due !== null ? <span>截止改为 {value.due || '未设置'}</span> : <span>截止不变</span>}{!valid && <span className="text-danger">需重新关联任务</span>}{value.needsConfirmation && <span className="text-warning">请核对后勾选</span>}</div>
              </button>
              {savedId && <Link className="shrink-0 text-xs text-primary" to={`/detail?id=${savedId}`}>已同步</Link>}
            </div>
            {expanded === index && <div className="space-y-3 px-3 pb-3 text-xs">
              <p className="leading-6 text-default-500">依据：{value.reason}</p>
              {source && <details><summary className="cursor-pointer text-primary">对比原任务</summary><div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><div className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-default-50 p-2"><p className="font-medium">修改前</p>{source.content}<p>状态：{source.isArchived ? '已完成' : source.metadata?.taskStatus || '待办'}</p><p>截止：{source.metadata?.expireAt || '未设置'}</p></div><div className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-primary/5 p-2"><p className="font-medium">修改后（原目标保留）</p>{next.content}<p>最新进展：{next.metadata.latestProgress || '无新增'}</p><p>下一步：{next.metadata.nextStep || '不变'}</p><p>截止：{next.metadata.expireAt || '未设置'}</p></div></div></details>}
              {!savedId && <fieldset disabled={busy} className="space-y-3 border-t border-default-200 pt-3 disabled:opacity-50">
                <label className="block">任务关联<select aria-label={`任务关联 ${label}`} value={value.action === 'create' ? 'create' : String(value.taskId)} onChange={event => { const id = Number(event.target.value); patch(index, event.target.value === 'create' ? { action: 'create', taskId: null, title: label, description: value.description || '' } : { action: 'update', taskId: id, title: null, description: null }); }} className="mt-1 w-full rounded border border-default-200 bg-background p-2"><option value="create">作为新增任务</option>{tasks.map(task => <option key={task.id} value={task.id}>ID {task.id} · {task.metadata?.title || task.content?.split('\n')[0]}</option>)}</select></label>
                <label className="block">{value.action === 'create' ? '新任务标题' : '调整标题（可选）'}<input value={value.title || ''} onChange={event => patch(index, { title: event.target.value || null })} placeholder="保留原标题" className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
                {value.action === 'create' && <label className="block">任务目标<textarea value={value.description || ''} onChange={event => patch(index, { description: event.target.value })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>}
                <label className="block">本次进展<textarea rows={2} value={value.progress} onChange={event => patch(index, { progress: event.target.value })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
                <label className="block">下一步<input value={value.nextStep} onChange={event => patch(index, { nextStep: event.target.value })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>
                <div className="flex flex-wrap items-center gap-3"><label>状态 <select value={value.status || ''} onChange={event => patch(index, { status: (event.target.value || null) as DailyAction['status'] })} className="rounded border border-default-200 bg-background p-1"><option value="">保持原状态</option><option value="open">未完成／进行中</option><option value="done">已完成</option></select></label><label>优先级 <select value={value.priority || ''} onChange={event => patch(index, { priority: (event.target.value || null) as DailyAction['priority'] })} className="rounded border border-default-200 bg-background p-1"><option value="">保持原值／普通</option><option value="ui">紧急且重要</option><option value="in">重要不紧急</option><option value="un">紧急不重要</option><option value="nn">普通</option></select></label></div>
                <label className="block">计划执行日<input type="date" value={value.planDate || ''} onChange={event => patch(index, { planDate: event.target.value || null })} className="ml-2 rounded border border-default-200 bg-background p-1" /></label>
                <details><summary className="cursor-pointer text-default-500">明确调整截止时间或原任务目标</summary><label className="mt-2 block">截止日期（留空保持不变）<input type="date" value={value.due || ''} onChange={event => patch(index, { due: event.target.value || null })} className="mt-1 rounded border border-default-200 bg-background p-1" /></label><button type="button" className="mt-2 text-default-500" onClick={() => patch(index, { due: '' })}>明确清除截止时间</button><label className="mt-2 block">调整原因<input value={value.postponeReason} onChange={event => patch(index, { postponeReason: event.target.value })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>{value.action === 'update' && <label className="mt-2 block">替换原目标（仅明确调整时使用）<textarea value={value.description || ''} onChange={event => patch(index, { description: event.target.value || null })} className="mt-1 w-full rounded border border-default-200 bg-background p-2" /></label>}</details>
              </fieldset>}
            </div>}
          </li>;
        })}</ul>
        {group === '待确认' && !!draft.questions.length && <ul className="space-y-1 border-t border-default-200 px-3 py-2 text-xs leading-6 text-warning">{draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>}
      </section>;
    })}
    {!!untouched.length && <details className="text-xs text-default-500"><summary className="cursor-pointer">未涉及的 {untouched.length} 项未完成任务保持原样</summary><ul className="mt-2 space-y-2">{untouched.map(task => <li key={task.id}><Link to={`/detail?id=${task.id}`}>{task.metadata?.title || task.content?.split('\n')[0]}</Link></li>)}</ul></details>}
    <details className="rounded-xl border border-default-200 px-3 py-2"><summary className="cursor-pointer text-sm">查看 AI 回顾草稿</summary><p className="my-2 text-xs text-default-500">此处为候选内容；最终日报根据已确认同步的事项生成，避免把未同步建议写成成果。</p><MarkdownRender content={draft.content} variant="chat" /></details>
    <div className="space-y-3 rounded-xl border border-default-200 p-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveReport} disabled={busy || !!saved.reportId} onChange={event => setSaveReport(event.target.checked)} />保存／补充当天日报</label>
      {saveReport && <input aria-label="日报标题" value={title} disabled={busy} onChange={event => setTitle(event.target.value)} className="w-full rounded border border-default-200 bg-background p-2 text-sm" />}
      {error && <p role="alert" className="text-sm leading-6 text-danger">{error}</p>}
      <button type="button" disabled={busy || (!pending.length && (!saveReport || !!saved.reportId)) || !title.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40" onClick={async () => {
        setBusy(true); setError('');
        try {
          const result = await api.ai.syncDaily.mutate({ messageId, saveReport, title, content: draft.content, actions: pending.map(item => ({ index: item.index, value: item.value })) });
          setSaved(result);
          if (Object.keys(result.errors).length) setError('部分事项未同步：' + Object.values(result.errors).join('；') + '。已成功事项不会重复写入，可取消失败项或调整关联后重试。');
          // Keep saved receipts when closing/reopening the workspace.
          const message = messages.find(message => message.id === messageId);
          if (message) message.metadata = { ...(message.metadata as any || {}), dailySaved: result };
          RootStore.Get(BlinkoStore).refreshData();
        } catch (error) { setError(error instanceof Error ? error.message : '同步失败，本次未写入；请重试。'); }
        finally { setBusy(false); }
      }}>{busy ? '正在同步…' : pending.length ? `确认同步 ${pending.length} 项${saveReport ? '并保存日报' : ''}` : '保存日报'}</button>
      <p className="text-xs leading-5 text-default-500">待确认项可暂不勾选；重复提交不会重复创建。某项冲突不影响其他事项，重试仅处理未成功项目。</p>
    </div>
  </div>;
});
