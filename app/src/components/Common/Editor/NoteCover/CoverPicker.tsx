import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDropzone } from 'react-dropzone';
import {
  Button,
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
import { DEFAULT_COVERS, randomDefaultCoverKey } from './defaultCovers';
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      hideCloseButton
      size="4xl"
      placement="center"
      classNames={{ wrapper: 'z-[9998]' }}
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pb-2">
                {DEFAULT_COVERS.map((item) => {
                  const selected = cover === `cover:${item.key}`;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`relative aspect-video overflow-hidden rounded-lg border-2 transition-all ${
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
              <Button
                size="sm"
                variant="flat"
                color="danger"
                startContent={<Icon icon="mingcute:delete-2-line" width={15} height={15} />}
                onPress={() => { onRemove(); onClose(); }}
              >
                {t('remove-cover')}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="light"
              startContent={<Icon icon="mingcute:shuffle-line" width={15} height={15} />}
              onPress={() => { onPick(randomDefaultCoverKey(cover)); onClose(); }}
            >
              {t('random-cover')}
            </Button>
            <Button size="sm" color="primary" onPress={onClose}>
              {t('finish')}
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
