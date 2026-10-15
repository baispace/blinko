import { observer } from 'mobx-react-lite';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { useState } from 'react';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import type { EditorStore } from './editorStore';
import { HashtagButton } from './Toolbar/HashtagButton';
import { DocumentVisibleTags } from './NoteCover';

const types = [
  { value: NoteType.NOTE, label: '笔记', icon: 'tabler:notes' },
  { value: NoteType.BLINKO, label: '闪念', icon: 'tabler:bolt' },
  { value: NoteType.TODO, label: '待办', icon: 'tabler:checkbox' },
];
export const DocumentProperties = observer(({ store, content, editable, hideType = false }: {
  store: EditorStore; content: string; editable: boolean; hideType?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const current = types.find(type => type.value === store.noteType) || types[0];
  return <div className="document-properties" aria-label="内容类型和标签">
    {!hideType && (editable ? <Popover placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger><button type="button" className="document-property-type" aria-label={`内容类型：${current.label}，点击切换`}>
        <Icon icon={current.icon} width={15} /><span>{current.label}</span><Icon icon="tabler:chevron-down" width={12} />
      </button></PopoverTrigger>
      <PopoverContent className="items-stretch p-1.5 w-44">
        <div className="px-2 py-1 text-xs text-default-400">切换内容类型</div>
        {types.map(type => <button key={type.value} type="button" aria-pressed={store.noteType === type.value}
          className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-default-100 text-left"
          onClick={() => { store.noteType = type.value; setOpen(false); }}>
          <Icon icon={type.icon} width={16} /><span className="flex-1">{type.label}</span>
          {store.noteType === type.value && <Icon icon="tabler:check" width={15} className="text-primary" />}
        </button>)}
      </PopoverContent>
    </Popover> : <span className="document-property-type"><Icon icon={current.icon} width={15} />{current.label}</span>)}
    <DocumentVisibleTags store={store} content={content} className="contents" />
    {editable && <HashtagButton store={store} content={content} label="添加标签" placement="document" />}
  </div>;
});
