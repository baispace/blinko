import { useRef, useState } from 'react';
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
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
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    requestAnimationFrame(()=>{if(!editor.isDestroyed)editor.chain().focus().insertContent(`${prefix}${trigger}`).run();});
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
    <Dropdown placement="bottom-start" isOpen={open} onOpenChange={setOpen}>
      <DropdownTrigger><Button size="sm" variant="light" radius="sm" className="document-action-button" aria-label="插入图片、附件或引用" onMouseDown={event => event.preventDefault()}>
        <Icon icon="tabler:plus" width={16} />插入<Icon icon="tabler:chevron-down" width={12} />
      </Button></DropdownTrigger>
      <DropdownMenu aria-label="插入内容" className="w-60" onAction={key=>items.find(item=>item.label===key)?.action()}>
        {items.map(item => <DropdownItem key={item.label} textValue={item.label} startContent={<Icon icon={item.icon} width={17} />} description={item.hint}>{item.label}</DropdownItem>)}
      </DropdownMenu>
    </Dropdown>
  </>;
};
