import { observer } from "mobx-react-lite";
import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Button, Input } from '@nextui-org/react';
import { Icon } from '@iconify/react';
import { useTranslation } from 'react-i18next';
import { RootStore } from "@/store";
import { ResourceStore } from "@/store/resourceStore";
import { api } from "@/lib/trpc";
import { DialogStore } from "@/store/module/Dialog";
import { useState, useCallback } from "react";
import { helper } from "@/lib/helper";
import { showTipsDialog } from "../Common/TipsDialog";
import { PromiseCall } from "@/store/standard/PromiseState";

const MenuItem = ({ icon, label, className = '' }: { icon: string; label: string; className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <Icon icon={icon} className="w-5 h-5" />
    <span>{label}</span>
  </div>
);

interface ResourceContextMenuProps {
  onTrigger: () => void;
}

export const ResourceContextMenu = observer(({ onTrigger }: ResourceContextMenuProps) => {
  const { t } = useTranslation();
  const resourceStore = RootStore.Get(ResourceStore);
  const resource = resourceStore.contextMenuResource;

  const handleDownload = (() => {
    if (!resource) return;
    if (!resource.path) return;
    helper.download.downloadByLink(resource.path);
  });

  const handleRename = async () => {
    if (!resource) return;
    const currentName = resource.isFolder ? resource.folderName : resource.name;
    const resourceStore = RootStore.Get(ResourceStore);

    RootStore.Get(DialogStore).setData({
      isOpen: true,
      title: t('rename'),
      content: () => {
        const [newName, setNewName] = useState<string>(currentName || '');

        const getFullFolderPath = (name: string) => {
          if (!resource.isFolder) return undefined;
          if (resourceStore.currentFolder) {
            return `${resourceStore.currentFolder}/${name}`;
          }
          return name;
        };

        return (
          <div className="flex flex-col gap-4 p-4">
            <Input
              label={resource.isFolder ? t('folder-name') : t('file-name')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <Button
              color="primary"
              className="mt-2"
              onPress={async () => {
                const oldPath = getFullFolderPath(resource.folderName!);
                const newPath = getFullFolderPath(newName);
                await PromiseCall(api.attachments.rename.mutate({
                  id: resource?.id ?? undefined,
                  newName: newPath?.split('/').join(',') || newName,
                  isFolder: resource.isFolder,
                  oldFolderPath: oldPath?.split('/').join(',')
                }));
                RootStore.Get(DialogStore).close();
                resourceStore.refreshTicker++;
              }}
            >
              {t('confirm')}
            </Button>
          </div>
        );
      }
    });
  };

  const handleDelete = async () => {
    if (!resource) return;
    showTipsDialog({
      title: t('confirm-delete'),
      content: t('confirm-delete-content', {
        name: resource.isFolder ? resource.folderName : resource.name
      }),
      onConfirm: async () => {
        if (resource.isFolder) {
          const folderPath = resourceStore.currentFolder
            ? `${resourceStore.currentFolder}/${resource.folderName}`
            : resource.folderName;

          await PromiseCall(api.attachments.delete.mutate({
            isFolder: true,
            folderPath: folderPath?.split('/').join(',')
          }));
        } else {
          await PromiseCall(api.attachments.delete.mutate({
            id: resource.id!,
            isFolder: false
          }));
        }
        RootStore.Get(DialogStore).close();
        resourceStore.refreshTicker++;
      }
    });
  };

  const handleCut = () => {
    if (!resource) return;
    resourceStore.setCutItems([resource]);
  };

  const handlePaste = async () => {
    if (!resource) return;
    if (!resourceStore.clipboard || !resource.isFolder) return;

    const { items } = resourceStore.clipboard;
    if (resourceStore.clipboard.type === 'cut') {
      const targetPath = resourceStore.currentFolder
        ? `${resourceStore.currentFolder}/${resource.folderName}`
        : resource.folderName;

      await PromiseCall(api.attachments.move.mutate({
        sourceIds: items.map(item => item.id!),
        targetFolder: targetPath!.split('/').join(',')
      }));

      resourceStore.clearClipboard();
      resourceStore.refreshTicker++;
    }
  };

  const canPaste = () => {
    if (!resource) return;
    return resource.isFolder &&
      resourceStore.clipboard !== null &&
      resourceStore.clipboard.items.length > 0;
  };

  const handleMoveToParent = async () => {
    if (!resource || !resourceStore.currentFolder) return;
    await resourceStore.moveToParentFolder([resource]);
  };

  return (
    <Dropdown onOpenChange={e => onTrigger()}>
      <DropdownTrigger>
        <Button
          isIconOnly
          variant="light"
        >
          <Icon icon="mdi:dots-vertical" width="20" height="20" />
        </Button>
      </DropdownTrigger>
      <DropdownMenu aria-label="Resource Actions">
        {
          resource?.isFolder ? null : (
            <DropdownItem key="download" onPress={handleDownload}>
              <MenuItem icon="material-symbols:download" label={t('download')} />
            </DropdownItem>
          )
        }

        <DropdownItem key="rename" onPress={handleRename}>
          <MenuItem icon="gg:rename" label={t('rename')} />
        </DropdownItem>

        {resourceStore.currentFolder ? (
          <DropdownItem key="moveToParent" onPress={handleMoveToParent}>
            <MenuItem
              icon="material-symbols:drive-file-move-outline"
              label={t('move-up')}
            />
          </DropdownItem>
        ) : null}

        {
          resource?.isFolder ? null : (
            <DropdownItem key="cut" onPress={handleCut}>
              <MenuItem icon="material-symbols:content-cut" label={t('cut')} />
            </DropdownItem>
          )
        }

        {canPaste() ? (
          <DropdownItem key="paste" onPress={handlePaste}>
            <MenuItem icon="material-symbols:content-paste" label={t('paste')} />
          </DropdownItem>
        ) : null}

        <DropdownItem
          key="delete"
          className="text-danger"
          color="danger"
          onPress={handleDelete}
        >
          <MenuItem
            icon="material-symbols:delete-outline"
            label={t('delete')}
            className="text-danger"
          />
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}); 