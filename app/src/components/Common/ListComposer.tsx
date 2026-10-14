import { useState } from 'react';
import { BlinkoEditor } from '@/components/BlinkoEditor';
import { TodoQuickAdd } from './TodoQuickAdd';
import { NoteType } from '@shared/lib/types';
import './listComposer.css';

const labels = ['闪念', '笔记', '待办'];
export function ListComposer({ defaultType = NoteType.BLINKO, mixed = false, tag }: { defaultType?: NoteType; mixed?: boolean; tag?: string }) {
  const [type, setType] = useState(defaultType);
  const [todoOpened, setTodoOpened] = useState(defaultType === NoteType.TODO);
  const current = mixed ? type : defaultType;
  return <section className={`list-composer composer-${current} rounded-xl border border-default-200 bg-background transition-colors focus-within:border-primary/40`}>
    <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
      {mixed ? <div role="group" aria-label="新建内容类型" className="inline-flex gap-1 rounded-lg bg-default-100 p-1">
        {labels.map((label, index) => <button key={label} type="button" aria-pressed={current === index} onClick={() => { setType(index); if (index === NoteType.TODO) setTodoOpened(true); }} className={`rounded-md px-3 py-1 text-xs transition-colors ${current === index ? 'bg-background text-foreground shadow-sm' : 'text-default-500 hover:text-foreground'}`}>{label}</button>)}
      </div> : <span className="text-xs font-medium text-default-500">{current === NoteType.NOTE ? '新建笔记' : current === NoteType.TODO ? '添加待办' : '快速记录'}</span>}
      {tag && <span className="ml-auto max-w-[180px] truncate text-xs text-primary bg-primary/5 rounded-md px-2 py-1" title={tag}>保存到 #{tag}</span>}
    </div>
    <div hidden={current === NoteType.TODO}><BlinkoEditor mode="create" fixedNoteType={current === NoteType.TODO ? NoteType.BLINKO : current} composerVariant={current === NoteType.NOTE ? 'note' : 'flash'} hideNoteTypeButton focusOnMount={false} withoutOutline /></div>
    {todoOpened && <div hidden={current !== NoteType.TODO}><TodoQuickAdd compact /></div>}
  </section>;
}
