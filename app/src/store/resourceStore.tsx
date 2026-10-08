import { Store } from "./standard/base";
import { makeAutoObservable, toJS } from "mobx";
import { useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { BlinkoStore } from "./blinkoStore";
import { RootStore } from ".";
import { ResourceType } from "@shared/lib/types";
import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { PromiseCall } from "./standard/PromiseState";
import { t } from "i18next";
import { ToastPlugin } from "./module/Toast/Toast";
import { DialogStore } from "./module/Dialog";
import { Button, Input } from "@heroui/react";
import axiosInstance from "@/lib/axios";
import { UserStore } from "./user";

export class ResourceStore implements Store {
  sid = 'resourceStore';
  currentFolder: string | null = null;
  selectedItems: Set<number> = new Set();
  contextMenuResource: ResourceType | null = null;
  refreshTicker = 0
  clipboard: { type: 'cut' | 'copy', items: ResourceType[] } | null = null;
  /** Grid (card wall) or list (drag-sort rows) presentation. */
  viewMode: 'grid' | 'list' = 'grid';
  /** Client-side name search, applied to the current page of resources. */
  searchText = '';
  /** Client-side type filter. */
  filterType: 'all' | 'image' | 'video' | 'audio' | 'doc' | 'other' = 'all';
  /** 当前正在上传的文件数（含已完成但尚未 dismiss 的）。 */
  uploading = 0;
  /** 每个上传任务（key=fileName+size）的进度 0~100。 */
  uploadProgress: Record<string, number> = {};
  /** 上传完成/失败的文件名集合（用于进度条显示"X / N"）。 */
  uploadDone: Record<string, 'success' | 'error'> = {};
  /** 当前是否处于 drag-over 状态（页面级 drop zone 高亮）。 */
  isDragOver = false;

  /** 简单的 worker pool：限制并发数。 */
  private async runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<void>) {
    let cursor = 0
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const idx = cursor++
        if (idx >= items.length) return
        await worker(items[idx]!, idx)
      }
    })
    await Promise.all(runners)
  }

  constructor() {
    makeAutoObservable(this);
  }

  get blinko() {
    return RootStore.Get(BlinkoStore);
  }

  setViewMode = (mode: 'grid' | 'list') => { this.viewMode = mode; }
  setSearchText = (text: string) => { this.searchText = text; }
  setFilterType = (type: 'all' | 'image' | 'video' | 'audio' | 'doc' | 'other') => { this.filterType = type; }

  /** Upload files straight into the current folder via /api/file/upload. Concurrency limited to UPLOAD_CONCURRENCY. */
  uploadFiles = async (files: File[] | FileList) => {
    const list = Array.from(files);
    if (!list.length) return;
    const UPLOAD_CONCURRENCY = 3;
    this.uploading += list.length;

    // ── 同名去重：当前文件夹内已有 name 时，自动加 " (N)" 后缀 ──
    // File.name 只读，要改名只能 new File 复制一份
    const existingNames = new Set<string>()
    const resources = toJS(this.blinko.resourceList.value) || []
    for (const r of resources) {
      if (r.isFolder || r.name === '.folder') continue
      const rFolder = (r.perfixPath ?? '') as string
      const curFolder = this.currentFolder ?? ''
      if (rFolder === curFolder) existingNames.add(r.name)
    }
    const renamed: Array<{ from: string; to: string }> = []
    const finalList: File[] = list.map(file => {
      if (!existingNames.has(file.name)) return file
      const dotIdx = file.name.lastIndexOf('.')
      const base = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name
      const ext = dotIdx > 0 ? file.name.slice(dotIdx) : ''
      let candidate = `${base} (1)${ext}`
      let n = 1
      while (existingNames.has(candidate)) {
        n++
        candidate = `${base} (${n})${ext}`
      }
      existingNames.add(candidate)
      renamed.push({ from: file.name, to: candidate })
      return new File([file], candidate, { type: file.type, lastModified: file.lastModified })
    })

    // 初始化每个任务的进度
    const taskKeys = finalList.map(f => `${f.name}__${f.size}`)
    taskKeys.forEach(k => { this.uploadProgress[k] = 0; this.uploadDone[k] = undefined as any })
    let successCount = 0
    let errorCount = 0

    const worker = async (file: File) => {
      const key = `${file.name}__${file.size}`
      try {
        const form = new FormData();
        form.append('file', file);
        if (this.currentFolder) form.append('folder', this.currentFolder);
        const res = await axiosInstance.post('/api/file/upload', form, {
          onUploadProgress: (e) => {
            if (!e.total) return
            const pct = Math.min(99, Math.round((e.loaded / e.total) * 100))
            this.uploadProgress[key] = pct
          },
        });
        if (res.data?.error) throw new Error(res.data.detail || res.data.error);
        this.uploadProgress[key] = 100
        this.uploadDone[key] = 'success'
        successCount++
      } catch (error: any) {
        this.uploadDone[key] = 'error'
        errorCount++
        console.error('[upload] failed', file.name, error)
      } finally {
        this.uploading = Math.max(0, this.uploading - 1)
      }
    }

    try {
      await this.runWithConcurrency(finalList, UPLOAD_CONCURRENCY, worker)
      // 改名提示（同名去重）
      if (renamed.length > 0) {
        const summary = renamed.length === 1
          ? t('upload-renamed-single', { from: renamed[0]!.from, to: renamed[0]!.to })
          : t('upload-renamed-multi', { count: renamed.length })
        RootStore.Get(ToastPlugin).loading(summary, { id: 'upload-rename' })
      }
      if (errorCount === 0) {
        RootStore.Get(ToastPlugin).success(t('upload-success'))
      } else if (successCount === 0) {
        RootStore.Get(ToastPlugin).error(t('upload-failed'))
      } else {
        RootStore.Get(ToastPlugin).error(t('upload-partial-failed', { success: successCount, failed: errorCount }))
      }
    } finally {
      this.refreshTicker++
      // 3s 后清掉进度记录，避免堆积
      setTimeout(() => {
        taskKeys.forEach(k => { delete this.uploadProgress[k]; delete this.uploadDone[k] })
      }, 3000)
    }
  }

  setDragOver = (v: boolean) => { this.isDragOver = v }
  clearUploadProgress = () => { this.uploadProgress = {}; this.uploadDone = {} }

  setCurrentFolder = (folder: string | null) => {
    this.currentFolder = folder;
  }

  selectAllFiles = (resources: ResourceType[]) => {
    this.selectedItems.clear();
    resources.forEach(resource => {
      if (!resource.isFolder && resource.id) {
        this.selectedItems.add(resource.id);
      }
    });
  };

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

  navigateToFolder = async (folderName: string, navigate: any) => {
    const newPath = this.currentFolder
      ? `${this.currentFolder}/${folderName}`
      : folderName;

    this.setCurrentFolder(newPath);
    this.loadResources(newPath);

    await navigate(`/resources?folder=${encodeURIComponent(newPath)}`);
  }

  navigateBack = async (navigate: any) => {
    if (!this.currentFolder) return;

    const folders = this.currentFolder.split('/');
    folders.pop();
    const parentFolder = folders.join('/');

    this.setCurrentFolder(parentFolder || null);
    this.loadResources(parentFolder || undefined);

    if (parentFolder) {
      await navigate(`/resources?folder=${encodeURIComponent(parentFolder)}`);
    } else {
      await navigate('/resources');
    }
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

  use() {
    const [searchParams] = useSearchParams();

    useEffect(() => {
      const folder = searchParams.get('folder');
      if (folder !== this.currentFolder) {
        this.setCurrentFolder(folder);
        this.loadResources(folder || undefined);
      }
    }, [searchParams]);

    useEffect(() => {
      this.loadResources(this.currentFolder || undefined);
    }, [this.refreshTicker]);
  }

  handleNewFolder = () => {
    const blinko = RootStore.Get(BlinkoStore);
    const currentResources = blinko.resourceList.value || [];

    RootStore.Get(DialogStore).setData({
      isOpen: true,
      size: 'sm',
      title: t('new-folder'),
      content: () => {
        const [newName, setNewName] = useState<string>('');
        const [error, setError] = useState<string>('');

        const validateAndCreateFolder = async () => {
          if (!newName.trim()) {
            setError(t('folder-name-required'));
            return;
          }

          const isDuplicate = currentResources.some(
            resource => resource.isFolder && resource.folderName?.toLowerCase() === newName.trim().toLowerCase()
          );

          if (isDuplicate) {
            setError(t('folder-name-exists'));
            return;
          }

          try {
            // Call backend API to create folder
            await PromiseCall(
              api.attachments.createFolder.mutate({
                folderName: newName.trim(),
                parentFolder: this.currentFolder || undefined
              })
            );
            
            // Refresh the resource list
            this.refreshTicker++;
            RootStore.Get(DialogStore).close();
          } catch (error) {
            setError(error.message || t('failed-to-create-folder'));
          }
        };

        return (
          <div className="flex flex-col gap-2 p-2">
            <Input
              label={t('folder-name')}
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setError('');
              }}
              errorMessage={error}
              isInvalid={!!error}
            />
            <Button
              color="primary"
              className="mt-2"
              onPress={validateAndCreateFolder}
              isDisabled={!newName.trim()}
            >
              {t('confirm')}
            </Button>
          </div>
        );
      }
    });
  };

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