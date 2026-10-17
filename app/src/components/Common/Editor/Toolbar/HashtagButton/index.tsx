import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Input, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { EditorStore } from '../../editorStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { RootStore } from '@/store/root';

interface Props { store: EditorStore; content: string; label?: string; placement?: 'cursor' | 'document' }
export const HashtagButton = observer(({ store, label, placement = 'cursor' }: Props) => {
  const blinko = RootStore.Get(BlinkoStore);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const query = search.trim().replace(/^#+/, '').toLocaleLowerCase();
  const tags = (blinko.tagList.value?.pathTags ?? []).filter(path => !query || path.toLocaleLowerCase().includes(query));
  const load = async () => { blinko.tagList.errMsg = ''; await blinko.tagList.call(); };
  const insert = (path: string) => {
    const editor = store.vditor?.editor;
    if (!editor || !editor.isEditable) return;
    if (placement === 'document') {
      if (editor.state.doc.textContent.split(/\s+/).includes(`#${path}`)) { setOpen(false); return; }
      const doc = editor.state.doc;
      const last = doc.lastChild;
      const tagParagraph = last?.type.name === 'paragraph' && /^(?:#[^\s#]+\s*)+$/.test(last.textContent);
      if (tagParagraph) {
        editor.chain().insertContentAt(doc.content.size - 1, { type: 'text', text: ` #${path}` }, { updateSelection: false }).run();
      } else {
        editor.chain().insertContentAt(doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: `#${path}` }] }, { updateSelection: false }).run();
      }
      store.onChange?.(store.vditor?.getValue() ?? '');
      setOpen(false);
      return;
    }
    const { $from } = editor.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, ' ', ' ');
    const prefix = before && !/\s$/.test(before) ? ' ' : '';
    editor.chain().focus().insertContent([{ type: 'text', text: `${prefix}#${path} ` }]).run();
    store.onChange?.(store.vditor?.getValue() ?? '');
    setOpen(false);
  };
  return <Popover placement="bottom-start" disableAnimation isOpen={open} onOpenChange={next => {
    setOpen(next);
    if (next) { setSearch(''); setSelected(0); void load(); }
  }}>
    <PopoverTrigger>
      <button type="button" aria-label="选择标签" className={`flex items-center justify-center rounded-md text-default-500 hover:bg-default-100 transition-colors ${label ? 'gap-1 px-2 py-1.5 text-xs' : 'w-7 h-7'}`}>
        <Icon icon="mingcute:hashtag-line" width="18" height="18" />{label && <span>{label}</span>}
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-[300px] max-w-[calc(100vw-24px)] p-2 items-stretch">
      <Input aria-label="搜索标签" placeholder="搜索标签名称或完整路径" size="sm" autoFocus value={search} onValueChange={value => { setSearch(value); setSelected(0); }} onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(Math.max(0, tags.length - 1), i + 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(0, i - 1)); }
        if (e.key === 'Enter' && tags[selected]) { e.preventDefault(); insert(tags[selected]); }
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      }} />
      <div className="max-h-64 overflow-y-auto mt-2" role="list" aria-label="站点标签">
        {blinko.tagList.loading.value && !tags.length && <p role="status" className="p-3 text-xs text-default-400">正在加载标签…</p>}
        {tags.map((path, index) => <button type="button" key={path} onClick={() => insert(path)} onMouseEnter={() => setSelected(index)} className={`block w-full text-left rounded-lg px-2 py-2 text-sm break-words transition-colors ${index === selected ? 'bg-default-100 text-foreground' : 'text-default-600 hover:bg-default-100'}`}>#{path}</button>)}
        {!blinko.tagList.loading.value && !tags.length && <div className="p-3 text-sm text-default-500">
          {blinko.tagList.errMsg ? '标签加载失败，请重试。' : query ? '没有匹配标签，可换个关键词搜索。' : '暂无标签，可在正文输入 #标签名 创建。'}
          {blinko.tagList.errMsg && <button type="button" className="block mt-2 text-primary" onClick={() => void load()}>重新加载</button>}
        </div>}
      </div>
    </PopoverContent>
  </Popover>;
});
