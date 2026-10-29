import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { Button, Checkbox, Chip, DatePicker, Input, Select, SelectItem, Textarea } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import type { DatePickerProps } from '@heroui/react';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import { MarkdownRender } from '../Common/MarkdownRender';
import type { DailyDraft, DailyAction } from '@shared/lib/aiWorkflows';
import { dailyDate, dailyDeltas, dailyReceiptLabel, dailyStatus, dailyTaskTitle, type DailyTaskSource, type DailyReceipt } from '@shared/lib/dailyChanges';
import './daily.css';

function DailyTaskPicker({ messageId, sources, onSelect, disabled }: {
  messageId: number; sources: DailyTaskSource[]; onSelect: (task: DailyTaskSource) => void; disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DailyTaskSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = window.setTimeout(async () => {
      try {
        const items = await api.ai.dailyTaskCandidates.query({ messageId, query });
        if (active) setResults(items as DailyTaskSource[]);
      } catch { if (active) setError('搜索失败，可先选择已引用任务，或稍后重试。'); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query, messageId]);
  const items = results ?? sources.filter(task => dailyTaskTitle(task).toLowerCase().includes(query.toLowerCase()));
  return <div className="ai-daily-task-picker">
    <Input autoFocus size="sm" aria-label="搜索已有任务" placeholder="按任务名称搜索…" value={query} onValueChange={value => { setQuery(value); setResults(null); }}
      isDisabled={disabled} startContent={<Icon icon="tabler:search" width={16} />} />
    {loading && <p className="ai-daily-muted" role="status">正在查找已有任务…</p>}
    {error && <p className="ai-daily-warning" role="alert">{error}</p>}
    <div className="ai-daily-task-options" aria-label="可关联任务">
      {items.map(task => <button type="button" key={task.id} disabled={disabled} className="ai-daily-task-option" onClick={() => onSelect(task)}>
        <span>{dailyTaskTitle(task)}</span><small>{dailyStatus(task)} · 截止 {dailyDate(task.metadata?.expireAt)}</small>
      </button>)}
      {!items.length && !loading && <p className="ai-daily-muted">没有找到相近任务，可修改搜索词，或作为新增任务。</p>}
    </div>
  </div>;
}

// HeroUI resolves a second compatible internationalized/date version in this workspace.
const DateField = ({ label, value, onChange }: { label: string; value: string | null; onChange: (value: string | null) => void }) =>
  <DatePicker size="sm" label={label} labelPlacement="outside" granularity="day" value={value ? parseDate(value) as unknown as NonNullable<DatePickerProps['value']> : null} onChange={(value: DatePickerProps['value']) => onChange(value?.toString() || null)} />;

/** One assistant message owns its proposals, inline editor and execution receipt. */
export const AiDailyResult = observer(({ draft, messageId, initialSaved }: { draft: DailyDraft; messageId: number; initialSaved?: DailyReceipt }) => {
  const ai = RootStore.Get(AiStore);
  const messages = ai.currentConversation.value?.messages || [];
  const position = messages.findIndex(message => message.id === messageId);
  const user = (position < 0 ? [] : messages.slice(0, position)).filter(message => message.role === 'user').at(-1);
  const context = (user?.metadata || {}) as any;
  const sourceTasks = (context.sources || []).filter((source: any) => source.type === 2) as DailyTaskSource[];
  const [extraTasks, setExtraTasks] = useState<DailyTaskSource[]>([]);
  const tasks = [...extraTasks, ...sourceTasks.filter(task => !extraTasks.some(extra => extra.id === task.id))];
  const [actions, setActions] = useState(() => draft.actions.map((value, index) => {
    const receipt = initialSaved?.applied?.find(item => item.key === `${messageId}:${index}`);
    return { value: receipt?.action || value, selected: !value.needsConfirmation && (value.action === 'create' || sourceTasks.some(task => task.id === value.taskId)), expectedUpdatedAt: undefined as string | undefined };
  }));
  const [saved, setSaved] = useState<DailyReceipt>(initialSaved || {});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [associating, setAssociating] = useState<number | null>(null);
  const [saveReport, setSaveReport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState(draft.title);
  const submitting = useRef(false);
  const locked = busy || ai.isAnswering || ai.isPreparing;
  const patch = (index: number, value: Partial<DailyAction>) => setActions(items => items.map((item, i) => i === index ? { ...item, value: { ...item.value, ...value } } : item));
  const valid = (value: DailyAction) => value.action === 'create' ? !!value.title?.trim() : tasks.some(task => task.id === value.taskId);
  const pending = actions.map((item, index) => ({ ...item, index })).filter(item => item.selected && !item.value.needsConfirmation && !saved.actions?.[item.index] && valid(item.value));
  const synced = Object.keys(saved.actions || {}).length;
  const remaining = actions.length - synced;
  const unresolved = actions.filter((item, index) => !saved.actions?.[index] && (item.value.needsConfirmation || !valid(item.value))).length;
  const status = dailyReceiptLabel(saved, actions.length);
  const date = context.workflow?.reviewDate || dailyDate(user?.createdAt);
  const selectTask = (index: number, task: DailyTaskSource) => {
    setExtraTasks(items => [task, ...items.filter(item => item.id !== task.id)]);
    setActions(items => items.map((item, i) => i === index ? { ...item, selected: true,
      expectedUpdatedAt: task.updatedAt ? new Date(task.updatedAt).toISOString() : undefined,
      value: { ...item.value, action: 'update', taskId: task.id, title: null, description: null, needsConfirmation: false },
    } : item));
    setAssociating(null);
  };
  const sync = async () => {
    if (submitting.current || locked) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      const result = await api.ai.syncDaily.mutate({ messageId, saveReport, title, content: draft.content,
        actions: pending.map(item => ({ index: item.index, value: item.value, expectedUpdatedAt: item.expectedUpdatedAt })) });
      setSaved(result);
      setExpanded(null); setAssociating(null);
      if (Object.keys(result.errors).length) setError('部分事项未同步，已成功事项不会重复执行。请展开失败项重新核对。');
      else RootStore.Get(ToastPlugin).success(pending.length ? `本次已同步 ${pending.length} 项` : '日报已保存');
      const message = messages.find(message => message.id === messageId);
      if (message) message.metadata = { ...(message.metadata as any || {}), dailySaved: result };
      RootStore.Get(BlinkoStore).refreshData();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '同步失败，请重试；重复提交不会重复创建。'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <section className="ai-daily-card" aria-label="每日整理变更卡片" aria-busy={busy}>
    <header className="ai-daily-header">
      <span className="ai-daily-heading-icon"><Icon icon="tabler:calendar-check" width={21} /></span>
      <div className="min-w-0 flex-1"><div className="ai-daily-title"><h3>{date !== '未设置' ? `${date} · 每日整理` : draft.title}</h3>
        <Chip size="sm" variant="flat" color={remaining === 0 && (synced > 0 || saved.reportId) ? 'success' : 'primary'}>{status}</Chip></div>
        <p className="ai-daily-muted" role="status">{synced ? `已同步 ${synced} 项${remaining ? ` · ${remaining} 项尚未同步` : ''}` : actions.length ? `${actions.length} 项变更建议${unresolved ? ` · ${unresolved} 项需核对` : ''}，确认后才会修改待办。` : '没有待办变更，可保存本次工作记录。'}</p>
      </div>
    </header>
    <div className="ai-daily-rows">
      {actions.map((item, index) => {
        const { value } = item;
        const receipt = saved.applied?.find(entry => entry.key === `${messageId}:${index}`);
        const source = receipt?.source || tasks.find(task => task.id === value.taskId);
        const savedId = saved.actions?.[index];
        const label = receipt?.title || value.title || dailyTaskTitle(source);
        const originalGoal = source?.content.replace(/^#+\s*/, '').replace(dailyTaskTitle(source), '').trim().replace(/\s+/g, ' ').slice(0, 100);
        const deltas = savedId && value.action === 'update' && !source
          ? [{ field: 'progress', label: '已更新', after: value.progress || value.nextStep || '已同步至关联任务' }]
          : dailyDeltas(value, source);
        const issue = !!value.needsConfirmation || !valid(value);
        const entryError = saved.errors?.[index];
        const opened = expanded === index;
        const deadline = value.due === null ? source?.metadata?.expireAt : value.due;
        const overdue = deadline && dailyDate(deadline) < date && value.status !== 'done' && !source?.isArchived;
        return <div className="ai-daily-row" key={index} data-attention={issue && !savedId ? 'true' : undefined} data-synced={savedId ? 'true' : undefined}>
          <div className="ai-daily-row-main">
            <Checkbox size="sm" aria-label={`同步 ${label}`} isSelected={!!savedId || item.selected} isDisabled={locked || !!savedId || !!value.needsConfirmation || !valid(value)}
              onValueChange={selected => setActions(items => items.map((it, i) => i === index ? { ...it, selected } : it))} />
            <div className="ai-daily-row-title"><strong>{label}</strong>
              {savedId ? <Link to={`/detail?id=${savedId}`} className="ai-daily-success">已同步 <Icon icon="tabler:arrow-up-right" width={13} /></Link>
                : <span className={issue ? 'ai-daily-warning' : 'ai-daily-muted'}>{issue ? '待确认' : value.action === 'create' ? '建议新增' : '更新原任务'}</span>}
              {!!originalGoal && <small className="ai-daily-original-goal">原目标：{originalGoal}</small>}
            </div>
            <div className="ai-daily-changes">
              {deltas.slice(0, 2).map(delta => <div className="ai-daily-delta" key={delta.field}><span className="ai-daily-field">{delta.label}</span>
                {delta.before && <><span className="ai-daily-before">{delta.before}</span><Icon icon="tabler:arrow-right" width={13} /></>}
                <span className="ai-daily-after">{delta.after}</span></div>)}
              {!deltas.length && <span className="ai-daily-muted">保留原任务内容</span>}
              <div className="ai-daily-dates">{value.planDate && !deltas.slice(0, 2).some(delta => delta.field === 'planDate') && <small className="ai-daily-muted">计划 {dailyDate(source?.metadata?.planDate)} → {value.planDate}</small>}
              {deadline && <small className={overdue ? 'ai-daily-danger' : 'ai-daily-muted'}>截止 {dailyDate(deadline)}{value.due === null ? '不变' : ''}{overdue ? ' · 已逾期' : ''}</small>}</div>
              {entryError && <span className="ai-daily-danger" role="alert">{entryError}</span>}
            </div>
            <Button size="sm" variant="light" color="primary" isDisabled={locked} aria-expanded={opened} aria-controls={`daily-edit-${messageId}-${index}`}
              onPress={() => { setExpanded(opened ? null : index); setAssociating(issue && !opened ? index : null); }}>{savedId ? '查看结果' : issue ? '选择任务' : value.action === 'create' ? '编辑' : '查看变化'}</Button>
          </div>
          {opened && <div className="ai-daily-inline-edit" id={`daily-edit-${messageId}-${index}`}>
            <p className="ai-daily-muted">依据：{value.reason}</p>
            {source && <p className="ai-daily-muted">原目标：{source.content}</p>}
            {savedId ? <><p className="ai-daily-success">本项已执行，重复提交不会再次写入。</p>{deltas.slice(2).map(delta => <p key={delta.field}>{delta.label}：{delta.before ? `${delta.before} → ` : ''}{delta.after}</p>)}</> : <fieldset disabled={locked}>
              <div className="ai-daily-association"><span>关联：{source ? dailyTaskTitle(source) : '作为新任务'}</span>
                <Button size="sm" variant="light" color="primary" isDisabled={locked} onPress={() => setAssociating(associating === index ? null : index)}>更换关联</Button>
                {value.action !== 'create' && <Button size="sm" variant="light" isDisabled={locked} onPress={() => patch(index, { action: 'create', taskId: null, title: label, description: '', needsConfirmation: false })}>作为新增</Button>}
              </div>
              {associating === index && <><DailyTaskPicker messageId={messageId} sources={tasks} disabled={locked} onSelect={task => selectTask(index, task)} />
                {value.action === 'create' && <Button size="sm" variant="flat" isDisabled={locked} onPress={() => { patch(index, { needsConfirmation: false }); setAssociating(null); }}>确认为新增任务</Button>}</>}
              <div className="ai-daily-edit-grid">
                {value.action === 'create' && <><Input size="sm" label="新任务标题" labelPlacement="outside" value={value.title || ''} onValueChange={title => patch(index, { title })} maxLength={500} />
                  <Textarea size="sm" label="任务目标" labelPlacement="outside" minRows={2} value={value.description || ''} onValueChange={description => patch(index, { description })} /></>}
                <Textarea size="sm" label="本次进展" labelPlacement="outside" minRows={2} value={value.progress} onValueChange={progress => patch(index, { progress })} />
                <Input size="sm" label="下一步" labelPlacement="outside" value={value.nextStep} onValueChange={nextStep => patch(index, { nextStep })} />
                <Select size="sm" label="任务状态" labelPlacement="outside" selectedKeys={[value.status || 'keep']} onChange={event => patch(index, { status: event.target.value === 'keep' ? null : event.target.value as DailyAction['status'] })}>
                  <SelectItem key="keep">保持原状态</SelectItem><SelectItem key="open">未完成／继续推进</SelectItem><SelectItem key="done">标记完成</SelectItem>
                </Select>
                <DateField label="计划执行日（空白保持原值）" value={value.planDate} onChange={planDate => patch(index, { planDate })} />
              </div>
              <details className="ai-daily-advanced"><summary>调整截止时间、优先级或原目标</summary>
                <div className="ai-daily-edit-grid"><DateField label="截止日期（空白保持原值）" value={value.due} onChange={due => patch(index, { due })} />
                  <Input size="sm" label="调整截止时间的原因" labelPlacement="outside" value={value.postponeReason} onValueChange={postponeReason => patch(index, { postponeReason })} />
                  <Select size="sm" label="优先级" labelPlacement="outside" selectedKeys={[value.priority || 'keep']} onChange={event => patch(index, { priority: event.target.value === 'keep' ? null : event.target.value as DailyAction['priority'] })}>
                    <SelectItem key="keep">保持原值</SelectItem><SelectItem key="ui">紧急且重要</SelectItem><SelectItem key="in">重要不紧急</SelectItem><SelectItem key="un">紧急不重要</SelectItem><SelectItem key="nn">普通</SelectItem>
                  </Select>
                  {value.action === 'update' && <Textarea size="sm" label="替换原目标（空白保留）" labelPlacement="outside" minRows={2} value={value.description || ''} onValueChange={description => patch(index, { description: description || null })} />}
                </div>
                <Button size="sm" variant="light" onPress={() => patch(index, { due: '' })}>明确清除截止时间</Button>
              </details>
              <div className="ai-daily-edit-actions"><span className="ai-daily-muted">这里只调整建议，同步后才生效。</span>
                <Button size="sm" variant="flat" color="primary" isDisabled={locked} onPress={() => { patch(index, { needsConfirmation: false }); setExpanded(null); setAssociating(null); }}>完成核对</Button></div>
            </fieldset>}
          </div>}
        </div>;
      })}
    </div>
    {!!draft.questions.length && <details className="ai-daily-details"><summary>补充问题与阻碍 · {draft.questions.length}</summary><ul>{draft.questions.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
    <details className="ai-daily-details"><summary>查看工作记录与日报草稿</summary>
      {context.displayContent && <div className="ai-daily-original">{context.displayContent}</div>}
      <p className="ai-daily-muted">下文为 AI 草稿；原始输入会保留，未同步建议不会被记录为已执行。</p><MarkdownRender content={draft.content} variant="chat" />
      <Input size="sm" label="日报标题" value={title} onValueChange={setTitle} isDisabled={locked} />
    </details>
    {error && <p role="alert" className="ai-daily-error">{error}</p>}
    <footer className="ai-daily-footer">
      <div className="ai-daily-footer-notes">
        <Checkbox size="sm" isSelected={saveReport} isDisabled={locked || !!saved.reportId} onValueChange={setSaveReport}>同时保存当天日报</Checkbox>
        <p className="ai-daily-muted">{unresolved ? `${unresolved} 项待确认暂不执行。` : ''}计划日调整不会改变截止时间。</p>
      </div>
      <div className="ai-daily-footer-actions">
        {!!synced && <Link to="/?path=todo" className="ai-daily-link">查看待办</Link>}
        {!!saved.reportId && <Link to={`/detail?id=${saved.reportId}`} className="ai-daily-link">查看日报</Link>}
        {(remaining > 0 || (!saved.reportId && saveReport)) && <Button color="primary" size="sm" isLoading={busy} isDisabled={locked || (!pending.length && (!saveReport || !!saved.reportId)) || !title.trim()} onPress={() => void sync()}>
          {pending.length ? `同步选中 ${pending.length} 项` : saved.reportId ? '选择待同步事项' : remaining > 0 && !pending.length && !saveReport ? '选择待同步事项' : '保存日报'}
        </Button>}
      </div>
    </footer>
  </section>;
});
