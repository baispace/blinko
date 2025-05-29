import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import Masonry from 'react-masonry-css';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoEditor } from '@/components/BlinkoEditor';
import { ScrollArea } from '@/components/Common/ScrollArea';
import { BlinkoCard } from '@/components/BlinkoCard';
import { useMediaQuery } from 'usehooks-ts';
import { BlinkoAddButton } from '@/components/BlinkoAddButton';
import { LoadingAndEmpty } from '@/components/Common/LoadingAndEmpty';
import { useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import dayjs from '@/lib/dayjs';
import { NoteType } from '@shared/lib/types';
import { Icon } from '@/components/Common/Iconify/icons';

interface TodoGroup {
  displayDate: string;
  todos: any[];
}

const Home = observer(() => {
  const { t } = useTranslation();
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  blinko.use()
  blinko.useQuery();
  const [searchParams] = useSearchParams();
  const isTodoView = searchParams.get('path') === 'todo';

  const store = RootStore.Local(() => ({
    editorHeight: 30,
    get showEditor() {
      return !blinko.noteListFilterConfig.isArchived && !blinko.noteListFilterConfig.isRecycle
    },
    get showLoadAll() {
      return blinko.noteList.isLoadAll
    }
  }))

  const todosByDate = useMemo(() => {
    if (!isTodoView || !blinko.noteList.value) return {} as Record<string, TodoGroup>;
    const todoItems = blinko.noteList.value.filter(note => note.type === NoteType.TODO);
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
  }, [blinko.noteList.value, isTodoView, t]);

  return (
    <div
      style={{
        maxWidth: blinko.config.value?.maxHomePageWidth ? `${blinko.config.value?.maxHomePageWidth}px` : '100%'
      }}
      className={`md:p-0 relative h-full flex flex-col-reverse md:flex-col mx-auto w-full`}>

      {store.showEditor && isPc && !blinko.config.value?.hidePcEditor && <div className='px-2 md:px-6' >
        <BlinkoEditor mode='create' key='create-key' onHeightChange={height => {
          if (!isPc) return
          store.editorHeight = height
        }} />
      </div>}
      {(!isPc || blinko.config.value?.hidePcEditor) && <BlinkoAddButton />}

      <LoadingAndEmpty
        isLoading={blinko.noteList.isLoading}
        isEmpty={blinko.noteList.isEmpty}
      />

      {
        !blinko.noteList.isEmpty && <ScrollArea
          onRefresh={async () => {
            await blinko.noteList.resetAndCall({})
          }}
          onBottom={() => {
            blinko.onBottom();
          }}
          style={{ height: store.showEditor ? `calc(100% - ${(isPc ? store.editorHeight : 0)}px)` : '100%' }}
          className={`px-2 mt-0 md:${blinko.config.value?.hidePcEditor ? 'mt-0' : 'mt-4'} md:px-6 w-full h-full !transition-all scroll-area`}>

          {isTodoView ? (
            <div className="timeline-view relative">
              <div className="absolute left-1 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
              {Object.entries(todosByDate).map(([date, { displayDate, todos }]) => (
                <div key={date} className="mb-6 relative">
                  <div className="flex items-center mb-2 relative z-10">
                    <div className="w-4 h-2 rounded-sm bg-primary absolute left-[4.5px] transform translate-x-[-50%]"></div>
                    <h3 className="text-base font-bold ml-5">{displayDate}</h3>
                  </div>
                  <div className="pl-6">
                    {todos.map(todo => (
                      <div key={todo.id} className="mb-3">
                        <BlinkoCard blinkoItem={todo} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {Object.keys(todosByDate).length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Icon icon="mdi:clipboard-text-outline" width="48" height="48" className="mx-auto mb-2 opacity-50" />
                  <p>{t('no-data-here-well-then-time-to-write-a-note')}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <Masonry
                breakpointCols={{
                  default: blinko.config?.value?.largeDeviceCardColumns ? Number(blinko.config?.value?.largeDeviceCardColumns) : 2,
                  1280: blinko.config?.value?.mediumDeviceCardColumns ? Number(blinko.config?.value?.mediumDeviceCardColumns) : 2,
                  768: blinko.config?.value?.smallDeviceCardColumns ? Number(blinko.config?.value?.smallDeviceCardColumns) : 1
                }}
                className="card-masonry-grid"
                columnClassName="card-masonry-grid_column">
                {
                  blinko.noteList?.value?.map(i => {
                    return <BlinkoCard key={i.id} blinkoItem={i} />
                  })
                }
              </Masonry>
            </>
          )}

          {store.showLoadAll && <div className='select-none w-full text-center text-sm font-bold text-ignore my-4'>{t('all-notes-have-been-loaded', { items: blinko.noteList.value?.length })}</div>}
        </ScrollArea>
      }
    </div>
  );
});

export default Home;
