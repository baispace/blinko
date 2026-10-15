import { useRef, useState } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import type { EditorStore } from './editorStore';

export const DocumentInsertMenu = ({ store, openAttachments }: { store: EditorStore; openAttachments: () => void }) => {
  const [open, setOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const insertTrigger = (trigger: string) => {
    setOpen(false);
    const editor = store.vditor?.editor;
    if (!editor) return;
    const { $from } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, ' ', ' ');
    editor.chain().focus().insertContent(`${before && !/\s$/.test(before) ? ' ' : ''}${trigger}`).run();
  };
  const items = [
    { label: '图片', hint: '也可粘贴或拖入', icon: 'tabler:photo', action: () => { setOpen(false); imageInput.current?.click(); } },
    { label: '附件', hint: '上传文件', icon: 'tabler:paperclip', action: () => { setOpen(false); openAttachments(); } },
    { label: '引用其他内容', hint: '@', icon: 'tabler:at', action: () => insertTrigger('@') },
    { label: '段落与内容块', hint: '/', icon: 'tabler:layout-list', action: () => insertTrigger('/') },
  ];
  return <>
    <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      if (files.length) void store.uploadFiles(files);
      event.currentTarget.value = '';
    }} />
    <Popover placement="bottom-end" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger><button type="button" className="document-action-button" onMouseDown={event => event.preventDefault()}>
        <Icon icon="tabler:plus" width={16} />插入<Icon icon="tabler:chevron-down" width={12} />
      </button></PopoverTrigger>
      <PopoverContent className="w-64 items-stretch p-1.5">
        {items.map(item => <button key={item.label} type="button" className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-default-100 text-left"
          onMouseDown={event => event.preventDefault()} onClick={item.action}>
          <Icon icon={item.icon} width={17} /><span className="flex-1">{item.label}</span><span className="text-[11px] text-default-400">{item.hint}</span>
        </button>)}
      </PopoverContent>
    </Popover>
  </>;
};
