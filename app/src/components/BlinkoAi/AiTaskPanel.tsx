import { useEffect, useRef, useState } from 'react';
import { Button, Input, Textarea, Modal, ModalContent, ModalHeader, ModalBody, Switch } from '@heroui/react';
import { api } from '@/lib/trpc';
import { MarkdownRender } from '../Common/MarkdownRender';
import { taskSchedule, readTaskSchedule } from '@shared/lib/aiTaskSchedule';

type Task = Awaited<ReturnType<typeof api.aiTask.list.query>>[number];
const templates = [
  { name: '每日事项梳理', prompt: '根据我昨天和今天的待办及相关笔记，整理昨日进展、今日重点和当前阻塞。区分已完成、进行中、逾期和信息不足；列出今天最值得推进的 3–5 件事及依据。不要自行补充截止时间，不直接修改待办。', frequency: 'weekdays', time: '09:00' },
  { name: '每周工作复盘', prompt: '回顾本周一至当前的待办及相关笔记、闪念，整理工作成果、未完成事项、延期与原因、遇到的问题、改进建议和下周重点。以工作为主，明确的个人事项单列。引用来源，区分事实与推断，不编造量化成果，不修改原内容。', frequency: 'weekly', time: '18:00' },
];

export function AiTaskPanel({ open, onClose, modelReady }: { open: boolean; onClose: () => void; modelReady: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [time, setTime] = useState('09:00');
  const [frequency, setFrequency] = useState('weekdays');
  const [originalSchedule, setOriginalSchedule] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resultId, setResultId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [queued, setQueued] = useState<Record<number, string | null>>({});
  const form = useRef<HTMLElement>(null);
  const load = async () => setTasks(await api.aiTask.list.query());
  useEffect(() => {
    if (!open) return;
    setLoading(true); setError('');
    let active = true;
    const refresh = () => api.aiTask.list.query().then(value => { if (active) setTasks(value); }).catch(e => { if (active) setError(String(e.message || e)); }).finally(() => { if (active) setLoading(false); });
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { active = false; clearInterval(timer); };
  }, [open]);
  useEffect(() => {
    setQueued(previous => {
      const next = { ...previous };
      let changed = false;
      for (const task of tasks) if (task.id in next && (task.lastRun ? new Date(task.lastRun).toISOString() : null) !== next[task.id]) {
        delete next[task.id]; changed = true;
      }
      return changed ? next : previous;
    });
  }, [tasks]);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(''); setMessage('');
    try { await fn(); await load(); } catch (e: any) { setError(e.message || '操作失败，请重试'); }
    finally { setBusy(false); }
  };
  const reset = () => { setEditing(null); setName(''); setPrompt(''); setOriginalSchedule(null); };
  const edit = (task: Task) => {
    setEditing(task.id); setName(task.name); setPrompt(task.prompt);
    const parsed = readTaskSchedule(task.schedule);
    setOriginalSchedule(parsed ? null : task.schedule);
    if (parsed) { setTime(parsed.time); setFrequency(parsed.frequency); }
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return <Modal isOpen={open} onClose={onClose} size="4xl" scrollBehavior="inside" disableAnimation classNames={{ wrapper: '!z-[10080]', backdrop: '!z-[10079]' }}>
    <ModalContent>
      <ModalHeader>定时任务</ModalHeader>
      <ModalBody className="pb-6">
        <p className="text-sm text-default-500">按提示词自动检索并整理，结果保存在任务内。使用站点默认模型；不自动修改笔记或待办，也不会自动带入当前会话历史。执行时服务端需保持运行。</p>
        {!modelReady && <p className="text-sm text-warning-600">请先配置默认 AI 模型，再创建或运行任务。</p>}
        <section ref={form} className="space-y-3 rounded-xl border border-default-200 p-4">
          <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto text-sm font-medium">{editing ? '编辑任务' : '新建任务'}</h3>
            {!editing && templates.map(item => <Button key={item.name} size="sm" variant="flat" onPress={() => { setName(item.name); setPrompt(item.prompt); setTime(item.time); setFrequency(item.frequency); setOriginalSchedule(null); }}>{item.name}</Button>)}
          </div>
          <Input label="任务名称" value={name} onValueChange={setName} maxLength={255} isDisabled={busy} />
          <Textarea label="执行提示词" description="写清时间范围、参考哪些资料、输出结构，以及信息缺失时如何处理。" value={prompt} onValueChange={setPrompt} minRows={4} maxLength={30000} isDisabled={busy} />
          {originalSchedule ? <div className="flex items-center gap-2 text-sm text-default-500">保留原执行计划（UTC）：{originalSchedule}<Button size="sm" variant="light" onPress={() => setOriginalSchedule(null)}>重新设置</Button></div>
            : <div className="flex flex-wrap items-center gap-3 text-sm"><label>重复 <select aria-label="重复频率" className="rounded-lg border border-default-200 bg-content1 p-2" value={frequency} onChange={e => setFrequency(e.target.value)} disabled={busy}><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekly">每周五</option></select></label><label>时间 <input aria-label="执行时间" type="time" className="rounded-lg border border-default-200 bg-content1 p-2" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label><span className="text-xs text-default-500">北京时间 UTC+8</span></div>}
          <div className="flex justify-end gap-2">{editing && <Button size="sm" variant="light" onPress={reset} isDisabled={busy}>取消编辑</Button>}<Button size="sm" color="primary" isLoading={busy} isDisabled={!modelReady || !name.trim() || !prompt.trim()} onPress={() => void action(async () => {
            const input = { name: name.trim(), prompt: prompt.trim(), schedule: originalSchedule || taskSchedule(time, frequency) };
            if (editing) await api.aiTask.update.mutate({ id: editing, ...input }); else await api.aiTask.create.mutate(input);
            reset(); setMessage('任务已保存');
          })}>{editing ? '保存修改' : '创建并启用'}</Button></div>
        </section>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {message && <p role="status" className="text-sm text-default-500">{message}</p>}
        <h3 className="text-sm font-medium">我的任务 · {tasks.length}</h3>
        {loading && <p role="status" className="py-4 text-center text-sm text-default-400">正在加载任务…</p>}
        {!loading && !tasks.length && !error && <p className="py-4 text-center text-sm text-default-400">还没有定时任务，可从上方模板开始。</p>}
        {tasks.map(task => {
          const plan = readTaskSchedule(task.schedule);
          const result = task.lastResult as { success?: boolean; result?: string; error?: string } | null;
          return <article key={task.id} className="rounded-xl border border-default-200 p-4">
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium">{task.name}</h4><p className="mt-1 text-xs text-default-500">{plan ? `${{ daily: '每天', weekdays: '工作日', weekly: '每周五' }[plan.frequency]} ${plan.time} · 北京时间` : `${task.schedule} · UTC`}</p></div><Switch size="sm" aria-label={`启用 ${task.name}`} isSelected={task.isEnabled} isDisabled={busy || (!task.isEnabled && !modelReady)} onValueChange={enabled => void action(() => api.aiTask.toggle.mutate({ id: task.id, enabled }))} /></div>
            <p className="my-2 line-clamp-2 whitespace-pre-wrap text-xs text-default-500">{task.prompt}</p>
            <div className="flex flex-wrap items-center gap-1"><Button size="sm" variant="light" isDisabled={busy} onPress={() => edit(task)}>编辑</Button><Button size="sm" variant="light" isDisabled={busy || !modelReady || task.id in queued} onPress={() => void action(async () => { await api.aiTask.runNow.mutate({ id: task.id }); setQueued(value => ({ ...value, [task.id]: task.lastRun ? new Date(task.lastRun).toISOString() : null })); setMessage('已提交执行，完成后可在该任务中查看结果。'); })}>{task.id in queued ? '等待结果' : '立即执行'}</Button><Button size="sm" variant="light" isDisabled={!result} onPress={() => setResultId(resultId === task.id ? null : task.id)}>{resultId === task.id ? '收起结果' : '查看结果'}</Button><Button size="sm" variant="light" color="danger" isDisabled={busy} onPress={() => {
              if (deleteId !== task.id) { setDeleteId(task.id); return; }
              void action(async () => { await api.aiTask.delete.mutate({ id: task.id }); if (editing === task.id) reset(); setDeleteId(null); });
            }}>{deleteId === task.id ? '确认删除' : '删除'}</Button></div>
            <p className="mt-2 text-xs text-default-400">{task.lastRun ? `${result?.success ? '最近完成' : '最近失败'}：${new Date(task.lastRun).toLocaleString()}` : '尚未执行'}</p>
            {resultId === task.id && result && <div className="mt-3 max-h-80 overflow-auto border-t border-default-200 pt-3">{result.success ? <MarkdownRender content={result.result || '任务没有返回文字结果。'} /> : <p className="text-sm text-danger">{result.error || '执行失败，请检查模型配置后重试。'}</p>}</div>}
          </article>;
        })}
      </ModalBody>
    </ModalContent>
  </Modal>;
}
