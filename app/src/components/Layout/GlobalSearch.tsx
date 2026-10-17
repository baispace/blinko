import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalContent, ModalBody, Spinner } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { UserStore } from '@/store/user';
import { AiStore } from '@/store/aiStore';
import { observer } from 'mobx-react-lite';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/trpc';
import { allSettings } from '@/components/BlinkoSettings/settingsRegistry';
import { ShowSettingsDialog } from '../BlinkoSettings/SettingsDialog';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { isDesktop, downloadFromLink } from '@/lib/tauriHelper';
import { cn } from '@/lib/utils';
import { searchSnippet, tagPath } from './searchUtils';

type Category = 'all' | 'flash' | 'notes' | 'todo' | 'tags' | 'files' | 'settings';
type Hit = { key: string; kind: string; title: string; summary?: string; info?: string; action: () => void };
const icons: Record<string, string> = { flash: 'tabler:bulb', notes: 'hugeicons:sticky-note-02', todo: 'tabler:list-check', tags: 'tabler:tags', files: 'tabler:file-import', settings: 'tabler:settings', ai: 'hugeicons:ai-beautify' };
function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return <>{parts.map((part, index) => part.toLocaleLowerCase() === term.toLocaleLowerCase()
    ? <mark key={index} className="rounded-sm bg-primary/10 text-primary">{part}</mark> : <React.Fragment key={index}>{part}</React.Fragment>)}</>;
}
export const GlobalSearch = observer(({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) => {
  const { t, i18n } = useTranslation();
  const label = (zh: string, en: string) => i18n.language.startsWith('zh') ? zh : en;
  const navigate = useNavigate(), blinkoStore = RootStore.Get(BlinkoStore), aiStore = RootStore.Get(AiStore);
  const [query, setQuery] = useState(''), [category, setCategory] = useState<Category>('all');
  const [hits, setHits] = useState<Hit[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(false), [limited, setLimited] = useState(false), [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null), request = useRef(0);
  const [retry,setRetry] = useState(0);
  const term = query.trim().replace(/^[@#]/, '').trim(), aiOnly = query.trimStart().startsWith('@'), onlyTags = query.trimStart().startsWith('#');
  const categories: { key: Category; name: string }[] = [{ key: 'all', name: label('全部', 'All') }, { key: 'flash', name: label('闪念', 'Memos') }, { key: 'notes', name: t('note') }, { key: 'todo', name: t('todo') }, { key: 'tags', name: t('tag') }, { key: 'files', name: label('文件', 'Files') }, { key: 'settings', name: t('settings') }];
  const close = () => onOpenChange(false);
  useEffect(() => { if (isOpen) { setQuery(''); setCategory('all'); setHits([]); setActive(0); } }, [isOpen]);
  useEffect(() => {
    const id = ++request.current;
    setHits([]); setActive(0); setError(false); setLimited(false);
    if (!isOpen || !term || aiOnly) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(async () => {
      const type = category === 'flash' ? 0 : category === 'notes' ? 1 : category === 'todo' ? 2 : -1;
      const results = await Promise.allSettled([
        !onlyTags && ['all', 'flash', 'notes', 'todo'].includes(category) ? api.notes.list.mutate({ view: 'summary', searchText: term, type, page: 1, size: 21, isArchived: null, isRecycle: false, isUseAiQuery: false }) : Promise.resolve([]),
        !onlyTags && ['all', 'files'].includes(category) ? api.attachments.list.query({ searchText: term, page: 1, size: 21 }) : Promise.resolve([]),
        (onlyTags || category === 'all' || category === 'tags') ? blinkoStore.tagList.call() : Promise.resolve(null),
      ]);
      if (id !== request.current) return;
      const tags = blinkoStore.tagList.value?.falttenTags ?? [];
      const rows: Hit[] = [];
      const notes = results[0].status === 'fulfilled' ? results[0].value : [];
      const files = results[1].status === 'fulfilled' ? results[1].value.filter((file: any) => file.name !== '.folder') : [];
      notes.slice(0, 20).forEach((note: any) => {
        const kind = note.type === 0 ? 'flash' : note.type === 2 ? 'todo' : 'notes', snippet = searchSnippet(note.content ?? '', term);
        rows.push({ key: `note-${note.id}`, kind, title: note.metadata?.title || snippet.title || t('no-content'), summary: snippet.summary,
          info: [categories.find(item => item.key === kind)?.name, note.isArchived ? (kind==='todo'?label('已完成','Completed'):label('已归档', 'Archived')) : '', note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ''].filter(Boolean).join(' · '),
          action: () => { navigate(`/detail?id=${note.id}`); close(); } });
      });
      if (category === 'all' || category === 'tags' || onlyTags) tags.filter(tag => tagPath(tag, tags).toLocaleLowerCase().includes(term.toLocaleLowerCase())).slice(0, 12).forEach(tag => rows.push({ key: `tag-${tag.id}`, kind: 'tags', title: '#' + tagPath(tag, tags), info: t('tag'), action: () => { navigate(`/?path=all&tagId=${tag.id}`); close(); } }));
      files.slice(0, 20).forEach((file: any) => rows.push({ key: `file-${file.id}`, kind: 'files', title: file.name, info: label('文件 · 下载', 'File · Download'), action: () => { downloadFromLink(getBlinkoEndpoint(file.path)); close(); } }));
      if (!onlyTags && ['all', 'settings'].includes(category)) allSettings.filter(setting => (!setting.requireAdmin || RootStore.Get(UserStore).isSuperAdmin) && (setting.key !== 'hotkey' || isDesktop()) && [t(setting.title), t(setting.description), ...(setting.keywords ?? [])].some(text => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()))).slice(0, 5).forEach(setting => rows.push({ key: `setting-${setting.key}`, kind: 'settings', title: t(setting.title), info: t('settings'), action: () => { ShowSettingsDialog(setting.key); close(); } }));
      setHits(rows); setLimited(notes.length > 20 || files.length > 20); setError(results.some(result => result.status === 'rejected') || ((onlyTags || category==='all' || category==='tags') && !!blinkoStore.tagList.errMsg)); setLoading(false);
    }, 250);
    return () => { clearTimeout(timer); request.current++; };
  }, [isOpen, term, category, aiOnly, onlyTags, i18n.language,retry]);
  const visible: Hit[] = term ? [...(aiOnly ? [] : hits), { key: 'ask-ai', kind: 'ai', title: label('向 AI 提问：', 'Ask AI: ') + term, info: label('进入对话，确认后发送', 'Open chat to review and send'), action: () => {
    if (aiStore.isAnswering) return;
    aiStore.newChat(); aiStore.input = term; navigate('/ai'); close();
  } }] : [];
  useEffect(() => { document.getElementById(`global-search-result-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const handleKey = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.getAttribute('role') !== 'option') return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(index => visible.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length : 0); }
    else if (event.key === 'Enter') { event.preventDefault(); if (!loading) visible[active]?.action(); }
    else if (event.key === 'Escape') close();
  };
  return <Modal isOpen={isOpen} onOpenChange={onOpenChange} placement="top" hideCloseButton disableAnimation
    classNames={{ base: 'max-w-2xl mx-3 sm:mx-auto mt-[8dvh] rounded-xl border border-default-200 shadow-xl', wrapper:'!z-[10080]', backdrop: '!z-[10079] bg-black/25' }}
    motionProps={{ variants: { enter: { opacity: 1, y: 0, transition: { duration: 0.16 } }, exit: { opacity: 0, y: -6, transition: { duration: 0.12 } } } }}>
    <ModalContent><ModalBody className="gap-0 p-0" onKeyDown={handleKey}>
      <div className="p-4 pb-3 flex items-center gap-2">
        <Icon icon="lets-icons:search" width="22" className="text-default-400 shrink-0" />
        {/* 原生 input 代替 HeroUI Input：彻底避开 HeroUI 焦点态的
            box-shadow ring / ::before 下划线动画 / 各种 transition，
            这些叠加起来就是点击瞬间那一闪。 */}
        <input
          ref={inputRef}
          autoFocus
          type="text"
          aria-label={label('全局搜索', 'Global search')}
          placeholder={label('搜索闪念、笔记、待办、标签和文件…', 'Search notes, tasks, tags and files…')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          role="combobox"
          aria-expanded={!loading && visible.length > 0}
          aria-controls="global-search-results"
          aria-activedescendant={!loading && visible.length ? `global-search-result-${active}` : undefined}
          className="flex-1 min-w-0 bg-transparent text-base !outline-none focus:!outline-none focus-visible:!outline-none !ring-0 focus:!ring-0 placeholder:text-default-400"
        />
        {loading ? <Spinner size="sm" className="shrink-0" /> : query ? <button aria-label={label('清空关键词', 'Clear search')} onClick={() => setQuery('')} className="p-2 rounded-lg hover:bg-default-100 shrink-0"><Icon icon="tabler:x" width="18" /></button> : <kbd className="text-xs text-default-400 shrink-0">Esc</kbd>}
      </div>
      <div className="flex gap-1 overflow-x-auto px-4 pb-3 border-b border-default-100" aria-label={label('搜索分类', 'Search category')}>
        {categories.map(item => <button key={item.key} aria-pressed={(onlyTags?'tags':category) === item.key} onClick={() => { setCategory(item.key); if(onlyTags && item.key!=='tags')setQuery(term); inputRef.current?.focus(); }} className={cn('shrink-0 rounded-lg px-3 py-1.5 text-xs transition-colors', (onlyTags?'tags':category) === item.key ? 'bg-primary/10 text-primary' : 'text-default-500 hover:bg-default-100')}>{item.name}</button>)}
      </div>
      <div className="min-h-[180px] max-h-[min(50vh,420px)] overflow-y-auto p-2" id="global-search-results" role="listbox" aria-label={label('搜索结果', 'Search results')} aria-busy={loading}>
        {loading && <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-default-500"><Spinner size="sm" />{label('正在查找…','Searching…')}</div>}
        {error && !loading && <button type="button" className="mx-3 my-2 text-xs text-primary" onClick={()=>setRetry(value=>value+1)}>{label('重新搜索','Retry search')}</button>}
        {!term && <div className="px-5 py-10 text-center text-sm text-default-400">{label('输入关键词查找内容，输入 # 查找标签', 'Type to search, or use # to find tags')}</div>}
        {term && !loading && !hits.length && !aiOnly && <p role="status" className="px-4 py-5 text-sm text-default-500">{error ? label('部分内容搜索失败，请稍后重试', 'Some searches failed. Please try again.') : label('没有找到匹配内容，试试更短的关键词', 'No matches. Try a shorter keyword.')}</p>}
        {error && hits.length > 0 && <p role="status" className="px-4 py-2 text-xs text-warning">{label('部分内容暂时无法搜索，以下为已找到的结果', 'Some sources are unavailable. Showing available results.')}</p>}
        {!loading && visible.map((hit, index) => <button type="button" id={`global-search-result-${index}`} key={hit.key} role="option" aria-selected={index === active} disabled={hit.kind === 'ai' && aiStore.isAnswering} onMouseEnter={() => setActive(index)} onClick={hit.action}
          className={cn('flex w-full gap-3 px-3 py-3 rounded-xl text-left transition-colors disabled:opacity-40', index === active ? 'bg-default-100' : 'hover:bg-default-50', hit.kind === 'ai' && !aiOnly && 'border-t border-default-100 mt-2')}>
          <Icon icon={icons[hit.kind]} width="20" className={cn('shrink-0 mt-0.5', hit.kind === 'ai' ? 'text-primary' : 'text-default-400')} />
          <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate"><Highlight text={hit.title} term={term} /></div>{hit.summary && <div className="text-xs text-default-500 line-clamp-2 break-words leading-5 mt-1"><Highlight text={hit.summary} term={term} /></div>}<div className="text-xs text-default-400 mt-1">{hit.info}</div></div>
          {index === active && <span className="text-default-400 text-xs self-center">↵</span>}
        </button>)}
        {limited && <p className="px-4 py-2 text-xs text-default-400">{label('每类显示前20条，可选择分类或细化关键词', 'Showing up to 20 per category. Refine your search for more.')}</p>}
      </div>
      <div className="flex justify-between border-t border-default-100 px-4 py-3 text-xs text-default-400"><span>{label('↑↓ 选择 · Enter 打开 · Esc 关闭', '↑↓ Select · Enter Open · Esc Close')}</span><span>{label('@ 向 AI 提问', '@ Ask AI')}</span></div>
    </ModalBody></ModalContent>
  </Modal>;
});
