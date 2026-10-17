import type { ReactNode } from 'react';
import { Modal, ModalContent } from '@heroui/react';

/** Upload selection is a child of the settings dialog (z-index 10060). */
export function StaticAssetUploadDialog({ isOpen, onClose, uploading, children }: {
  isOpen: boolean; onClose: () => void; uploading: boolean; children: ReactNode;
}) {
  return <Modal isOpen={isOpen} onClose={onClose} size="2xl" disableAnimation
    isDismissable={!uploading} isKeyboardDismissDisabled={uploading} hideCloseButton={uploading}
    classNames={{ wrapper: '!z-[10080]', backdrop: '!z-[10079]', base: 'border border-default-200 bg-background' }}>
    <ModalContent>{children}</ModalContent>
  </Modal>;
}
