import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { useTranslation } from 'react-i18next';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { showTipsDialog } from '../Common/TipsDialog';
import { api } from '@/lib/trpc';
import { MultiSelectToolbar } from '../Common/MultiSelectToolbar';
import { ResourceStore } from "@/store/resourceStore";
import { DialogStandaloneStore } from '@/store/module/DialogStandalone';
import { openMoveToFolderDialog } from './MoveToFolderDialog';
import { downloadResourceFile } from './resourceUtils';
import { toJS } from 'mobx';

export const ResourceMultiSelectPop = observer(() => {
  const { t } = useTranslation();
  const resourceStore = RootStore.Get(ResourceStore);
  const resources = toJS(resourceStore.blinko.resourceList.value) || [];
  const selected = resourceStore.getSelectedResources(resources);

  const actions = [
    {
      icon: "material-symbols:download",
      text: t('download'),
      onClick: () => {
        selected.forEach(item => downloadResourceFile(item));
      }
    },
    {
      icon: "material-symbols:content-cut",
      text: t('cut'),
      onClick: () => resourceStore.cutSelected(resources)
    },
    {
      icon: "material-symbols:drive-file-move-outline",
      text: t('move-to'),
      onClick: () => openMoveToFolderDialog(selected)
    },
    ...(resourceStore.currentFolder ? [{
      icon: "material-symbols:drive-file-move-outline",
      text: t('move-to-parent'),
      onClick: () => {
        if (selected.length === 0) return;
        void resourceStore.moveToParentFolder(selected);
      }
    }] : []),
    {
      icon: "mingcute:delete-2-line",
      text: t('delete'),
      isDeleteButton: true,
      onClick: () => {
        showTipsDialog({
          title: t('confirm-to-delete'),
          content: t('this-operation-will-delete-the-selected-files-and-cannot-be-restored-please-confirm'),
          onConfirm: async () => {
            const selectedIds = Array.from(resourceStore.selectedItems);
            if (selectedIds.length === 0) return;

            await RootStore.Get(ToastPlugin).promise(
              api.attachments.deleteMany.mutate({ ids: selectedIds }),
              {
                loading: t('in-progress'),
                success: <b>{t('your-changes-have-been-saved')}</b>,
                error: <b>{t('operation-failed')}</b>,
              }
            );
            resourceStore.clearSelection();
            resourceStore.loadResources(resourceStore.currentFolder || undefined);
            RootStore.Get(DialogStandaloneStore).close();
          }
        });
      }
    }
  ];

  return (
    <MultiSelectToolbar
      show={resourceStore.selectedItems.size > 0}
      actions={actions}
      onClose={() => resourceStore.clearSelection()}
    />
  );
});
