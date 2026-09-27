import { useEffect, useState } from 'react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import { observer } from 'mobx-react-lite';
import { type Attachment } from '@shared/lib/types';
import { ImageThumbnailRender } from '../Common/AttachmentRender/imageRender';
import { HandleFileType, type FileType } from '../Common/Editor/editorUtils';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';

/**
 * Weibo-style media block for blinko cards: single image keeps its natural
 * aspect ratio (capped by a max height); multiple images form a square-cell
 * grid — 2 images side by side, 4 in a 2x2, the rest in rows of 3 — with the
 * whole grid width-capped so cells stay small like Weibo's feed. Click opens
 * the photo viewer.
 */
export const BlinkoImageGallery = observer(({ files }: { files: Attachment[] }) => {
  const [handledFiles, setFiles] = useState<FileType[]>([]);

  useEffect(() => {
    setFiles(HandleFileType(files));
  }, [files]);

  if (!handledFiles.length) return null;

  const single = handledFiles.length === 1;
  // Weibo grid rule: 4 images → 2x2, others → rows of 3 (2 images → 1 row)
  const cols = !single && handledFiles.length === 4 ? 2 : 3;

  return (
    <PhotoProvider>
      <div
        className={`${single ? 'w-full' : `grid gap-1 max-w-[420px] ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}`}
      >
        {handledFiles.map((file, index) => (
          <PhotoView
            key={file.name + index}
            src={getBlinkoEndpoint(`${file.preview}?token=${RootStore.Get(UserStore).tokenData.value?.token}`)}
          >
            <div
              className={`relative overflow-hidden rounded-md cursor-zoom-in group/gallery ${
                single ? 'w-full max-h-[420px]' : 'aspect-square'
              }`}
            >
              <ImageThumbnailRender
                src={file.preview}
                wrapperClassName={single ? '' : 'h-full'}
                className={`!mb-0 w-full object-cover !transition-transform group-hover/gallery:scale-[1.03] ${
                  single ? '!h-auto max-h-[420px]' : '!h-full'
                }`}
              />
            </div>
          </PhotoView>
        ))}
      </div>
    </PhotoProvider>
  );
});
