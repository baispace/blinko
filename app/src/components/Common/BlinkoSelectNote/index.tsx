import { Input, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/trpc';
import { IconButton } from '../Editor/Toolbar/IconButton';
import { Icon } from '../Iconify/icons';
import { useTranslation } from 'react-i18next';

interface Props { iconButton?: React.ReactNode; onSelect: (item: any) => void; blackList?: number[]; tooltip?: string; autoClose?: boolean; }
export const BlinkoSelectNote = ({ iconButton, onSelect, blackList = [], tooltip = 'reference', autoClose = true }: Props) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    const request = ++version.current;
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try {
        const result = await api.notes.list.mutate({ searchText: query.trim(), type: -1, isArchived: null, size: 20, page }, { signal: controller.signal });
        if (request !== version.current) return;
        setItems(previous => page === 1 ? result : [...previous, ...result.filter(note => !previous.some(item => item.id === note.id))]);
        setHasMore(result.length === 20); setLoading(false);
      } catch (error) { if (request !== version.current || controller.signal.aborted) return; setLoading(false); setError('读取失败，请重试'); }
    }, query.trim() ? 180 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query, page, retry]);
  const available = items.filter(item => !blackList.includes(item.id));
  const pick = (item: any) => { if (!item) return; onSelect(item); setSelected(0); if (autoClose) setOpen(false); };
  return <Popover placement="top-start" isOpen={open} onOpenChange={next => { setOpen(next); if (next) { setPage(1); setQuery(''); setItems([]); setSelected(0); } }}>
    <PopoverTrigger><div>{iconButton || <IconButton tooltip={t(tooltip)} icon="ph:link" />}</div></PopoverTrigger>
    <PopoverContent className="w-[380px] max-w-[calc(100vw-24px)] p-2 items-stretch">
      <Input aria-label="搜索历史内容" placeholder="搜索标题、正文或标签" autoFocus value={query} onValueChange={value => { setQuery(value); setPage(1); setItems([]); setSelected(0); }} size="sm"
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setSelected(index => Math.min(index + 1, available.length - 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setSelected(index => Math.max(0, index - 1)); }
          if (event.key === 'Enter') { event.preventDefault(); pick(available[selected]); }
          if (event.key === 'Escape') setOpen(false);
        }} />
      <div className="mt-2 max-h-[min(360px,50vh)] overflow-auto" role="list" aria-label="可引用的历史内容">
        {!query && <p className="px-2 py-1 text-[11px] text-default-400">近期内容 · 可搜索更早的文章和任务</p>}
        {available.map((item, index) => <button type="button" role="listitem" key={item.id} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setSelected(index)} onClick={() => pick(item)} className={`block w-full rounded-lg p-2 text-left ${index === selected ? 'bg-default-100' : 'hover:bg-default-50'}`}>
          <div className="flex items-center gap-2"><Icon icon={item.type === 2 ? 'tabler:checkbox' : item.type === 1 ? 'tabler:notes' : 'tabler:bolt'} width={15} className="shrink-0 text-default-400" /><span className="truncate text-sm">{String(item.metadata?.title || item.content?.split('\n').find((line: string) => line.trim()) || '无标题').replace(/^#+\s*/, '')}</span></div>
          <p className="line-clamp-2 text-xs text-default-500 mt-1 leading-5">{item.content?.replace(/[#*`]/g, '').slice(0, 160)}</p>
          <p className="text-[10px] text-default-400 mt-1">{item.type === 2 ? item.isArchived ? '已完成待办' : '未完成待办' : item.type === 1 ? '笔记' : '闪念'} · #{item.id}</p>
        </button>)}
        {loading && <p role="status" className="text-xs text-default-400 p-3">正在读取…</p>}
        {error && <p role="alert" className="text-xs text-danger p-3">{error}<button type="button" className="ml-2 text-primary" onClick={() => setRetry(value => value + 1)}>重试</button></p>}
        {!loading && !error && !available.length && <p className="text-xs text-default-400 p-3">{query ? '没有匹配内容，请换个关键词' : '暂无可选内容，或已全部引用'}</p>}
        {hasMore && !error && <button type="button" disabled={loading} className="w-full py-2 text-xs text-primary" onClick={() => setPage(value => value + 1)}>加载更多</button>}
      </div>
    </PopoverContent>
  </Popover>;
};
