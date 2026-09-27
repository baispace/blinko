import { Card, Checkbox } from '@heroui/react';
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
import { observer } from 'mobx-react-lite';
import { toJS } from 'mobx';
import { type ResourceType } from '@shared/lib/types';

/**
 * Gallery-style resource wall (reference: WeChat/cloud-drive file grids):
 * folders render as big folder tiles, images as square thumbnails, other
 * files as icon tiles — each with name + size · date meta below.
 */

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'ico', 'avif', 'svg'];

const isImageResource = (item: ResourceType) => {
  if (item.type?.startsWith('image/')) return true;
  const ext = item.name?.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
};

const splitName = (name: string) => {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return { name, ext: '' };
  return { name: name.substring(0, dot), ext: name.substring(dot + 1) };
};

const GridTile = observer(({ item, isSelected, onSelect, onOpen }: {
  item: ResourceType;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onOpen: () => void;
}) => {
  const resourceStore = RootStore.Get(ResourceStore);
  const isImage = !item.isFolder && isImageResource(item);

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

  return (
    <div
      className="relative group/tile"
      onClick={onOpen}
      onContextMenu={handleContextMenu}
    >
      <Card
        shadow="none"
        className={`p-3 flex flex-col items-center gap-2 bg-background !transition-all duration-150 cursor-pointer rounded-xl
          hover:bg-hover ${isSelected ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      >
        {/* selection checkbox, out of the way until hover / selected */}
        {!item.isFolder && (
          <div
            className={`absolute left-2 top-2 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100'}`}
            onClick={(e) => { e.stopPropagation(); onSelect(item.id!); }}
          >
            <Checkbox isSelected={isSelected} onChange={() => onSelect(item.id!)} className="z-10" onClick={(e) => e.stopPropagation()} />
          </div>
        )}

        {/* preview area */}
        <div className="w-full aspect-square flex items-center justify-center overflow-hidden rounded-lg">
          {item.isFolder ? (
            <Icon icon="material-symbols:folder" className="w-[64px] h-[64px] text-[#FBC02D]" />
          ) : isImage ? (
            <PhotoProvider>
              <PhotoView src={getBlinkoEndpoint(`${item.path}?token=${RootStore.Get(UserStore).tokenData.value?.token}`)}>
                <div className="w-full h-full cursor-zoom-in" onClick={(e) => e.stopPropagation()}>
                  <ImageThumbnailRender src={item.path} className="!mb-0 w-full h-full object-cover rounded-lg" wrapperClassName="h-full" />
                </div>
              </PhotoView>
            </PhotoProvider>
          ) : (
            <div className="flex items-center justify-center w-full h-full bg-default-100 rounded-lg">
              <FileIcons path={item.path} size={48} />
            </div>
          )}
        </div>

        {/* name + meta */}
        <div className="w-full flex flex-col items-center gap-0.5 min-w-0">
          <div className="w-full flex items-center justify-center gap-1 min-w-0">
            <span className="text-sm font-medium truncate text-center">{displayName}</span>
            {item.path?.includes('s3file') && (
              <Icon icon="fluent-color:cloud-16" className="w-3.5 h-3.5 shrink-0" />
            )}
          </div>
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 py-2">
      {resources.map(item => (
        <MemoGridTile
          key={item.isFolder ? `folder-${item.folderName}` : `file-${item.id}`}
          item={item}
          isSelected={resourceStore.selectedItems.has(item.id!)}
          onSelect={resourceStore.toggleSelect}
          onOpen={() => {
            if (item.isFolder) onFolderClick(item.folderName || '');
          }}
        />
      ))}
    </div>
  );
});
