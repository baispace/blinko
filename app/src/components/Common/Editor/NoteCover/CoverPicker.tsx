import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import {
  Image,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Spinner,
  Tab,
  Tabs,
} from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { DEFAULT_COVERS, COVER_CATEGORIES, randomDefaultCoverKey, type CoverCategory } from './defaultCovers';
import { toAuthenticatedCoverUrl } from './coverUrl';

interface CoverPickerProps {
  isOpen: boolean
  onClose: () => void
  /** Current value: `cover:<key>`, an uploaded path, or undefined */
  cover?: string
  onPick: (cover: string) => void
  onRemove: () => void
  onUpload: (file: File) => Promise<string | null>
}

export const CoverPicker = ({
  isOpen,
  onClose,
  cover,
  onPick,
  onRemove,
  onUpload,
}: CoverPickerProps) => {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Default to the category the current cover belongs to, else "official". */
  const [activeCat, setActiveCat] = useState<CoverCategory>(
    () => DEFAULT_COVERS.find((c) => `cover:${c.key}` === cover)?.category ?? 'official',
  );

  const activeUrl = toAuthenticatedCoverUrl(cover);

  const doUpload = async (files: File[]) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const path = await onUpload(file);
      if (path) {
        onPick(path);
        onClose();
      } else {
        setUploadError(t('upload-failed'));
      }
    } catch (error) {
      console.error('[CoverPicker] upload failed', error);
      const detail = error instanceof Error ? error.message : String(error);
      setUploadError(`${t('upload-failed')}${detail ? `: ${detail}` : ''}`);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragAccept, open } = useDropzone({
    multiple: false,
    noClick: true,
    onDrop: (accepted) => {
      void doUpload(accepted);
    },
  });

  return (
    /* z-[10000]: must sit above the fullscreen editor overlay (z-[9999]),
       otherwise the picker opens behind it and looks unresponsive. */
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideCloseButton
      size="4xl"
      placement="center"
      classNames={{ wrapper: 'z-[10000]' }}
    >
      <ModalContent>
        <ModalHeader className="pb-2">
          <span className="text-base font-bold">{t('edit-cover')}</span>
        </ModalHeader>
        <ModalBody className="pb-0">
          <Tabs
            defaultSelectedKey="gallery"
            size="sm"
            aria-label={t('cover')}
          >
            <Tab key="gallery" title={t('cover-gallery')}>
              {/* Category chips (Feishu-style tabs) */}
              <div className="flex items-center gap-1.5 flex-wrap pb-3">
                {COVER_CATEGORIES.map((cat) => {
                  const active = activeCat === cat.key;
                  return (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setActiveCat(cat.key)}
                      className={`px-3 py-1 rounded-full text-xs !transition-colors cursor-pointer ${
                        active
                          ? 'bg-primary text-white'
                          : 'bg-default-100 text-default-600 hover:bg-default-200'
                      }`}
                    >
                      {t(cat.labelKey)}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-2 max-h-[46vh] overflow-y-auto">
                {DEFAULT_COVERS.filter((item) => item.category === activeCat).map((item) => {
                  const selected = cover === `cover:${item.key}`;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`relative aspect-[2.35/1] overflow-hidden rounded-lg border-2 transition-all ${
                        selected ? 'border-primary' : 'border-transparent hover:border-default-300'
                      }`}
                      onClick={() => { onPick(`cover:${item.key}`); onClose(); }}
                    >
                      <Image
                        removeWrapper
                        src={item.src}
                        alt={item.key}
                        className="w-full h-full object-cover"
                      />
                      {selected && (
                        <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white">
                          <Icon icon="mdi:check" width={12} height={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Tab>

            <Tab key="upload" title={t('cover-upload')}>
              <div className="pb-2">
                <div
                  {...getRootProps()}
                  className={`flex flex-col items-center justify-center gap-2 aspect-video rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                    isDragAccept ? 'border-primary bg-primary/5' : 'border-default-300'
                  }`}
                  onClick={open}
                >
                  <input {...getInputProps()} />
                  {uploading ? (
                    <Spinner size="sm" />
                  ) : (
                    <>
                      <Icon icon="lucide:upload-cloud" width={24} height={24} className="text-default-400" />
                      <span className="text-sm text-desc">{t('click-or-drop-image')}</span>
                    </>
                  )}
                </div>
                {uploadError && <div className="mt-2 text-xs text-danger">{uploadError}</div>}
              </div>
            </Tab>
          </Tabs>
        </ModalBody>
        <ModalFooter className="justify-between">
          <div className="flex items-center gap-2">
            {activeUrl && (
              /* Native buttons: HeroUI <Button onPress> silently no-ops inside
                 modals in this app (same root cause as the page-width popover). */
              <button
                type="button"
                onClick={() => { onRemove(); onClose(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-danger bg-danger/10 hover:bg-danger/20 !transition-colors cursor-pointer"
              >
                <Icon icon="mingcute:delete-2-line" width={15} height={15} />
                {t('remove-cover')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { onPick(randomDefaultCoverKey(cover)); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-foreground hover:bg-default-100 !transition-colors cursor-pointer"
            >
              <Icon icon="mingcute:shuffle-line" width={15} height={15} />
              {t('random-cover')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center px-4 py-1.5 rounded-md text-sm text-white bg-primary hover:bg-primary/90 !transition-colors cursor-pointer"
            >
              {t('finish')}
            </button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
