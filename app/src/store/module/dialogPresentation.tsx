import { Button } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import type { ReactNode } from 'react';

/** Stable component identity: host updates must not remount an open form. */
export const DialogBodyContent = ({ content }: { content: ReactNode | ((props: any) => ReactNode) }) => {
  const Component = content;
  return typeof Component === 'function' ? <Component /> : <>{Component}</>;
};

/** Shared by both dialog hosts; stays inside the viewport and keyboard reachable. */
export const DialogCloseButton = ({ onClose }: { onClose: () => void }) => (
  <Button isIconOnly size="sm" radius="sm" variant="light" aria-label="关闭弹窗"
    onPress={onClose} className="absolute right-2 top-2 z-[10062] bg-background/90 text-default-500 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40">
    <Icon icon="tabler:x" width={18} />
  </Button>
);
