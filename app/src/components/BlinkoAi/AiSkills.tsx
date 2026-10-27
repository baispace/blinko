import { useState } from 'react';
import { api } from '@/lib/trpc';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoSelectNote } from '../Common/BlinkoSelectNote';
import { Icon } from '@/components/Common/Iconify/icons';
import { workflows } from '@shared/lib/aiWorkflows';

const localDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(date);
export const AiSkills = observer(() => {
  const store = RootStore.Get(AiStore);
  const [days, setDays] = useState(7);
  const [sourceMode, setSourceMode] = useState<'range' | 'selected'>('range');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [more, setMore] = useState(false);
  const skill = store.selectedSkill;
  const reporting = skill?.key === 'daily' || skill?.key === 'weekly';
  const specific = skill?.key === 'practice' || sourceMode === 'selected';
  const fixed = skill?.key === 'today' || skill?.key === 'overdue';
  const select = (workflow: typeof workflows[number]) => {
    if (store.isAnswering || store.isPreparing) return;
    store.withTools.save(false); store.withRAG.save(false); store.withOnline.save(false);
    const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
    store.selectedSkill = { ...workflow, scope: { from: localDate(workflow.key === 'daily' ? new Date(now.getTime() - 86400000) : monday), to: localDate(now), includeNotes: false, read: false } };
    store.referencesNotes = []; setStatus(''); setSourceMode(workflow.key === 'practice' ? 'selected' : 'range');
  };
  const invalidate = (patch: object) => { if (skill) { skill.scope = { ...skill.scope, ...patch, read: false }; store.referencesNotes = []; setStatus(''); } };
  return <div className="ai-workflows w-full">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {workflows.slice(0,3).map(workflow => <button type="button" key={workflow.key} disabled={loading || store.isAnswering || store.isPreparing} aria-pressed={skill?.key === workflow.key} onClick={() => select(workflow)} className={`text-left rounded-xl border px-3 py-3 transition-colors ${skill?.key === workflow.key ? 'border-primary/30 bg-primary/5' : 'border-default-200 hover:bg-default-50'}`}>
        <div className="flex items-center gap-2 text-sm font-medium"><Icon icon={workflow.icon} width={17} />{workflow.title}</div><p className="mt-1.5 text-xs text-default-500 leading-5">{workflow.hint}</p>
      </button>)}
    </div>
    <button type="button" className="mt-2 text-xs text-default-500" onClick={() => setMore(!more)} aria-expanded={more}>{more ? '收起其他工具' : '其他工具'} <span aria-hidden>{more ? '⌃' : '⌄'}</span></button>
    {more && <div className="flex flex-wrap gap-2 mt-2">{workflows.slice(3).map(workflow => <button type="button" key={workflow.key} disabled={loading || store.isAnswering || store.isPreparing} aria-pressed={skill?.key === workflow.key} onClick={() => select(workflow)} className={`rounded-lg px-2 py-1.5 text-xs ${skill?.key === workflow.key ? 'bg-primary/10 text-primary' : 'bg-default-100 text-default-600'}`}>{workflow.title}</button>)}</div>}
    {skill && <section className="mt-3 rounded-xl border border-default-200 bg-default-50 p-3">
      <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{skill.title}</span><button type="button" disabled={loading || store.isAnswering || store.isPreparing} className="text-xs text-default-500" onClick={() => { store.selectedSkill = null; setStatus(''); }}>取消</button></div>
      <p className="text-xs text-default-500 leading-5 mt-2">{skill.key === 'daily' ? '填写昨日进展与今日安排，发送时自动读取未完成待办、近期变更及最近日报。确认后追加进度、同步状态；计划顺延不会修改截止时间。' : skill.key === 'weekly' ? '按更新时间读取区间内待办，包含已完成事项；不会把更新时间当作完成时间。' : skill.key === 'practice' ? '引用一篇或几篇文章，并在输入框写下你的答案或希望讨论的问题。没有答案时先引导练习。' : fixed ? '按任务状态筛选来源，读取后可以移除不相关内容。' : '选择时间范围或具体内容，结果先预览，确认后再保存。'}</p>
      {reporting ? <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
        <label>从 <input aria-label="开始日期" type="date" disabled={loading || store.isAnswering || store.isPreparing} value={skill.scope?.from || ''} onChange={event => invalidate({ from: event.target.value })} className="rounded border border-default-200 bg-background p-1.5" /></label>
        <label>至 <input aria-label="结束日期" type="date" disabled={loading || store.isAnswering || store.isPreparing} value={skill.scope?.to || ''} onChange={event => invalidate({ to: event.target.value })} className="rounded border border-default-200 bg-background p-1.5" /></label>
        <label className="flex items-center gap-1.5"><input type="checkbox" disabled={loading || store.isAnswering || store.isPreparing} checked={!!skill.scope?.includeNotes} onChange={event => invalidate({ includeNotes: event.target.checked })} />补充笔记和闪念</label>
      </div> : !fixed && skill.key !== 'practice' && <div className="flex gap-2 mt-3 text-xs">
        <select aria-label="来源方式" value={sourceMode} disabled={loading || store.isAnswering || store.isPreparing} onChange={event => { setSourceMode(event.target.value as any); store.referencesNotes = []; setStatus(''); }} className="bg-background border border-default-200 rounded p-1.5"><option value="range">按时间范围</option><option value="selected">选择具体内容</option></select>
        {!specific && <select aria-label="时间范围" value={days} disabled={loading || store.isAnswering || store.isPreparing} onChange={event => { setDays(Number(event.target.value)); store.referencesNotes = []; setStatus(''); }} className="bg-background border border-default-200 rounded p-1.5">{[1,7,30,90].map(day => <option key={day} value={day}>最近 {day} 天</option>)}</select>}
      </div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {(!specific || reporting || fixed) && <button type="button" disabled={loading || store.isAnswering || store.isPreparing} className="rounded-lg border border-default-200 bg-background px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
          const selected = store.selectedSkill; if (!selected) return;
          setLoading(true); setStatus('');
          try {
            const result = await api.ai.skillSources.query({ skill: selected.key, days, ...(reporting ? selected.scope : {}) });
            if (store.selectedSkill !== selected) return;
            store.referencesNotes = result.items as any;
            selected.scope = { ...selected.scope, read: true, limited: result.limited, sourceCount: result.items.length };
            setStatus(`已读取 ${result.items.length} 条来源。${!result.items.length ? '当前范围暂无内容，可调整范围或输入补充要点。' : ''}${result.limited ? '仅取最近80条待办和20条补充内容，不能据此计算全量统计；建议缩小范围。' : '可移除不相关内容，再点击发送。'}`);
          } catch (error) { setStatus(error instanceof Error ? error.message : '读取失败，请重试'); }
          finally { setLoading(false); }
        }}>{loading ? '正在读取…' : reporting ? '读取历史待办' : '读取来源'}</button>}
        <BlinkoSelectNote autoClose={false} blackList={store.referencesNotes.map(note => note.id!)} onSelect={note => { if (!store.referencesNotes.some(source => source.id === note.id)) store.referencesNotes.push(note); }} iconButton={<button type="button" disabled={loading || store.isAnswering || store.isPreparing} className="rounded-lg border border-default-200 bg-background px-3 py-2 text-xs">＋ {skill.key === 'practice' ? '引用练习文章' : '补充指定内容'}</button>} />
      </div>
      {status && <p role="status" className="mt-2 text-xs text-default-500 leading-5">{status}</p>}
    </section>}
  </div>;
});
