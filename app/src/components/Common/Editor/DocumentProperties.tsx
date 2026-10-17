import { observer } from 'mobx-react-lite';
import { Button, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@heroui/react';
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
  const current = types.find(type => type.value === store.noteType) || types[0];
  return <div className="document-properties" aria-label="内容类型和标签">
    {!hideType && (editable ? <Dropdown placement="bottom-start">
      <DropdownTrigger><Button size="sm" variant="light" radius="sm" className="document-property-type" aria-label={`内容类型：${current.label}，点击切换`}>
        <Icon icon={current.icon} width={15} /><span>{current.label}</span><Icon icon="tabler:chevron-down" width={12} />
      </Button></DropdownTrigger>
      <DropdownMenu aria-label="切换内容类型" selectionMode="single" disallowEmptySelection selectedKeys={[String(store.noteType)]}
        onAction={key=>{const type=types.find(item=>String(item.value)===String(key));if(type)store.noteType=type.value;}}>
        {types.map(type => <DropdownItem key={String(type.value)} textValue={type.label} startContent={<Icon icon={type.icon} width={16} />}>{type.label}</DropdownItem>)}
      </DropdownMenu>
    </Dropdown> : <span className="document-property-type"><Icon icon={current.icon} width={15} />{current.label}</span>)}
    <DocumentVisibleTags store={store} content={content} className="contents" />
    {editable && <HashtagButton store={store} content={content} label="添加标签" placement="document" />}
  </div>;
});
