import { Store } from "./standard/base";
import { makeAutoObservable } from "mobx";
import { useRouter } from "next/router";
import { BlinkoStore } from "./blinkoStore";
import { RootStore } from ".";
import { ResourceType } from "@/server/types";
import { useEffect } from "react";
import { api } from "@/lib/trpc";
import { PromiseCall } from "./standard/PromiseState";
import { t } from "i18next";
import { ToastPlugin } from "./module/Toast/Toast";

export class ResourceStore implements Store {
  sid = 'resourceStore';
  currentFolder: string | null = null;
  selectedItems: Set<number> = new Set();
  contextMenuResource: ResourceType | null = null;
  refreshTicker = 0
  clipboard: { type: 'cut' | 'copy', items: ResourceType[] } | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get blinko() {
    return RootStore.Get(BlinkoStore);
  }

  setCurrentFolder = (folder: string | null) => {
    this.currentFolder = folder;
  }

  toggleSelect = (id: number) => {
    const newSet = new Set(this.selectedItems);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    this.selectedItems = newSet;
  }

  clearSelection = () => {
    this.selectedItems = new Set();
  }

  loadResources = (folder?: string) => {
    this.clearSelection();
    this.blinko.resourceList.resetAndCall({
      folder: folder || undefined,
    });
  }

  loadNextPage = () => {
    this.blinko.resourceList.callNextPage({
      folder: this.currentFolder || undefined,
    });
  }

  handleDragEnd = async (result: any) => {
    if (!result.destination) return;

    const { source, destination } = result;

    const destItem = this.blinko.resourceList.value?.[destination.index];
    if (!destItem?.isFolder) return;

    const itemsToMove = Array.from(this.selectedItems).map(id =>
      this.blinko.resourceList.value?.find(item => item.id === Number(id))
    ).filter((item): item is NonNullable<typeof item> => item != null);

    if (itemsToMove.length === 0) {
      const draggedItem = this.blinko.resourceList.value?.[source.index];
      if (!draggedItem) return;
      itemsToMove.push(draggedItem);
    }

    const targetPath = this.currentFolder
      ? `${this.currentFolder}/${destItem.folderName}`
      : destItem.folderName;

    await RootStore.Get(ToastPlugin).promise(
      PromiseCall(api.attachments.move.mutate({
        sourceIds: itemsToMove.map(item => item.id!),
        targetFolder: targetPath!.split('/').join(',')
      }), { autoAlert: false }), 
      {
        loading: t("operation-in-progress"),
        success: t("operation-success"),
        error: t("operation-failed")
      }
    );

    this.refreshTicker++;
    this.clearSelection();
  };

  navigateToFolder = async (folderName: string, router: ReturnType<typeof useRouter>) => {
    const newPath = this.currentFolder
      ? `${this.currentFolder}/${folderName}`
      : folderName;

    this.setCurrentFolder(newPath);
    this.loadResources(newPath);

    await router.push({
      pathname: '/resources',
      query: { folder: newPath }
    }, undefined, { shallow: true });
  }

  navigateBack = async (router: ReturnType<typeof useRouter>) => {
    if (!this.currentFolder) return;

    const folders = this.currentFolder.split('/');
    folders.pop();
    const parentFolder = folders.join('/');

    this.setCurrentFolder(parentFolder || null);
    this.loadResources(parentFolder || undefined);

    await router.push({
      pathname: '/resources',
      query: parentFolder ? { folder: parentFolder } : {}
    }, undefined, { shallow: true });
  }

  setContextMenuResource = (resource: ResourceType | null) => {
    this.contextMenuResource = resource;
  }

  setCutItems = (items: ResourceType[]) => {
    this.clipboard = { type: 'cut', items };
  };

  clearClipboard = () => {
    this.clipboard = null;
  };

  use(router) {
    useEffect(() => {
      const folder = router.query.folder as string;
      if (folder !== this.currentFolder) {
        this.setCurrentFolder(folder);
        this.loadResources(folder);
      }
    }, [router.query.folder]);

    useEffect(() => {
      this.loadResources(this.currentFolder || undefined);
    }, [this.refreshTicker]);
  }

  moveToParentFolder = async (items: ResourceType[]) => {
    if (!this.currentFolder) return;

    const folders = this.currentFolder.split('/');
    folders.pop();
    const parentFolder = folders.length > 0 ? folders.join(',') : '';

    await RootStore.Get(ToastPlugin).promise(
      PromiseCall(api.attachments.move.mutate({
        sourceIds: items.map(item => item.id!),
        targetFolder: parentFolder
      }), { autoAlert: false }), 
      {
        loading: t("operation-in-progress"),
        success: t("operation-success"),
        error: t("operation-failed")
      }
    );
    this.refreshTicker++;
    this.clearSelection();
  };
}