import {aiTaskTemplates as templates} from './aiTaskTemplates';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { Button, Input, Textarea, Switch } from '@heroui/react';
import { RootStore } from '@/store';
import { AiTaskStore } from '@/store/aiTaskStore';
import { api } from '@/lib/trpc';
import { MarkdownRender } from '../Common/MarkdownRender';
import { taskSchedule, readTaskSchedule } from '@shared/lib/aiTaskSchedule';
type AiTask = Awaited<ReturnType<typeof api.aiTask.list.query>>[number];

/** Route-based scheduled task management. */
export const AiTaskPanel = observer(() => {
  const store = RootStore.Get(AiTaskStore);
  const navigate = useNavigate();
  const { taskId } = useParams();
  const creating = taskId === 'new';
  const selectedId = taskId && !creating ? Number(taskId) : null;
  const modelReady = !!RootStore.Get(BlinkoStore).config.value?.mainModelId;
  useEffect(() => { store.start(); return () => store.stop(); }, [store]);
  const onClose = () => { if (!store.busy) navigate('/ai/tasks'); };
  const { tasks, loading, busy } = store;
  const error = store.error;
  const [detailTab, setDetailTab] = useState<'settings' | 'result'>('settings');
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [time, setTime] = useState('09:00');
  const [frequency, setFrequency] = useState('weekdays');
  const [originalSchedule, setOriginalSchedule] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [resultId, setResultId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [queued, setQueued] = useState<Record<number, string | null>>({});
  const form = useRef<HTMLElement>(null);
  const action = (fn: () => Promise<unknown>) => { setMessage(''); void store.run(fn); };
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
  useEffect(() => { setDetailTab('settings'); setEditing(null); setName(''); setPrompt(''); setTime('09:00'); setFrequency('weekdays'); setOriginalSchedule(null); setMessage(''); setResultId(null); setDeleteId(null); }, [taskId]);
  const edit = (task: AiTask) => {
    setEditing(task.id); setName(task.name); setPrompt(task.prompt);
    const parsed = readTaskSchedule(task.schedule);
    setOriginalSchedule(parsed ? null : task.schedule);
    if (parsed) { setTime(parsed.time); setFrequency(parsed.frequency); }
    form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (selectedId == null || editing === selectedId) return;
    const task = tasks.find(item => item.id === selectedId);
    if (task) { edit(task); setResultId(task.id); }
  }, [selectedId, tasks, editing]);
  return <main className="h-full w-full overflow-y-auto pt-14 md:pt-0">
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-10">
      <header className="mb-6 flex items-center justify-between gap-4 border-b border-default-200 pb-5">
        <div><Button size="sm" variant="light" onPress={() => navigate(taskId ? '/ai/tasks' : '/ai')}>{taskId ? '返回任务列表' : '返回对话'}</Button><h1 className="mt-3 text-2xl font-semibold">{creating ? '新建定时任务' : selectedId != null ? '任务详情' : '定时任务'}</h1></div>
        {!taskId && <Button color="primary" isDisabled={busy} onPress={() => navigate('/ai/tasks/new')}>新建定时任务</Button>}
      </header>
      <div className="space-y-5">
        <p className="text-sm text-default-500">按提示词自动检索并整理，结果保存在任务内。使用站点默认模型；不自动修改笔记或待办，也不会自动带入当前会话历史。执行时服务端需保持运行。</p>
        {!loading && selectedId != null && !tasks.some(task => task.id === selectedId) && !error && <p role="status">任务不存在或已删除。<Button variant="light" onPress={onClose}>返回列表</Button></p>}
        {!modelReady && <p className="text-sm text-warning-600">请先配置默认 AI 模型，再创建或运行任务。</p>}
        {selectedId != null && <nav aria-label="任务详情" className="flex gap-5 border-b border-default-200">{(['settings', 'result'] as const).map(tab => <button key={tab} type="button" aria-current={detailTab === tab ? 'page' : undefined} className="border-b-2 border-transparent px-1 py-3 text-sm text-default-500 aria-[current=page]:border-primary aria-[current=page]:text-primary" onClick={() => setDetailTab(tab)}>{tab === 'settings' ? '任务设置' : '最近结果'}</button>)}</nav>}
        {(creating || (editing != null && detailTab === 'settings')) && <section ref={form} className="space-y-3">
          <h3 className="text-sm font-medium">{creating?'设置执行计划':'编辑任务'}</h3>
          {creating&&<div className="flex flex-wrap gap-2">{templates.map(item=><Button key={item.name} size="sm" variant="flat" isDisabled={busy} onPress={()=>{setName(item.name);setPrompt(item.prompt);setTime(item.time);setFrequency(item.frequency);}}>{item.name}</Button>)}</div>}
          <Input label="任务名称" value={name} onValueChange={setName} maxLength={255} isDisabled={busy} />
          <Textarea label="执行提示词" description="写清时间范围、参考哪些资料、输出结构，以及信息缺失时如何处理。" value={prompt} onValueChange={setPrompt} minRows={4} maxLength={30000} isDisabled={busy} />
          {originalSchedule ? <div className="flex items-center gap-2 text-sm text-default-500">保留原执行计划（UTC）：{originalSchedule}<Button size="sm" variant="light" onPress={() => setOriginalSchedule(null)}>重新设置</Button></div>
            : <div className="flex flex-wrap items-center gap-3 text-sm"><label>重复 <select aria-label="重复频率" className="rounded-lg border border-default-200 bg-content1 p-2" value={frequency} onChange={e => setFrequency(e.target.value)} disabled={busy}><option value="daily">每天</option><option value="weekdays">工作日</option><option value="weekly">每周五</option></select></label><label>时间 <input aria-label="执行时间" type="time" className="rounded-lg border border-default-200 bg-content1 p-2" value={time} onChange={e => setTime(e.target.value)} disabled={busy} /></label><span className="text-xs text-default-500">北京时间 UTC+8</span></div>}
          <div className="flex justify-end gap-2"><Button size="sm" variant="light" onPress={()=>onClose()} isDisabled={busy}>取消</Button><Button size="sm" color="primary" isLoading={busy} isDisabled={!modelReady || !name.trim() || !prompt.trim()} onPress={() => void action(async () => {
            if(creating){const task = await api.aiTask.create.mutate({name:name.trim(),prompt:prompt.trim(),schedule:taskSchedule(time,frequency)});navigate(`/ai/tasks/${task.id}`);}
            else {await api.aiTask.update.mutate({ id: editing!, name: name.trim(), prompt: prompt.trim(), schedule: originalSchedule || taskSchedule(time, frequency) });}
            setMessage('任务已保存');
          })}>{creating?'创建并启用':'保存修改'}</Button></div>
        </section>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {message && <p role="status" className="text-sm text-default-500">{message}</p>}
        {!creating && (selectedId == null || detailTab === 'result') && <>
        <h3 className="text-sm font-medium">{selectedId == null ? `我的任务 · ${tasks.length}` : '最近执行结果'}</h3>
        {loading && <p role="status" className="py-4 text-center text-sm text-default-400">正在加载任务…</p>}
        {!loading && !tasks.length && !error && <p className="py-4 text-center text-sm text-default-400">还没有定时任务，点击“新建定时任务”设置执行计划。</p>}
        {tasks.filter(task => selectedId == null || task.id === selectedId).map(task => {
          const plan = readTaskSchedule(task.schedule);
          const result = task.lastResult as { success?: boolean; result?: string; error?: string } | null;
          return <article key={task.id} className="rounded-xl border border-default-200 p-4">
            <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><h4 className="break-words text-sm font-medium">{task.name}</h4><p className="mt-1 text-xs text-default-500">{plan ? `${{ daily: '每天', weekdays: '工作日', weekly: '每周五' }[plan.frequency]} ${plan.time} · 北京时间` : `${task.schedule} · UTC`}</p></div><Switch size="sm" aria-label={`启用 ${task.name}`} isSelected={task.isEnabled} isDisabled={busy || (!task.isEnabled && !modelReady)} onValueChange={enabled => void action(() => api.aiTask.toggle.mutate({ id: task.id, enabled }))} /></div>
            {selectedId == null && <p className="my-2 line-clamp-2 whitespace-pre-wrap text-xs text-default-500">{task.prompt}</p>}
            <div className="flex flex-wrap items-center gap-1">{selectedId == null && <Button size="sm" variant="light" isDisabled={busy} onPress={() => navigate(`/ai/tasks/${task.id}`)}>打开任务</Button>}<Button size="sm" variant="light" isDisabled={busy || !modelReady || task.id in queued} onPress={() => void action(async () => { await api.aiTask.runNow.mutate({ id: task.id }); setQueued(value => ({ ...value, [task.id]: task.lastRun ? new Date(task.lastRun).toISOString() : null })); setMessage('已提交执行，完成后可在该任务中查看结果。'); })}>{task.id in queued ? '等待结果' : '立即执行'}</Button><Button size="sm" variant="light" isDisabled={!result} onPress={() => setResultId(resultId === task.id ? null : task.id)}>{resultId === task.id ? '收起结果' : '查看结果'}</Button><Button size="sm" variant="light" color="danger" isDisabled={busy} onPress={() => {
              if (deleteId !== task.id) { setDeleteId(task.id); return; }
              void action(async () => { await api.aiTask.delete.mutate({ id: task.id }); if (selectedId === task.id) navigate('/ai/tasks'); setDeleteId(null); });
            }}>{deleteId === task.id ? '确认删除' : '删除'}</Button></div>
            <p className="mt-2 text-xs text-default-400">{task.lastRun ? `${result?.success ? '最近完成' : '最近失败'}：${new Date(task.lastRun).toLocaleString()}` : '尚未执行'}</p>
            {resultId === task.id && result && <div className={`mt-3 border-t border-default-200 pt-3 ${selectedId == null ? 'max-h-80 overflow-auto' : ''}`}>{result.success ? <MarkdownRender content={result.result || '任务没有返回文字结果。'} /> : <p className="text-sm text-danger">{result.error || '执行失败，请检查模型配置后重试。'}</p>}</div>}
          </article>;
        })}
        </>}
      </div>
    </div>
  </main>;
});
