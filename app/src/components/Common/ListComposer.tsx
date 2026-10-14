import { useState } from 'react';
import { BlinkoEditor } from '@/components/BlinkoEditor';
import { TodoQuickAdd } from './TodoQuickAdd';
import { NoteType } from '@shared/lib/types';
import { useTranslation } from 'react-i18next';
import './listComposer.css';

export function ListComposer({ defaultType = NoteType.BLINKO, mixed = false }: { defaultType?: NoteType; mixed?: boolean; tag?: string }) {
  const { t } = useTranslation();
  const labels = [t('blinko'), t('notes'), t('todo')];
  const [type, setType] = useState(defaultType);
  const [todoOpened, setTodoOpened] = useState(defaultType === NoteType.TODO);
  const current = mixed ? type : defaultType;
  return <section className={`list-composer composer-${current} rounded-xl border border-default-200 bg-background transition-colors focus-within:border-primary/40`}>
    {mixed && <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
      {mixed && <div role="group" aria-label={t('new-content-type')} className="inline-flex gap-1 rounded-lg bg-default-100 p-1">
        {labels.map((label, index) => <button key={label} type="button" aria-pressed={current === index} onClick={() => { setType(index); if (index === NoteType.TODO) setTodoOpened(true); }} className={`rounded-md px-3 py-1 text-xs transition-colors ${current === index ? 'bg-background text-foreground shadow-sm' : 'text-default-500 hover:text-foreground'}`}>{label}</button>)}
      </div>}
    </div>}
    <div hidden={current === NoteType.TODO}><BlinkoEditor mode="create" fixedNoteType={current === NoteType.TODO ? NoteType.BLINKO : current} composerVariant={current === NoteType.NOTE ? 'note' : 'flash'} hideNoteTypeButton focusOnMount={false} withoutOutline /></div>
    {todoOpened && <div hidden={current !== NoteType.TODO}><TodoQuickAdd compact /></div>}
  </section>;
}
