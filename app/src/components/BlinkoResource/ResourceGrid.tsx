import { Card } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import filesize from 'filesize';
import dayjs from '@/lib/dayjs';
import { FileIcons } from '@/components/Common/AttachmentRender/FileIcon';
import { ImageThumbnailRender } from '../Common/AttachmentRender/imageRender';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { ResourceStore } from '@/store/resourceStore';
import { ResourceContextMenu } from './ResourceContextMenu';
import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { type ResourceType } from '@shared/lib/types';
import { formatFolderPath, isImageResource, openResourceFile } from './resourceUtils';

/**
 * Gallery-style resource wall (reference: WeChat/cloud-drive file grids):
 * folders render as big folder tiles, images as square thumbnails, other
 * files as icon tiles — each with name + size · date meta below.
 */

const splitName = (name: string) => {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { name, ext: '' };
  return { name: name.substring(0, dot), ext: name.substring(dot + 1) };
};

const GridTile = observer(({ item, isSelected, onSelect, onOpen, isSelectMode, orderedIds }: {
  item: ResourceType;
  isSelected: boolean;
  onSelect: (id: number, options?: { range?: boolean; orderedIds?: number[] }) => void;
  onOpen: () => void;
  isSelectMode: boolean;
  orderedIds: number[];
}) => {
  const resourceStore = RootStore.Get(ResourceStore);
  const navigate = useNavigate();
  const isImage = !item.isFolder && isImageResource(item);
  const folderPath = formatFolderPath((item as any).perfixPath);
  const showFolderPath = !!folderPath && folderPath !== (resourceStore.currentFolder || '');
  const handleContextMenu = useCallback(() => {
    resourceStore.setContextMenuResource(toJS(item));
  }, [item, resourceStore]);

  const meta = useMemo(() => {
    if (item.isFolder) return null;
    const size = filesize(Number(item.size));
    const date = dayjs(item.createdAt).format('MM-DD');
    return `${size} · ${date}`;
  }, [item]);

  const displayName = item.isFolder ? item.folderName : splitName(item.name).name;

  const handleClick = (e: React.MouseEvent) => {
    if (item.isFolder) {
      onOpen();
      return;
    }
    if (isSelectMode || e.metaKey || e.ctrlKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      onSelect(item.id!, { range: e.shiftKey, orderedIds });
      return;
    }
    onOpen();
  };

  return (
    <div
      className="relative group/tile"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <Card
        shadow="none"
        className={`p-3 flex flex-col items-center gap-2 bg-background !transition-all duration-150 cursor-pointer rounded-xl
          hover:bg-hover ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      >
        {/* preview area */}
        <div className="relative w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg">
          {item.isFolder ? (
            <Icon icon="material-symbols:folder" className="w-[64px] h-[64px] text-[#FBC02D]" />
          ) : isImage && !isSelectMode ? (
            <PhotoProvider>
              <PhotoView src={getBlinkoEndpoint(`${item.path}?token=${RootStore.Get(UserStore).tokenData.value?.token}`)}>
                <div className="w-full h-full cursor-zoom-in" onClick={(e) => e.stopPropagation()}>
                  <ImageThumbnailRender src={item.path} className="!mb-0 w-full h-full object-cover rounded-lg" wrapperClassName="h-full" />
                </div>
              </PhotoView>
            </PhotoProvider>
          ) : isImage ? (
            <ImageThumbnailRender src={item.path} className="!mb-0 w-full h-full object-cover rounded-lg" wrapperClassName="h-full" />
          ) : (
            <div className="flex items-center justify-center w-full h-full bg-default-100 rounded-lg">
              <FileIcons path={item.path} size={48} />
            </div>
          )}

          {!item.isFolder && (
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label="select"
              className={`absolute left-1.5 top-1.5 z-20 flex items-center justify-center w-8 h-8 rounded-lg shadow-md border pointer-events-auto
                ${isSelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'bg-white/95 border-black/10 text-default-600 hover:bg-white'}
              `}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(item.id!);
              }}
            >
              {isSelected ? (
                <Icon icon="tabler:check" className="w-5 h-5" />
              ) : (
                <span className="block w-4 h-4 rounded-[4px] border-2 border-default-400" />
              )}
            </button>
          )}
        </div>

        {/* name + meta */}
        <div className="w-full flex flex-col items-center gap-0.5 min-w-0">
          <div className="w-full flex items-center justify-center gap-1 min-w-0">
            <span className="text-sm font-medium truncate text-center" title={(item.isFolder ? item.folderName : item.name) || undefined}>{displayName}</span>
            {item.path?.includes('s3file') && (
              <Icon icon="fluent-color:cloud-16" className="w-3.5 h-3.5 shrink-0" />
            )}
          </div>
          {showFolderPath && (
            <div
              className="text-[11px] text-default-400 truncate w-full text-center hover:text-primary"
              title={folderPath}
              onClick={(e) => {
                e.stopPropagation();
                void resourceStore.navigateToPath(folderPath, navigate);
              }}
            >
              {folderPath}
            </div>
          )}
          <div className="text-xs text-default-400">{meta}</div>
        </div>
      </Card>

      {/* context menu trigger anchored to the tile */}
      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover/tile:opacity-100 !transition-opacity">
        <ResourceContextMenu onTrigger={handleContextMenu} />
      </div>
    </div>
  );
});

const MemoGridTile = memo(GridTile, (prev, next) => {
  const a = toJS(prev.item);
  const b = toJS(next.item);
  if (prev.isSelectMode !== next.isSelectMode) return false;
  if (a.isFolder && b.isFolder) {
    return a.folderName === b.folderName && prev.isSelected === next.isSelected;
  }
  return a.id === b.id && a.name === b.name && a.path === b.path && a.size === b.size
    && prev.isSelected === next.isSelected;
});

export const ResourceGrid = observer(({ resources, onFolderClick }: {
  resources: ResourceType[];
  onFolderClick: (folder: string) => void;
}) => {
  const resourceStore = RootStore.Get(ResourceStore);
  const isSelectMode = resourceStore.isSelectMode || resourceStore.selectedItems.size > 0;
  const orderedIds = resources.filter(resource => !resource.isFolder && resource.id).map(resource => resource.id!);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 py-2">
      {resources.map(item => (
        <MemoGridTile
          key={item.isFolder ? `folder-${item.folderName}` : `file-${item.id}`}
          item={item}
          isSelected={resourceStore.selectedItems.has(item.id!)}
          onSelect={resourceStore.toggleSelect}
          isSelectMode={isSelectMode}
          orderedIds={orderedIds}
          onOpen={() => {
            if (item.isFolder) onFolderClick(item.folderName || '');
            else if (!isImageResource(item)) openResourceFile(item);
          }}
        />
      ))}
    </div>
  );
});
