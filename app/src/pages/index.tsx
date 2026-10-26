import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import Masonry from 'react-masonry-css';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { ViewportItem } from '@/components/Common/ViewportItem';
import { ListComposer } from '@/components/Common/ListComposer';
import { ScrollArea, type ScrollAreaHandles } from '@/components/Common/ScrollArea';
import { BlinkoCard } from '@/components/BlinkoCard';
import { TodoWorkspace } from '@/components/BlinkoCard/TodoWorkspace';
import { BlinkoListRow } from '@/components/BlinkoCard/BlinkoListRow';
import { useMediaQuery } from 'usehooks-ts';
import { BlinkoAddButton } from '@/components/BlinkoAddButton';
import { MobileCreateFab } from '@/components/Common/MobileCreateFab';
import { ListEmptyState } from '@/components/Common/ListEmptyState';
import { TagContentTypeTabs } from '@/components/Common/TagContentTypeTabs';
import { TagFilterChips } from '@/components/Common/TagFilterChips';
import { ActiveListFilters } from '@/components/Common/PopoverFloat/filterPop';
import { StickyListFilters } from '@/components/Common/StickyListFilters';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useMemo, useState, useEffect, useRef } from 'react';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useDragCard, DraggableBlinkoCard } from '@/hooks/useDragCard';
import { getPageViewScope, getPageViewSetting } from '@/lib/pageViewConfig';


const Home = observer(() => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)');
  const blinko = RootStore.Get(BlinkoStore)
  // NOTE: blinko.use() is already called by CommonLayout (root layout),
  // calling it here causes firstLoad() to run twice on first paint.
  blinko.useQuery();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // 视图设置按页面作用域读取（闪念 / 笔记各自独立记忆）
  const pageScope = getPageViewScope(searchParams);

  // 卡片间距 / 列表样式 / 内容宽度（页面级覆盖 → 全局兜底）
  const cardSpacing = (getPageViewSetting(blinko, pageScope, 'cardSpacing') as number | undefined) ?? 16;
  const noteListStyle = ((getPageViewSetting(blinko, pageScope, 'noteListStyle') as string | undefined) ?? 'continuous');
  const noteListSortBy = ((getPageViewSetting(blinko, pageScope, 'noteListSortBy') as string | undefined) ?? 'createdAt');
  const pageWidth = (getPageViewSetting(blinko, pageScope, 'maxHomePageWidth') as number | null | undefined) ?? blinko.config.value?.maxHomePageWidth;
  const hidePcEditor = getPageViewSetting(blinko, pageScope, 'hidePcEditor') ?? blinko.config.value?.hidePcEditor;
  const effectiveHideEditor = isPc && hidePcEditor;
  const isTagView = !!searchParams.get('tagId') && searchParams.get('path') === 'all';
  const tagName = blinko.tagList.value?.falttenTags?.find(tag => String(tag.id) === searchParams.get('tagId'))?.name;
  const [ , setListSearchParams] = useSearchParams();
  const isTodoView = searchParams.get('path') === 'todo';
  const [activeId, setActiveId] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [isDragForbidden, setIsDragForbidden] = useState<boolean>(false);
  const scrollAreaRef = useRef<ScrollAreaHandles>(null);
  // 当前视图真正渲染的列表。映射收敛到 store，筛选面板 / 批量选择共用同一份，
  // 避免「改了筛选却刷了别的列表」。
  const currentListState = blinko.getListByPath(searchParams.get('path'));

  // Use drag card hook only for non-todo views
  const { localNotes, sensors, handleDragStart, handleDragEnd, handleDragOver } = useDragCard({
    notes: isTodoView ? undefined : currentListState.value,
    activeId,
    setActiveId,
    insertPosition,
    setInsertPosition,
    isDragForbidden,
    setIsDragForbidden,
    reorderEnabled: noteListSortBy === 'manual'
  });

  const store = RootStore.Local(() => ({
    get showEditor() {
      return !blinko.noteListFilterConfig.isArchived && !blinko.noteListFilterConfig.isRecycle
    },
    get showLoadAll() {
      return currentListState.isLoadAll
    }
  }))

  // The server classifies, ranks and counts the entire filtered task set.
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('restore-scroll-position');
    if (savedPosition && scrollAreaRef.current) {
      const position = Number(savedPosition);
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo(position);
        }
        // Clear the saved position after restoring
        sessionStorage.removeItem('restore-scroll-position');
      }, 100);
    }
  }, [location.key]);

  const groupedNotes = useMemo(() => {
    if (noteListStyle !== 'byDay' && noteListStyle !== 'byWeek') return [];
    const grouped: Record<string, { displayDate: string; notes: any[] }> = {};
    localNotes.forEach((note: any) => {
      const date = dayjs(note.createdAt);
      const isoWeek = String(date.isoWeek()).padStart(2, '0');
      const isoWeekYear = date.isoWeekYear();
      const key = noteListStyle === 'byWeek' ? `${isoWeekYear}-W${isoWeek}` : date.format('YYYY-MM-DD');
      const displayDate = dayjs().isSame(date, 'day')
        ? t('today')
        : dayjs().subtract(1, 'day').isSame(date, 'day')
          ? t('yesterday')
          : noteListStyle === 'byWeek'
            ? `${isoWeekYear} W${isoWeek}`
            : date.format('MM/DD (ddd)');
      (grouped[key] ??= { displayDate, notes: [] }).notes.push(note);
    });
    return Object.entries(grouped).map(([key, value]) => ({ key, ...value }));
  }, [localNotes, noteListStyle, t]);

  const hasListFilters = Boolean(
    searchParams.get('tagId') ||
    searchParams.get('contentType') ||
    searchParams.get('searchText') ||
    searchParams.get('withoutTag') ||
    searchParams.get('withFile') ||
    searchParams.get('withLink') ||
    searchParams.get('hasTodo')
  );

  const clearListFilters = () => {
    const next = new URLSearchParams(searchParams);
    ['tagId', 'contentType', 'searchText', 'withoutTag', 'withFile', 'withLink', 'hasTodo'].forEach(key => next.delete(key));
    setListSearchParams(next);
  };

  const emptyVariant = isTagView ? 'tag' : isTodoView ? 'todo' : pageScope === 'notes' ? 'notes' : 'blinko';

  // 限宽层：内容限宽居中，滚动容器保持全宽，使滚动条贴窗口右缘
  const maxWidthStyle = {
    maxWidth: pageWidth ? `${pageWidth}px` : '100%'
  } as const;

  const loadedItemCount = currentListState.value?.length ?? 0;

  const composer = (isTodoView || (store.showEditor && !effectiveHideEditor)) && (
        <div className={isPc ? 'mb-3' : 'mx-auto w-full px-2'} style={isPc ? undefined : maxWidthStyle}>
          <ListComposer
            key={searchParams.get('path') || 'blinko'}
            defaultType={isTodoView ? NoteType.TODO : pageScope === 'notes' ? NoteType.NOTE : NoteType.BLINKO}
            mixed={isTagView}
            tag={tagName}
          />
        </div>
      );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col-reverse pt-1 md:flex-col md:p-0">
      {/*
        移动端不再常驻底部输入框 —— 它加一整行工具栏要吃掉小半屏，
        列表能看到的闪念只剩几条。改成右下角一个新建按钮，
        点开是底部弹出的创建面板；类型跟着当前列表走（闪念页写闪念、笔记页写笔记）。
      */}
      {!isPc && !isTodoView && store.showEditor && (
        <MobileCreateFab
          noteType={pageScope === 'notes' ? NoteType.NOTE : NoteType.BLINKO}
        />
      )}
      {effectiveHideEditor && !isTodoView && <BlinkoAddButton />}

      <ScrollArea
        ref={scrollAreaRef}
        fixMobileTopBar
        onRefresh={async () => {
          await currentListState.resetAndCall({});

        }}
        onBottom={() => {
          void blinko.onBottom();
        }}
        className="mt-0 h-full min-h-0 w-full flex-1 scroll-area"
      >
        <div className="mx-auto w-full px-2 pb-32 md:px-6 md:pb-8" style={maxWidthStyle}>
          {isPc && !isTodoView && composer}
          {!isTodoView && !['archived', 'trash'].includes(searchParams.get('path') || '') && <StickyListFilters scopeKey={[searchParams.get('path') || 'blinko', searchParams.get('contentType') || 'all'].join(':')} filterKey={[searchParams.get('path'), searchParams.get('tagId'), searchParams.get('contentType')].join('|')}>
            <div className="flex min-w-0 items-center gap-2">
              {isTagView && <TagContentTypeTabs />}
              <TagFilterChips />
            </div>
            <ActiveListFilters />
          </StickyListFilters>}

          <div data-list-filter-results>
          {!isTodoView && currentListState.isLoading && !currentListState.value?.length ? (
            <div className="flex min-h-48 items-center justify-center text-default-400" role="status" aria-label={t('loading')}>
              <Icon icon="eos-icons:three-dots-loading" width={38} height={38} />
            </div>
          ) : isTodoView ? (
            <TodoWorkspace composer={composer} />
          ) : localNotes.length === 0 ? (
            <ListEmptyState
              variant={emptyVariant}
              filtered={hasListFilters}
              onClearFilters={clearListFilters}
            />
          ) : noteListStyle === 'byDay' || noteListStyle === 'byWeek' ? (
            <div className="space-y-5">
              {groupedNotes.map(group => (
                <section key={group.key}>
                  <header className="mb-1.5 flex items-center gap-2 px-1">
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden />
                    <h2 className="text-[12px] font-semibold text-default-600">{group.displayDate}</h2>
                    <span className="text-[10.5px] tabular-nums text-default-400">{group.notes.length}</span>
                  </header>
                  <div className="overflow-hidden rounded-xl border border-default-200/60 bg-card px-3 shadow-sm">
                    {group.notes.map((note, index) => <ViewportItem key={note.id} initial={index < 5} estimate={56}><BlinkoListRow blinkoItem={note} /></ViewportItem>)}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <Masonry
                breakpointCols={{
                  default: Number(getPageViewSetting(blinko, pageScope, 'largeDeviceCardColumns') ?? 2),
                  1280: Number(getPageViewSetting(blinko, pageScope, 'mediumDeviceCardColumns') ?? 2),
                  768: Number(getPageViewSetting(blinko, pageScope, 'smallDeviceCardColumns') ?? 1),
                }}
                style={{ ['--blinko-card-spacing' as any]: `${cardSpacing}px` }}
                className="card-masonry-grid"
                columnClassName="card-masonry-grid_column"
              >
                {localNotes.map((item, index) => {
                  const showInsertLine = insertPosition === item.id && activeId !== item.id;
                  return (
                    <ViewportItem key={item.id} initial={index < 8} estimate={320} disabled={noteListSortBy === 'manual'}>
                    <DraggableBlinkoCard
                      blinkoItem={item}
                      showInsertLine={showInsertLine}
                      insertPosition="top"
                      isDragForbidden={isDragForbidden && showInsertLine}
                    />
                    </ViewportItem>
                  );
                })}
              </Masonry>
              <DragOverlay>
                {activeId ? (
                  <div className="max-w-sm rotate-2 scale-[1.02] opacity-90 shadow-xl">
                    <BlinkoCard blinkoItem={localNotes.find(note => note.id === activeId)} />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}

          {!isTodoView && !currentListState.isLoadAll && loadedItemCount > 0 && <button type="button" disabled={currentListState.isLoading} onClick={() => currentListState.callNextPage({})} className="mx-auto my-4 block rounded-lg px-4 py-2 text-xs text-default-500 hover:bg-default-100 disabled:opacity-50">{currentListState.isLoading ? '正在加载…' : '加载更多'}</button>}
          {!isTodoView && store.showLoadAll && loadedItemCount > 0 && (
            <div className="my-5 flex w-full items-center justify-center gap-2 text-[11px] text-default-400">
              <span className="h-px w-8 bg-default-200" />
              <span>{t('all-notes-have-been-loaded', { items: loadedItemCount })}</span>
              <span className="h-px w-8 bg-default-200" />
            </div>
          )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
});

export default Home;
