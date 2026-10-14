import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Icon } from '@/components/Common/Iconify/icons';
import { Button } from '@heroui/react';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import dayjs from '@/lib/dayjs';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/trpc';
import { PromiseState } from '@/store/standard/PromiseState';
import { MarkdownRender } from '../Common/MarkdownRender';
import { ScrollArea } from '../Common/ScrollArea';
import { BlinkoStore } from '@/store/blinkoStore';
import { DialogStore } from '@/store/module/Dialog';
import { LoadingAndEmpty } from '../Common/LoadingAndEmpty';
import { eventBus } from '@/lib/event';

interface NoteHistoryModalProps {
  noteId: number;
}

const NoteHistoryModal = observer(({ noteId }: NoteHistoryModalProps) => {
  const { t } = useTranslation();
  const toast = RootStore.Get(ToastPlugin);

  const Store = RootStore.Local(() => ({
    loading: true,
    restoring: false,
    currentHistoryIndex: 0,
    get currentHistory() {
      return Store.historyList.value?.[Store.currentHistoryIndex];
    },
    historyList: new PromiseState({
      function: async (params: { noteId: number }) => api.notes.getNoteHistory.query(params),
    }),
    restoreNoteVersion: new PromiseState({
      function: async (params: { noteId: number; content: string }) => {
        await api.notes.upsert.mutate({ id: params.noteId, content: params.content });
        return true;
      },
    }),
    fetchData: async () => {
      if (noteId <= 0) return;
      Store.loading = true;
      try {
        await Store.historyList.call({ noteId });
        Store.currentHistoryIndex = 0;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        Store.loading = false;
      }
    },
    handleRestore: async () => {
      const item = Store.currentHistory;
      if (!item) return;
      Store.restoring = true;
      const blinko = RootStore.Get(BlinkoStore);
      eventBus.emit('editor:cancelPending', { id: noteId });
      try {
        await blinko.waitForPendingWrites();
        await Store.restoreNoteVersion.call({ noteId, content: item.content });
        eventBus.emit('editor:applyExternalContent', { id: noteId, content: item.content });
        if (blinko.noteDetail.value?.id === noteId) blinko.noteDetail.value.content = item.content;
        blinko.updateTicker++;
        RootStore.Get(DialogStore).close();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        Store.restoring = false;
      }
    },
    getContentSummary: (content: string, maxLength = 76) => {
      const plain = (content ?? '')
        .replace(/[#*_`>\-[\]()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return plain.length > maxLength ? `${plain.slice(0, maxLength)}…` : plain;
    },
  }));

  useEffect(() => {
    void Store.fetchData();
  }, [noteId]);

  const histories = Store.historyList.value ?? [];

  return (
    <div className="flex h-[min(70vh,620px)] min-h-[420px] w-full flex-col">
      <LoadingAndEmpty
        className="mb-2"
        isLoading={Store.loading}
        isEmpty={!Store.loading && histories.length === 0}
        isAbsolute={false}
      />

      {histories.length > 0 && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-default-200 md:flex-row">
          <aside className="flex max-h-48 shrink-0 flex-col border-b border-default-200 bg-default-50/50 md:max-h-none md:w-56 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 border-b border-default-200 px-3 py-2.5 text-[11px] font-medium text-default-500">
              <Icon icon="lucide:history" width={15} height={15} />
              <span>{t('version-history')}</span>
              <span className="ml-auto rounded-full bg-default-100 px-1.5 py-0.5 tabular-nums">{histories.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {histories.map((item, index) => {
                const selected = Store.currentHistoryIndex === index;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => { Store.currentHistoryIndex = index; }}
                    className={`relative mb-1 w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                      selected ? 'bg-primary/10 text-primary' : 'text-default-600 hover:bg-default-100'
                    }`}
                  >
                    <span className={`absolute bottom-2 left-0 top-2 w-0.5 rounded-full ${selected ? 'bg-primary' : 'bg-transparent'}`} />
                    <span className="flex items-center justify-between gap-2">
                      <strong className="text-[12px] font-semibold">{t('version')} {item.version}</strong>
                      {index === 0 && <span className="text-[9.5px] text-emerald-500">{t('newer')}</span>}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] tabular-nums text-default-400">
                      {dayjs(item.createdAt).format('MM-DD HH:mm:ss')}
                    </span>
                    <span className="mt-1 block line-clamp-2 text-[10.5px] leading-relaxed text-default-500">
                      {Store.getContentSummary(item.content) || t('no-content')}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
            <header className="flex items-center justify-between gap-3 border-b border-default-200 px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-semibold text-foreground">
                  {t('version')} {Store.currentHistory?.version}
                </div>
                <div className="mt-0.5 text-[10.5px] text-default-400">
                  {Store.currentHistory?.createdAt ? dayjs(Store.currentHistory.createdAt).format('YYYY-MM-DD HH:mm:ss') : ''}
                </div>
              </div>
              <span className="hidden items-center gap-1 text-[10px] text-amber-500 sm:flex">
                <Icon icon="carbon:information" width={13} height={13} />
                {t('history-note-only')}
              </span>
            </header>

            <ScrollArea className="min-h-0 flex-1 px-4 py-3" onBottom={() => {}}>
              <MarkdownRender content={Store.currentHistory?.content || ''} />
            </ScrollArea>

            <footer className="flex items-center justify-between gap-3 border-t border-default-200 px-4 py-3">
              <span className="text-[10.5px] text-default-400 sm:hidden">{t('history-note-only')}</span>
              <Button
                color="primary"
                size="sm"
                isLoading={Store.restoring}
                onPress={Store.handleRestore}
                startContent={<Icon icon="material-symbols:settings-backup-restore-rounded" width={16} height={16} />}
                className="ml-auto"
              >
                {t('restore-this-version')}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
});

export default NoteHistoryModal;
