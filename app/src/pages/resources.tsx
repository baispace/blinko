import { RootStore } from "@/store";
import { ResourceStore } from "@/store/resourceStore";
import { observer } from "mobx-react-lite";
import { useMemo, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/Common/ScrollArea";
import { Icon } from '@/components/Common/Iconify/icons';
import { useTranslation } from "react-i18next";
import { DragDropContext, Droppable } from 'react-beautiful-dnd-next';
import { toJS } from "mobx";
import { MemoizedResourceItem } from "@/components/BlinkoResource/ResourceItem";
import { ResourceGrid } from "@/components/BlinkoResource/ResourceGrid";
import { ResourceMultiSelectPop } from "@/components/BlinkoResource/ResourceMultiSelectpop";
import { Breadcrumbs, BreadcrumbItem, Button, Input, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from "@heroui/react";
import { AnimatePresence, motion } from "framer-motion";
import { LoadingAndEmpty } from "@/components/Common/LoadingAndEmpty";
import { PhotoProvider } from "react-photo-view";
import { useNavigate } from "react-router-dom";

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'ico', 'avif', 'svg'];
const VIDEO_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'epub'];

const getExt = (item: { name: string; type?: string }) => (item.name?.split('.').pop() || '').toLowerCase();

const matchFilterType = (item: { name: string; type?: string }, filter: string) => {
  if (filter === 'all') return true;
  const ext = getExt(item);
  if (filter === 'image') return item.type?.startsWith('image/') || IMAGE_EXTS.includes(ext);
  if (filter === 'video') return item.type?.startsWith('video/') || VIDEO_EXTS.includes(ext);
  if (filter === 'audio') return item.type?.startsWith('audio/') || AUDIO_EXTS.includes(ext);
  if (filter === 'doc') return DOC_EXTS.includes(ext);
  return false; // 'other' is computed as the complement below
};

const FILTER_OPTIONS = ['all', 'image', 'video', 'audio', 'doc', 'other'] as const;
const FILTER_ICONS: Record<string, string> = {
  all: 'material-symbols:select-all',
  image: 'hugeicons:image-01',
  video: 'hugeicons:video-01',
  audio: 'tabler:music',
  doc: 'ri:file-text-line',
  other: 'ri:file-list-3-line',
};

const Page = observer(() => {
  const navigate = useNavigate();
  const resourceStore = RootStore.Get(ResourceStore);
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allResources = useMemo(() => {
    const list = toJS(resourceStore.blinko.resourceList.value) || [];
    // Filter out .folder placeholder files
    return list.filter(resource => resource.name !== '.folder');
  }, [resourceStore.blinko.resourceList.value]);

  const resources = useMemo(() => {
    const search = resourceStore.searchText.trim().toLowerCase();
    const filter = resourceStore.filterType;
    return allResources.filter(item => {
      if (filter === 'other') {
        // everything that is none of the typed categories
        if (matchFilterType(item, 'image') || matchFilterType(item, 'video') || matchFilterType(item, 'audio') || matchFilterType(item, 'doc')) return false;
      } else if (!matchFilterType(item, filter)) {
        return false;
      }
      if (search) {
        const name = (item.isFolder ? item.folderName : item.name)?.toLowerCase() || '';
        if (!name.includes(search)) return false;
      }
      return true;
    });
  }, [allResources, resourceStore.searchText, resourceStore.filterType]);

  const selectedItems = resourceStore.selectedItems;

  const handleMoveSelectedToParent = useCallback(async () => {
    if (!resourceStore.currentFolder) return;
    const selectedResources = Array.from(selectedItems)
      .map(id => allResources.find(r => r.id === id))
      .filter((item): item is NonNullable<typeof item> => item != null);

    if (selectedResources.length > 0) {
      await resourceStore.moveToParentFolder(selectedResources);
    }
  }, [resourceStore, selectedItems, allResources]);

  const folderBreadcrumbs = useMemo(() => {
    if (!resourceStore.currentFolder) return [];
    return ['Root', ...resourceStore.currentFolder.split('/')];
  }, [resourceStore.currentFolder]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await resourceStore.uploadFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── 拖拽上传（页面级 drop zone） ──
  const dragCounter = useRef(0);
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounter.current += 1;
    resourceStore.setDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      resourceStore.setDragOver(false);
    }
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    resourceStore.setDragOver(false);
    const files = e.dataTransfer.files;
    if (files?.length) await resourceStore.uploadFiles(files);
  };

  // 上传进度聚合：总数 / 完成 / 当前百分比
  const uploadEntries = Object.entries(resourceStore.uploadProgress);
  const totalTasks = uploadEntries.length;
  const doneTasks = Object.values(resourceStore.uploadDone).filter(v => v === 'success' || v === 'error').length;
  const overallPct = totalTasks > 0
    ? Math.round(uploadEntries.reduce((s, [, v]) => s + v, 0) / totalTasks)
    : 0;
  const isUploadingNow = totalTasks > 0 && doneTasks < totalTasks;

  resourceStore.use();

  const isGridView = resourceStore.viewMode === 'grid';

  return (
    <>
      <DragDropContext onDragEnd={resourceStore.handleDragEnd}>
        <div
          className="relative md:px-6 h-[calc(100%_-_5px)] md:h-[calc(100vh_-_100px)] px-2 md:max-w-[1100px] w-full overflow-x-hidden mx-auto"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
        {resourceStore.isDragOver && (
          <div className="pointer-events-none absolute inset-2 z-40 rounded-2xl border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center backdrop-blur-sm transition-all">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Icon icon="tabler:cloud-upload" className="w-12 h-12" />
              <span className="font-medium">松手即可上传到 {resourceStore.currentFolder || '根目录'}</span>
            </div>
          </div>
        )}
        <ScrollArea
          fixMobileTopBar
          onBottom={resourceStore.loadNextPage}
          className="h-full w-full"
        >
          {/* Header: title + count / search / view toggle / filter / actions */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xl font-bold">{t('resources')}</span>
              <span className="min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-full bg-default-100 text-xs text-default-500">
                {allResources.length}
              </span>
            </div>

            <Input
              value={resourceStore.searchText}
              onChange={(e) => resourceStore.setSearchText(e.target.value)}
              placeholder={t('search')}
              size="sm"
              startContent={<Icon icon="mdi:magnify" width={15} height={15} className="text-default-400" />}
              className="w-full sm:w-[220px]"
              isClearable
              onClear={() => resourceStore.setSearchText('')}
            />

            <div className="flex items-center gap-1.5 ml-auto">
              {/* view mode toggle */}
              <div className="flex items-center rounded-lg bg-default-100 p-0.5">
                {(['grid', 'list'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => resourceStore.setViewMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium !transition-colors ${
                      resourceStore.viewMode === mode ? 'bg-background text-foreground shadow-sm' : 'text-default-500 hover:text-foreground'
                    }`}
                  >
                    {mode === 'grid' ? t('view-grid') : t('view-list')}
                  </button>
                ))}
              </div>

              {/* type filter */}
              <Dropdown placement="bottom-end">
                <DropdownTrigger>
                  <Button
                    size="sm"
                    variant="flat"
                    className="bg-default-100 !bg-default-100 text-default-600 h-8 min-w-8 px-2"
                    startContent={<Icon icon={FILTER_ICONS[resourceStore.filterType]} width={15} height={15} />}
                  >
                    <span className="hidden sm:inline">{t(`filter-${resourceStore.filterType}`)}</span>
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="filter"
                  selectedKeys={[resourceStore.filterType]}
                  selectionMode="single"
                  onAction={(key) => resourceStore.setFilterType(key as any)}
                >
                  {FILTER_OPTIONS.map(type => (
                    <DropdownItem key={type} startContent={<Icon icon={FILTER_ICONS[type]} width={15} height={15} />}>
                      {t(`filter-${type}`)}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>

              <Button
                size="sm"
                variant="flat"
                className="bg-default-100 !bg-default-100 text-default-600 h-8"
                onPress={resourceStore.handleNewFolder}
                startContent={<Icon icon="material-symbols:create-new-folder-outline" className="w-4 h-4" />}
              >
                <span className="hidden sm:inline">{t('new-folder')}</span>
              </Button>

              <Button
                size="sm"
                color="primary"
                className="h-8"
                onPress={handleUploadClick}
                isLoading={isUploadingNow}
                startContent={!isUploadingNow ? <Icon icon="tabler:upload" className="w-4 h-4" /> : undefined}
              >
                {t('upload')}
              </Button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />
            </div>
          </div>

          {/* folder breadcrumb (inside folders) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AnimatePresence mode="wait">
                {resourceStore.currentFolder && (
                  <motion.div
                    key={resourceStore.currentFolder}
                    initial={{ y: -10, opacity: 0, height: 0 }}
                    animate={{ y: 0, opacity: 1, height: "auto" }}
                    exit={{ y: -10, opacity: 0, height: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30, duration: 0.15 }}
                  >
                    <Breadcrumbs variant="solid" className="ml-[-8px]" size='sm'>
                      {folderBreadcrumbs.map((folder, index) => (
                        <BreadcrumbItem
                          key={folder}
                          onPress={() => {
                            if (index === 0) {
                              resourceStore.navigateBack(navigate);
                            } else {
                              const currentPathSegments = resourceStore.currentFolder?.split('/') || [];
                              const stepsToGoBack = currentPathSegments.length - index;
                              for (let i = 0; i < stepsToGoBack; i++) {
                                resourceStore.navigateBack(navigate);
                              }
                            }
                          }}
                        >
                          {folder}
                        </BreadcrumbItem>
                      ))}
                    </Breadcrumbs>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* selection actions (kept for list mode drag-sorting workflows) */}
            {!isGridView && (
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="light"
                  onPress={() => {
                    if (selectedItems.size === allResources.length) {
                      resourceStore.clearSelection();
                    } else {
                      resourceStore.selectAllFiles(allResources);
                    }
                  }}
                  startContent={
                    <Icon
                      icon={selectedItems.size === allResources.length ? "material-symbols:deselect" : "material-symbols:select-all"}
                      className="w-5 h-5"
                    />
                  }
                >
                  {selectedItems.size === allResources.length ? t('deselect-all') : t('select-all')}
                </Button>

                {selectedItems.size > 0 && resourceStore.currentFolder && resourceStore.currentFolder !== 'Root' && (
                  <Button
                    variant="light"
                    onPress={handleMoveSelectedToParent}
                    startContent={<Icon icon="material-symbols:drive-file-move-outline" className="w-5 h-5" />}
                  >
                    {t('move-to-parent')}
                  </Button>
                )}
              </div>
            )}
          </div>

          <LoadingAndEmpty
            isLoading={resourceStore.blinko.resourceList.isLoading}
            isEmpty={!resources.length}
            emptyMessage={t('no-resources-found')}
          />

          <PhotoProvider>
            {resources.length > 0 && (
              isGridView ? (
                <ResourceGrid
                  resources={resources}
                  onFolderClick={(folder) => resourceStore.navigateToFolder(folder, navigate)}
                />
              ) : (
                <Droppable droppableId="resources">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="py-2 min-h-[200px]"
                    >
                      {resources.map((item, index) => (
                        <MemoizedResourceItem
                          key={item.isFolder ? `folder-${item.folderName}` : `file-${item.id}`}
                          item={item}
                          index={index}
                          isSelected={selectedItems.has(item.id!)}
                          onSelect={resourceStore.toggleSelect}
                          onFolderClick={(folder) => resourceStore.navigateToFolder(folder, navigate)}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )
            )}
          </PhotoProvider>

        </ScrollArea>

        {/* 上传进度条（底部固定；isUploadingNow 时显示） */}
        {totalTasks > 0 && (
          <div className="absolute bottom-3 left-3 right-3 z-30 bg-content1/95 border border-default-200 rounded-xl shadow-lg px-4 py-2.5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 text-xs">
                <Icon icon={isUploadingNow ? "tabler:upload" : (Object.values(resourceStore.uploadDone).every(v => v === 'success') ? "tabler:check" : "tabler:alert-triangle")} className={`w-4 h-4 ${isUploadingNow ? 'text-primary animate-pulse' : (Object.values(resourceStore.uploadDone).every(v => v === 'success') ? 'text-success' : 'text-warning')}`} />
                <span className="font-medium">
                  {isUploadingNow
                    ? t('uploading-files', { done: doneTasks, total: totalTasks })
                    : t('upload-finished', { done: doneTasks, total: totalTasks })}
                </span>
              </div>
              <button
                className="text-default-400 hover:text-foreground text-xs"
                onClick={() => resourceStore.clearUploadProgress()}
                aria-label="dismiss"
              >
                <Icon icon="tabler:x" className="w-4 h-4" />
              </button>
            </div>
            <div className="h-1.5 w-full bg-default-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${isUploadingNow ? 'bg-primary' : (Object.values(resourceStore.uploadDone).some(v => v === 'error') ? 'bg-warning' : 'bg-success')}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            {/* 失败文件名提示 */}
            {Object.keys(resourceStore.uploadDone).filter(k => resourceStore.uploadDone[k] === 'error').length > 0 && (
              <div className="mt-1.5 text-[10px] text-default-400 truncate">
                {t('upload-failed-files', { count: Object.keys(resourceStore.uploadDone).filter(k => resourceStore.uploadDone[k] === 'error').length })}
              </div>
            )}
          </div>
        )}
        </div>
      </DragDropContext>
      <ResourceMultiSelectPop />
    </>
  );
});

export default Page;
