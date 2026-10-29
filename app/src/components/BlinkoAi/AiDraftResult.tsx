import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import Editor from '@/components/Common/Editor';
import { NoteType } from '@shared/lib/types';
import { observer } from 'mobx-react-lite';
import { Button, Checkbox, Input, Select, SelectItem, Textarea } from '@heroui/react';

const stripTags = (text: string) => text.replace(/(?<!:\/\/)(?<=\s|^)#[^\s#]+(?=\s|$)/g, '').replace(/\n{3,}/g, '\n\n').trim();

export function parseDraft(content: string) {
  try {
    const clean = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    const value = JSON.parse(clean.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? clean);
    if (value.kind === 'note' && typeof value.title === 'string' && typeof value.content === 'string') return value;
    if (value.kind === 'tasks' && Array.isArray(value.tasks) && value.tasks.length <= 100 && value.tasks.every(t => typeof t.title === 'string' && typeof t.description === 'string' && (!t.due || /^\d{4}-\d{2}-\d{2}$/.test(t.due)))) return value;
  } catch {}
  return null;
}
export const AiDraftResult = observer(function AiDraftResult({ draft, messageId, initialSaved = {} }: { draft: any; messageId: number; initialSaved?: Record<string, number> }) {
  const blinko = RootStore.Get(BlinkoStore);
  useEffect(() => { void blinko.tagList.call(); }, []);
  const [items, setItems] = useState(() => draft.kind === 'note' ? [{ title: draft.title, content: stripTags(draft.content), due: '', priority: '', tags: [] as string[], selected: true }] : draft.tasks.map(t => ({ title: t.title, content: stripTags(t.description), due: t.due ? t.due.slice(0, 16) + (t.due.length === 10 ? 'T23:59' : '') : '', priority: ['ui','in','un','nn'].includes(t.priority) ? t.priority : '', tags: [] as string[], selected: true })));
  const [saved, setSaved] = useState<Record<string, number>>(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = (index: number, patch: any) => setItems(previous => previous.map((item, i) => i === index ? { ...item, ...patch } : item));
  const pending = items.map((item, index) => ({ ...item, index })).filter(item => item.selected && !saved[item.index]);
  return <div className="ai-draft-result space-y-3 my-3">
    <div className="ai-result-heading"><p className="text-sm font-medium">{draft.kind === 'note' ? '笔记草稿' : '待办建议'}</p><span className="text-xs text-default-500">{draft.kind === 'note' ? '可直接编辑，确认后保存' : `${items.length} 项 · 选择后创建`}</span></div>
    {!items.length && <p className="text-sm text-default-500">没有提取到明确的待办，可以补充内容后再试。</p>}
    {items.map((item, index) => <div key={index} className={`ai-result-item rounded-xl border border-default-200 p-4 space-y-3 ${saved[index]?'is-saved':''}`}>
      {saved[index] ? <div className="flex justify-between text-sm"><span>已保存为草稿 · {item.title}</span><Link className="text-primary" to={`/detail?id=${saved[index]}`}>打开{draft.kind === 'note' ? '笔记' : '待办'}</Link></div> : <>
        <div className="flex gap-2 items-center">{draft.kind === 'tasks' && <Checkbox aria-label={`选择 ${item.title}`} isSelected={item.selected} isDisabled={busy} onValueChange={selected => edit(index, { selected })} />}<Input aria-label="标题" placeholder="填写标题" variant="underlined" size="sm" isDisabled={busy} value={item.title} onValueChange={title => edit(index, { title })} classNames={{input:'font-medium'}} /></div>
        {draft.kind === 'tasks' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input type="datetime-local" label="截止时间" labelPlacement="outside" description={!item.due?'未提供日期，保持留空':undefined} size="sm" variant="bordered" isDisabled={busy} value={item.due} onValueChange={due=>edit(index,{due})} />
          <Select label="优先级" labelPlacement="outside" placeholder="待确认" size="sm" variant="bordered" isDisabled={busy} selectedKeys={item.priority?[item.priority]:[]} onSelectionChange={keys=>{if(keys!=='all')edit(index,{priority:Array.from(keys)[0] || ''});}}>
            <SelectItem key="ui">紧急且重要</SelectItem><SelectItem key="in">重要不紧急</SelectItem><SelectItem key="un">紧急不重要</SelectItem><SelectItem key="nn">普通</SelectItem>
          </Select>
        </div>}
        <Select label="站点标签" labelPlacement="outside" placeholder="选择标签（可选）" aria-label="站点标签" size="sm" variant="bordered" selectionMode="multiple" isMultiline isDisabled={busy || !blinko.tagList.value?.pathTags?.length} selectedKeys={new Set(item.tags)} onSelectionChange={keys=>{if(keys!=='all')edit(index,{tags:Array.from(keys).map(String)});}}>
          {(blinko.tagList.value?.pathTags || []).map(tag=><SelectItem key={tag} textValue={tag}>#{tag}</SelectItem>)}
        </Select>
        {draft.kind === 'note' ? <Editor mode="edit" content={item.content} onChange={content => edit(index, { content })} onSend={async () => {}} hiddenToolbar withoutOutline hideNoteTypeButton hideFullscreenButton focusOnMount={false} editable={!busy} fixedNoteType={NoteType.BLINKO} /> : <Textarea label="任务描述" labelPlacement="outside" isDisabled={busy} value={item.content} onValueChange={content=>edit(index,{content})} minRows={3} maxRows={10} variant="bordered" size="sm" />}
      </>}
    </div>)}
    {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    {!!pending.length && <Button color="primary" radius="sm" size="sm" isLoading={busy} isDisabled={busy || pending.some(t => !t.title.trim())} onPress={async () => {
      setBusy(true); setError('');
      try { const result = await api.ai.saveDraft.mutate({ messageId, drafts: pending.map(({ index, title, content, due, priority, tags }) => ({ index, title, content, due: due ? new Date(due).toISOString() : '', priority, tags })) }); setSaved(result as Record<string, number>); RootStore.Get(BlinkoStore).refreshData(); RootStore.Get(ToastPlugin).success(`已保存 ${Object.keys(result).length} 项草稿`); }
      catch { setError('保存失败，未完成的条目可以重试。'); }
      finally { setBusy(false); }
    }}>{busy ? '正在保存…' : draft.kind === 'note' ? '保存为笔记' : `创建选中的 ${pending.length} 个待办`}</Button>}
  </div>;
});
