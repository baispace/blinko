import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import Masonry from 'react-masonry-css';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoEditor } from '@/components/BlinkoEditor';
import { TodoQuickAdd } from '@/components/Common/TodoQuickAdd';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { BlinkoCard } from '@/components/BlinkoCard';
import { TodoCard } from '@/components/BlinkoCard/TodoCard';
import { useMediaQuery } from 'usehooks-ts';
import { BlinkoAddButton } from '@/components/BlinkoAddButton';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';
import { TagFilterChips } from '@/components/Common/TagFilterChips';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useMemo, useState, useEffect, useRef } from 'react';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { useDragCard, DraggableBlinkoCard } from '@/hooks/useDragCard';
import { getPageViewScope, getPageViewSetting } from '@/lib/pageViewConfig';

interface TodoGroup {
  displayDate: string;
  todos: any[];
}

const Home = observer(() => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)')
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
  const pageWidth = (getPageViewSetting(blinko, pageScope, 'maxHomePageWidth') as number | null | undefined) ?? blinko.config.value?.maxHomePageWidth;
  const hidePcEditor = getPageViewSetting(blinko, pageScope, 'hidePcEditor') ?? blinko.config.value?.hidePcEditor;
  const isTodoView = searchParams.get('path') === 'todo';
  const [activeId, setActiveId] = useState<number | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);
  const [isDragForbidden, setIsDragForbidden] = useState<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<string>('today');

  // 当前视图真正渲染的列表。映射收敛到 store，筛选面板 / 批量选择共用同一份，
  // 避免「改了筛选却刷了别的列表」。
  const currentListState = blinko.getListByPath(searchParams.get('path'));

  // Use drag card hook only for non-todo views
  const { localNotes, sensors, setLocalNotes, handleDragStart, handleDragEnd, handleDragOver } = useDragCard({
    notes: isTodoView ? undefined : currentListState.value,
    activeId,
    setActiveId,
    insertPosition,
    setInsertPosition,
    isDragForbidden,
    setIsDragForbidden
  });

  const store = RootStore.Local(() => ({
    editorHeight: 30,
    get showEditor() {
      return !blinko.noteListFilterConfig.isArchived && !blinko.noteListFilterConfig.isRecycle
    },
    get showLoadAll() {
      return currentListState.isLoadAll
    }
  }))

  const todosByDate = useMemo(() => {
    if (!isTodoView || !currentListState.value) return {} as Record<string, TodoGroup>;
    const todoItems = currentListState.value;
    const groupedTodos: Record<string, TodoGroup> = {};
    todoItems.forEach(todo => {
      const date = dayjs(todo.createdAt).format('YYYY-MM-DD');
      const isToday = dayjs().isSame(dayjs(todo.createdAt), 'day');
      const isYesterday = dayjs().subtract(1, 'day').isSame(dayjs(todo.createdAt), 'day');
      let displayDate;
      if (isToday) {
        displayDate = t('today');
      } else if (isYesterday) {
        displayDate = t('yesterday');
      } else {
        displayDate = dayjs(todo.createdAt).format('MM/DD (ddd)');
      }
      if (!groupedTodos[date]) {
        groupedTodos[date] = {
          displayDate,
          todos: []
        };
      }
      groupedTodos[date].todos.push(todo);
    });
    return Object.entries(groupedTodos)
      .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
      .reduce((acc, [date, data]) => {
        acc[date] = data;
        return acc;
      }, {} as Record<string, TodoGroup>);
  }, [currentListState.value, isTodoView, t]);

  // 待办视图：标签页（今天 / 接下来几天 / 已完成）
  const TABS = useMemo(() => ([
    { key: 'today', label: t('today-list') },
    { key: 'upcoming', label: t('upcoming-list') },
    { key: 'done', label: t('done-list') },
  ]), [t]);

  // 已完成的「当日完成」也算当前列表：updatedAt 是今天
  // - 今天列表：未完成 + 当日完成（due ≤ 今天）
  // - 接下来几天：未完成 + 当日完成（due > 今天）
  // - 已完成列表：只显示「完成日期非当天」的历史已完成
  const isCompletedToday = (todo: any): boolean => {
    if (!todo.isArchived || !todo.updatedAt) return false;
    return dayjs().isSame(dayjs(todo.updatedAt), 'day');
  };

  // 三个 section 的 todo 列表
  const todayList = useMemo(() => {
    if (!isTodoView) return [];
    const todayStart = dayjs().startOf('day');
    const source: any[] = [
      ...(currentListState.value ?? []),
      ...(blinko.doneTodoList.value ?? []).filter(isCompletedToday),
    ];
    return source.filter((todo: any) => {
      const d = todo.metadata?.expireAt ? dayjs(todo.metadata.expireAt) : null;
      const due = d && d.isValid() ? d.startOf('day') : null;
      return !due || !due.isAfter(todayStart, 'day'); // 今天到期 + 逾期
    });
  }, [isTodoView, currentListState.value, blinko.doneTodoList.value, blinko.updateTicker]);

  const upcomingList = useMemo(() => {
    if (!isTodoView) return [];
    const todayStart = dayjs().startOf('day');
    const source: any[] = [
      ...(currentListState.value ?? []),
      ...(blinko.doneTodoList.value ?? []).filter(isCompletedToday),
    ];
    return source
      .filter((todo: any) => {
        const d = todo.metadata?.expireAt ? dayjs(todo.metadata.expireAt) : null;
        const due = d && d.isValid() ? d.startOf('day') : null;
        return due && due.isAfter(todayStart, 'day');
      })
      .sort((a: any, b: any) => {
        const da = dayjs(a.metadata.expireAt).valueOf();
        const db = dayjs(b.metadata.expireAt).valueOf();
        return da - db;
      });
  }, [isTodoView, currentListState.value, blinko.doneTodoList.value, blinko.updateTicker]);

  const visibleTodayList = useMemo(
    () => todayList.filter((todo: any) => !todo.metadata?.priorityImportant),
    [todayList]
  );
  const visibleUpcomingList = useMemo(
    () => upcomingList.filter((todo: any) => !todo.metadata?.priorityImportant),
    [upcomingList]
  );

  // 「重要」是跨今天/接下来的一个正交视图：只要打了「重要」旗子就进来，
  // 不论截止日。数据早已存在（metadata.priorityImportant），只是没有露出来。
  // 同时从 todayList / upcomingList 里排除，避免同一条被渲染两次。
  const importantList = useMemo(() => {
    if (!isTodoView) return [];
    const seen = new Set<number>();
    return [...todayList, ...upcomingList]
      .filter((todo: any) => Boolean(todo.metadata?.priorityImportant))
      .filter((todo: any) => (seen.has(todo.id) ? false : seen.add(todo.id)))
      .sort((a: any, b: any) => {
        // 紧急且重要排最前，其次按截止日
        const ua = a.metadata?.priorityUrgent ? 0 : 1;
        const ub = b.metadata?.priorityUrgent ? 0 : 1;
        if (ua !== ub) return ua - ub;
        const da = a.metadata?.expireAt ? dayjs(a.metadata.expireAt).valueOf() : Infinity;
        const db = b.metadata?.expireAt ? dayjs(b.metadata.expireAt).valueOf() : Infinity;
        return da - db;
      });
  }, [isTodoView, todayList, upcomingList]);

  const doneList = useMemo(
    () => (blinko.doneTodoList.value ?? []).filter((n: any) => !isCompletedToday(n)),
    [blinko.doneTodoList.value]
  );

  const doneLoadedRef = useRef(false);
  useEffect(() => {
    if (isTodoView) {
      // 不论 activeTab 都要拉，避免 today/upcoming 列表缺当日完成项
      if (!doneLoadedRef.current) {
        doneLoadedRef.current = true;
        blinko.doneTodoList.resetAndCall({});
      }
    } else {
      doneLoadedRef.current = false;
    }
  }, [isTodoView, blinko]);

  // Restore scroll position when returning from editor
  useEffect(() => {
    const savedPosition = sessionStorage.getItem('restore-scroll-position');
    if (savedPosition && scrollAreaRef.current) {
      const position = Number(savedPosition);
      setTimeout(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = position;
        }
        // Clear the saved position after restoring
        sessionStorage.removeItem('restore-scroll-position');
      }, 100);
    }
  }, [location.key]);

  // 限宽层：内容限宽居中，滚动容器保持全宽，使滚动条贴窗口右缘
  const maxWidthStyle = {
    maxWidth: pageWidth ? `${pageWidth}px` : '100%'
  } as const;

  return (
    <div
      className={`pt-1 md:p-0 relative h-full flex flex-col-reverse md:flex-col w-full`}>

      {!isTodoView && store.showEditor && isPc && !hidePcEditor && <div className='px-2 md:px-6 mx-auto w-full' style={maxWidthStyle} >
          <BlinkoEditor mode='create' key='create-key' onHeightChange={height => {
            if (!isPc) return
            store.editorHeight = height
          }} />
        </div>
      }
      {(!isPc || hidePcEditor) && !isTodoView && <BlinkoAddButton />}

      {/* 待办视图永远渲染自身外壳（新增入口 + Tabs + 空列表提示），
          否则列表为空时 isEmpty 会把整个待办模块连带「加一条任务」一起隐藏 */}
      <LoadingAndEmpty
        isLoading={currentListState.isLoading}
        isEmpty={!isTodoView && currentListState.isEmpty}
      />

      {
        (!currentListState.isEmpty || isTodoView) &&
        <ScrollArea
          ref={scrollAreaRef}
          fixMobileTopBar
          onRefresh={async () => {
            await currentListState.resetAndCall({})
          }}
          onBottom={() => {
            blinko.onBottom();
          }}
          style={{ height: store.showEditor ? `calc(100% - ${(isPc ? (!store.showEditor ? store.editorHeight : 10) : 0)}px)` : '100%' }}
          className={`mt-0 md:${hidePcEditor ? 'mt-0' : 'mt-4'} w-full h-full !transition-all scroll-area`}>
          <div className="px-2 md:px-6 mx-auto w-full" style={maxWidthStyle}>
          {!isTodoView && <TagFilterChips />}
          {isTodoView ? (
            <div className="flex flex-col gap-4">
              {/* 全局唯一新增入口：放在 tabs 上方，三个 section 共用一份 */}
              <TodoQuickAdd />

              {/* Tab 栏（今天 / 接下来几天 / 已完成） */}
              <div className="sticky top-0 z-20 flex items-center gap-1 bg-secondbackground py-1.5">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex items-center rounded-full px-3 h-8 text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-default-600 hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {activeTab === 'today' && (
                <>
                  {/* Section: 重要（跨今天/接下来，带旗子的优先看） */}
                  {importantList.length > 0 && (
                    <section>
                      <header className="flex items-center justify-between gap-3 px-1 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon icon="solar:bookmark-bold" width={18} height={18} className="text-red-500 shrink-0" />
                          <span className="text-[15px] font-semibold text-foreground shrink-0">{t('important-list')}</span>
                          <span className="text-[12px] text-default-400 truncate">{t('important-list-subtitle')}</span>
                        </div>
                      </header>
                      <div className="flex flex-col gap-3">
                        {importantList.map((todo: any) => <TodoCard key={todo.id} todo={todo} />)}
                      </div>
                    </section>
                  )}

                  {/* Section: 今天的清单 */}
                  <section>
                    <header className="flex items-center justify-between gap-3 px-1 pb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon icon="mdi:white-balance-sunny" width={18} height={18} className="text-amber-500 shrink-0" />
                        <span className="text-[15px] font-semibold text-foreground shrink-0">{t('today-list')}</span>
                        <span className="text-[12px] text-default-400 truncate">{t('today-list-subtitle')}</span>
                      </div>
                    </header>
                    <div className="flex flex-col gap-3">
                      {visibleTodayList.length === 0 ? (
                        <div className="text-center py-6 text-default-400 text-[13px]">{t('no-task')}</div>
                      ) : (
                        visibleTodayList.map((todo: any) => <TodoCard key={todo.id} todo={todo} />)
                      )}
                    </div>
                  </section>

                  {/* Section: 接下来几天 */}
                  {visibleUpcomingList.length > 0 && (
                    <section>
                      <header className="flex items-center justify-between gap-3 px-1 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon icon="mdi:chevron-double-right" width={18} height={18} className="text-primary shrink-0" />
                          <span className="text-[15px] font-semibold text-foreground shrink-0">{t('upcoming-list')}</span>
                          <span className="text-[12px] text-default-400 truncate">{t('upcoming-list-subtitle')}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('upcoming')}
                          className="shrink-0 inline-flex items-center gap-1 rounded-full border border-default-200 px-3 py-1 text-[12px] text-default-600 hover:text-foreground hover:border-primary/50 transition-colors"
                        >
                          {t('all')} {visibleUpcomingList.length} {t('items-suffix')}
                        </button>
                      </header>
                      <div className="flex flex-col gap-3">
                        {visibleUpcomingList.map((todo: any) => <TodoCard key={todo.id} todo={todo} />)}
                      </div>
                    </section>
                  )}
                </>
              )}

              {activeTab === 'upcoming' && (
                <section>
                  <header className="flex items-center justify-between gap-3 px-1 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon icon="mdi:chevron-double-right" width={18} height={18} className="text-primary shrink-0" />
                      <span className="text-[15px] font-semibold text-foreground shrink-0">{t('upcoming-list')}</span>
                      <span className="text-[12px] text-default-400 truncate">{t('upcoming-list-subtitle')}</span>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-default-200 px-3 py-1 text-[12px] text-default-600">
                      {t('all')} {upcomingList.length} {t('items-suffix')}
                    </span>
                  </header>
                  <div className="flex flex-col gap-3">
                    {upcomingList.length === 0 ? (
                      <div className="text-center py-6 text-default-400 text-[13px]">{t('no-task')}</div>
                    ) : (
                      upcomingList.map((todo: any) => <TodoCard key={todo.id} todo={todo} />)
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'done' && (
                <section>
                  <header className="flex items-center justify-between gap-3 px-1 pb-2">
<div className="flex items-center gap-2 min-w-0">
                    <Icon icon="mdi:check-circle-outline" width={18} height={18} className="text-emerald-500 shrink-0" />
                    <span className="text-[15px] font-semibold text-foreground shrink-0">{t('done-list')}</span>
                  </div>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-default-200 px-3 py-1 text-[12px] text-default-600">
                      {t('all')} {doneList.length} {t('items-suffix')}
                    </span>
                  </header>
                  <div className="flex flex-col gap-3">
                    {doneList.length === 0 ? (
                      <div className="text-center py-6 text-default-400 text-[13px]">{t('no-task')}</div>
                    ) : (
                      doneList.map((todo: any) => <TodoCard key={todo.id} todo={todo} />)
                    )}
                  </div>
                </section>
              )}
            </div>
          ) : (
            noteListStyle === 'byDay' || noteListStyle === 'byWeek' ? (
              <div className="timeline-view relative">
                {(() => {
                  const grouped: Record<string, { displayDate: string; notes: typeof localNotes }> = {};
                  const fmt = noteListStyle === 'byWeek' ? 'YYYY-[W]WW' : 'YYYY-MM-DD';
                  localNotes?.forEach((n: any) => {
                    const key = dayjs(n.createdAt).format(fmt);
                    const isToday = dayjs().isSame(dayjs(n.createdAt), 'day');
                    const isYesterday = dayjs().subtract(1, 'day').isSame(dayjs(n.createdAt), 'day');
                    let displayDate;
                    if (isToday) displayDate = t('today');
                    else if (isYesterday) displayDate = t('yesterday');
                    else if (noteListStyle === 'byWeek') displayDate = dayjs(n.createdAt).format('YYYY [W]WW');
                    else displayDate = dayjs(n.createdAt).format('MM/DD (ddd)');
                    if (!grouped[key]) grouped[key] = { displayDate, notes: [] as any };
                    grouped[key].notes!.push(n);
                  });
                  return Object.entries(grouped).map(([date, { displayDate, notes }]) => (
                    <div key={date} className="mb-6 relative">
                      <div className="flex items-center mb-2 relative z-10">
                        <div className="w-4 h-4 rounded-sm bg-primary absolute left-[4.5px] transform translate-x-[-50%]"></div>
                        <h3 className="text-base font-bold ml-5">{displayDate}</h3>
                      </div>
                      <div className="md:pl-4">
                        {notes!.map((note: any) => (
                          <div key={note.id} className="mb-3">
                            <BlinkoCard blinkoItem={note} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            ) : (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                >
                  <Masonry
                    breakpointCols={{
                      default: getPageViewSetting(blinko, pageScope, 'largeDeviceCardColumns') ? Number(getPageViewSetting(blinko, pageScope, 'largeDeviceCardColumns')) : 2,
                      1280: getPageViewSetting(blinko, pageScope, 'mediumDeviceCardColumns') ? Number(getPageViewSetting(blinko, pageScope, 'mediumDeviceCardColumns')) : 2,
                      768: getPageViewSetting(blinko, pageScope, 'smallDeviceCardColumns') ? Number(getPageViewSetting(blinko, pageScope, 'smallDeviceCardColumns')) : 1
                    }}
                    style={{ ['--blinko-card-spacing' as any]: `${cardSpacing}px` }}
                    className="card-masonry-grid"
                    columnClassName="card-masonry-grid_column">
                    {
                      localNotes?.map((i, index) => {
                        const showInsertLine = insertPosition === i.id && activeId !== i.id;
                        return (
                          <DraggableBlinkoCard
                            key={i.id}
                            blinkoItem={i}
                            showInsertLine={showInsertLine}
                            insertPosition="top"
                            isDragForbidden={isDragForbidden && showInsertLine}
                          />
                        );
                      })
                    }
                  </Masonry>
                  <DragOverlay>
                    {activeId ? (
                      <div className="rotate-3 scale-105 opacity-90 max-w-sm shadow-xl">
                        <BlinkoCard
                          blinkoItem={localNotes.find(n => n.id === activeId)}
                        />
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </>
            )
          )}

          {store.showLoadAll && <div className='select-none w-full text-center text-sm font-bold text-ignore my-4'>{t('all-notes-have-been-loaded', { items: currentListState.value?.length })}</div>}
          </div>
        </ScrollArea>
      }
    </div>
  );
});

export default Home;
