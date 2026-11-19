import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Spinner } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from 'react-i18next';
import { t } from 'i18next';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { ResourceStore } from '@/store/resourceStore';
import { DialogStore } from '@/store/module/Dialog';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { PromiseCall } from '@/store/standard/PromiseState';
import { type ResourceType } from '@shared/lib/types';

export function openMoveToFolderDialog(items: ResourceType[]) {
  const files = items.filter(item => !item.isFolder && item.id);
  if (files.length === 0) return;
  RootStore.Get(DialogStore).setData({
    isOpen: true,
    size: 'sm',
    title: t('move-to'),
    content: () => <MoveToFolderDialog items={files} />
  });
}

export const MoveToFolderDialog = observer(({ items }: { items: ResourceType[] }) => {
  const { t } = useTranslation();
  const resourceStore = RootStore.Get(ResourceStore);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<string>(''); // '' = root
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.attachments.listFolders.query()
      .then((list) => {
        if (!cancelled) setFolders(list || []);
      })
      .catch(() => {
        if (!cancelled) setFolders([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter(folder => folder.toLowerCase().includes(q));
  }, [folders, query]);

  const confirmMove = async () => {
    setSubmitting(true);
    try {
      await RootStore.Get(ToastPlugin).promise(
        PromiseCall(api.attachments.move.mutate({
          sourceIds: items.map(item => item.id!),
          targetFolder: target ? target.split('/').join(',') : ''
        }), { autoAlert: false }),
        {
          loading: t('operation-in-progress'),
          success: t('operation-success'),
          error: t('operation-failed')
        }
      );
      resourceStore.clearClipboard();
      resourceStore.refreshTicker++;
      resourceStore.clearSelection();
      RootStore.Get(DialogStore).close();
    } finally {
      setSubmitting(false);
    }
  };

  const FolderRow = ({ value, label }: { value: string; label: string }) => {
    const selected = target === value;
    return (
      <button
        type="button"
        onClick={() => setTarget(value)}
        className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-sm !transition-colors ${
          selected ? 'bg-primary/10 text-primary' : 'hover:bg-hover'
        }`}
      >
        <Icon icon="material-symbols:folder" className={`w-4 h-4 shrink-0 ${selected ? 'text-primary' : 'text-[#FBC02D]'}`} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3 p-1">
      <Input
        size="sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search')}
        startContent={<Icon icon="mdi:magnify" width={15} height={15} className="text-default-400" />}
        isClearable
        onClear={() => setQuery('')}
      />
      <div className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5 pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : (
          <>
            <FolderRow value="" label={t('root-folder')} />
            {visible.map(folder => (
              <FolderRow key={folder} value={folder} label={folder} />
            ))}
            {!loading && visible.length === 0 && (
              <div className="text-xs text-default-400 px-2 py-3">{t('no-folders')}</div>
            )}
          </>
        )}
      </div>
      <Button color="primary" onPress={confirmMove} isLoading={submitting} isDisabled={loading}>
        {t('confirm')}
      </Button>
    </div>
  );
});
