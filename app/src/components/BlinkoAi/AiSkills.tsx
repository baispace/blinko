import { useState } from 'react';
import { api } from '@/lib/trpc';
import { AiSettingStore } from '@/store/aiSettingStore';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { BlinkoSelectNote } from '../Common/BlinkoSelectNote';
import { Icon } from '@/components/Common/Iconify/icons';

const skills = [
  { key: 'tasks' as const, title: '提取待办', icon: 'hugeicons:task-01', prompt: '请根据我接下来提供的内容，提取明确需要推进的事项，生成待办草稿。每项包含标题、截止时间、优先级、来源依据和下一步动作。缺失信息留空，不要自行补充。检查重复事项，不直接创建任务。' },
  { key: 'note' as const, title: '沉淀笔记', icon: 'hugeicons:note-01', prompt: '请根据我接下来提供的内容，整理工作笔记草稿。归纳主题并生成标题，按背景、关键信息、结论、待办事项和后续跟进组织。忽略闲聊和重复信息，保留来源线索，不直接保存。' },
  { key: 'today' as const, title: '今日优先级', icon: 'hugeicons:star', prompt: '请根据我接下来提供的任务和近期内容，列出今天优先处理的3–5件事，说明排序依据和第一步动作。区分事实与建议，信息不足时可以少于3件，不假设已读取日程或消息。' },
  { key: 'overdue' as const, title: '整理逾期', icon: 'hugeicons:clock-01', prompt: '请根据我接下来提供的逾期任务，按重要性和紧急程度排序。区分已知原因和可能原因，给出下一步处理建议、建议截止时间和需要同步的人员。没有依据的信息留空，不直接修改任务。' },
  { key: 'ideas' as const, title: '整理闪念', icon: 'hugeicons:bulb', prompt: '请将我接下来提供的闪念按主题整理，指出可以转为待办、沉淀为笔记或保留的内容。保留来源线索，允许保留原样，不直接修改或保存。' },
];

export const AiSkills = observer(() => {
  const store = RootStore.Get(AiStore);
  const settings = RootStore.Get(AiSettingStore);
  const [days, setDays] = useState(7);
  const [sourceMode, setSourceMode] = useState<'range' | 'selected'>('range');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const fixedScope = store.selectedSkill?.key === 'today' || store.selectedSkill?.key === 'overdue';
  const chosen = settings.allModels.value?.find(m => m.id === store.chatModelId);
  const destination = chosen ? `${chosen.provider?.title || ''} · ${chosen.title || chosen.modelKey}` : '当前默认模型的服务商';
  return <div className="w-full max-w-2xl px-3">
    <div className="flex flex-wrap justify-center gap-2">
      {skills.map(skill => <button key={skill.title} type="button" onClick={() => {
        store.withTools.save(false);
        store.withRAG.save(false);
        store.withOnline.save(false);
        const format = skill.title === '提取待办' ? '只返回一个 JSON 代码块：{"kind":"tasks","tasks":[{"title":"标题","description":"优先级、来源依据和下一步动作","due":"","priority":""}]}。due 仅在来源明确日期时填写 YYYY-MM-DD，否则空字符串。priority 使用 ui（紧急重要）、in（重要不紧急）、un（紧急不重要）、nn（普通），没有依据则空字符串。不要在正文生成标签，标签由用户从站点现有标签选择。' : skill.title === '沉淀笔记' ? '只返回一个 JSON 代码块：{"kind":"note","title":"标题","content":"Markdown正文"}。正文不重复标题，不生成标签，标签由用户从站点现有标签选择。' : '';
        store.selectedSkill = { title: skill.title, prompt: skill.prompt + format, key: skill.key };
        store.referencesNotes = []; setStatus(''); setSourceMode('range');
        requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea')?.focus());
      }} className="inline-flex items-center gap-2 px-3 py-2 rounded-full border border-default-200 text-sm text-default-600 hover:bg-default-100 hover:text-foreground transition-colors duration-150 focus-visible:outline-primary" aria-pressed={store.selectedSkill?.title === skill.title}>
        <Icon icon={skill.icon} width="17" height="17" />{skill.title}
      </button>)}
    </div>
    {store.selectedSkill ? <div className="mt-4 rounded-2xl bg-default-50 border border-default-200 p-4">
      <div className="flex items-center justify-between"><span className="text-sm font-medium">{store.selectedSkill.title} · 确认来源范围</span><button type="button" onClick={() => { store.selectedSkill = null; }} className="text-xs text-default-500">取消技能</button></div>
      <p className="text-xs text-default-500 mt-2 mb-3">{store.selectedSkill.key === 'today' ? '使用当前未完成待办和今天新增的记录，按截止时间、优先级及依赖关系排序。' : store.selectedSkill.key === 'overdue' ? '只读取截止时间已过且未完成的待办，排除已完成和无截止时间的任务。' : store.selectedSkill.key === 'ideas' ? '整理指定时间内的闪念，也可以只处理你选中的几条。' : '默认整理指定时间内的闪念和笔记，也可以切换为具体内容。提取待办会同时读取未完成任务，用于检查重复。'}</p>
      {!fixedScope && <div className="flex gap-3 items-center mb-3 text-sm">
        <select aria-label="来源方式" disabled={loading} value={sourceMode} onChange={e => { setSourceMode(e.target.value as 'range' | 'selected'); store.referencesNotes = []; setStatus(''); }} className="bg-transparent"><option value="range">按时间范围</option><option value="selected">选择具体内容</option></select>
        {sourceMode === 'range' && <select aria-label="时间范围" disabled={loading} value={days} onChange={e => { setDays(Number(e.target.value)); store.referencesNotes = []; setStatus(''); }} className="bg-transparent"><option value={1}>最近 1 天</option><option value={7}>最近 7 天</option><option value={30}>最近 30 天</option><option value={90}>最近 90 天</option></select>}
      </div>}
      {(fixedScope || sourceMode === 'range') && <button type="button" disabled={loading} onClick={async () => {
        const skill = store.selectedSkill;
        if (!skill) return;
        setLoading(true); setStatus('');
        try {
          const result = await api.ai.skillSources.query({ skill: skill.key, days });
          if (store.selectedSkill !== skill) return;
          store.referencesNotes = result.items as any;
          setStatus(result.items.length ? `已读取 ${result.items.length} 条，可在下方逐条移除。${result.limited ? '内容较多，仅使用最近更新的80条，请缩小范围或手动筛选。' : ''}` : '当前范围没有符合条件的内容，可以调整范围或直接输入。');
        } catch { setStatus('读取失败，请重试。'); } finally { setLoading(false); }
      }} className="px-3 py-2 rounded-lg bg-background border border-default-200 text-sm hover:bg-default-100 disabled:opacity-50">{loading ? '正在读取…' : '读取并预览来源'}</button>}
      {status && <p role="status" className="text-xs text-default-500 mt-2">{status}</p>}
      {!fixedScope && sourceMode === 'selected' &&       <BlinkoSelectNote autoClose={false} blackList={store.referencesNotes.map(n => n.id).filter((id): id is number => typeof id === "number")} onSelect={note => { if (!store.referencesNotes.some(n => n.id === note.id)) store.referencesNotes.push(note); }} iconButton={<button type="button" className="px-3 py-2 rounded-lg bg-background border border-default-200 text-sm hover:bg-default-100">＋ 选择已有内容</button>} />}
      <p className="text-xs text-default-400 mt-3">确认下方来源后点击发送，将这些内容发送给 {destination} 进行整理。结果先作为草稿。</p>
    </div> : <p className="text-center text-xs text-default-400 mt-3">选择一个技能开始，也可以直接提问。</p>}
  </div>;
});
