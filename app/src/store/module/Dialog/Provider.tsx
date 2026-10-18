import { Button, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { observer } from "mobx-react-lite";
import { DialogStore } from ".";
import { RootStore } from "@/store/root";
import { useHistoryBack, useIsIOS } from "@/lib/hooks";
import { useMediaQuery } from "usehooks-ts";
import { motion } from "motion/react";
import { Icon } from '@/components/Common/Iconify/icons';
import { DialogBodyContent, DialogCloseButton as CloseButton } from "../dialogPresentation";
import { useCallback } from "react";

const Dialog = observer(() => {
  const modal = RootStore.Get(DialogStore);
  const isPc = useMediaQuery('(min-width: 768px)')
  const { className, classNames, isOpen, placement, title, size, content, isDismissable, onlyContent = false, noPadding = false, showOnlyContentCloseButton = false, transparent = false } = modal;
  const isIOS = useIsIOS()
  const requestClose = useCallback(() => { if (!modal.preventClose) modal.close(); }, [modal]);
  useHistoryBack({
    state: isOpen,
    onStateChange: requestClose,
    historyState: 'modal'
  });

  const motionConfig = {
    initial: false,
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 0, transition: { duration: 0 } },
    transition: { duration: 0 },
  };

  // 层级必须高于全屏编辑器（z-[9999]）与笔记操作菜单（z-[10050]）：
  // 从全屏编辑器里点「分享 / 发布 / 编辑时间 / 历史记录 / 关联笔记」都会开弹窗，
  // 若低于 9999 弹窗会被整块盖住，表现为点了没反应。
  const containerClass = isPc
    ? "fixed inset-0 z-[10061] flex justify-center items-center pointer-events-none max-w-screen-2xl mx-auto left-0 right-0"
    : "fixed bottom-0 left-0 right-0 z-[10061] flex flex-col items-center pointer-events-none";

  const modalSizeClass = (() => {
    const baseClass = 'mx-auto ';
    switch (size) {
      case 'xs':
        return baseClass + 'w-1/4';
      case 'sm':
        return baseClass + 'w-1/3';
      case 'md':
        return baseClass + 'w-1/2';
      case 'lg':
        return baseClass + 'w-2/3';
      case 'xl':
        return baseClass + 'w-3/4';
      case '2xl':
        return baseClass + 'w-4/5';
      case '3xl':
        return baseClass + 'w-5/6';
      case '4xl':
        return baseClass + 'w-11/12';
      case '5xl':
        return baseClass + 'w-full';
      case 'full':
        return baseClass + 'w-full';
      default:
        return baseClass + 'w-full';
    }
  })();

  if (isIOS && isOpen) {
    return (
      <>
        <div
          className="fixed inset-0 z-[10060] bg-black/50 backdrop-blur-sm"
          onClick={() => {
            if (isDismissable && !modal.preventClose) {
              modal.close()
            }
          }}
        />
        <motion.div
          className={`${containerClass} ${isPc ? modalSizeClass : ''} `}
          {...motionConfig}

        >
          {!onlyContent && (
            <motion.div
              className="w-full bg-background border-secondbackground p-1 rounded-t-lg shadow-lg pointer-events-auto"
              {...motionConfig}
            >
              <div className="flex flex-col justify-between items-center p-2 gap-2 w-full">
                <div className="flex gap-2 w-full items-center">
                  <div className="text-lg font-semibold">{title ?? ''}</div>
                  <Button isIconOnly variant="light" aria-label="关闭弹窗" onPress={requestClose} className="ml-auto">
                    <Icon icon="tabler:x" width="16" height="16" />
                  </Button>
                </div>
                <div className="w-full" >
                  <DialogBodyContent content={content} />
                </div>
              </div>
            </motion.div>
          )}
          {
            onlyContent && <motion.div
              className="w-full pointer-events-auto "
              {...motionConfig}
            >
              <div className="relative w-full">
                {
                  showOnlyContentCloseButton &&
                  <CloseButton onClose={requestClose} />
                }
                <div className="w-full">
                  <DialogBodyContent content={content} />
                </div>
              </div>
            </motion.div>
          }
        </motion.div>
      </>
    )
  }
  return (
    <>
      <Modal
        style={{ zIndex: 10060 }}
        onClose={requestClose}
        backdrop='blur'
        isOpen={isOpen}
        size={size}
        placement={placement}
        onOpenChange={(open: boolean) => {
          if (open) {
            modal.preventClose = false
          }
          if (!open) {
            if (!modal.preventClose) {
              modal.close();
            }
          }
        }}
        hideCloseButton={modal.hideCloseButton || size === 'full' || onlyContent}
        className={`${className} ${transparent ? 'bg-transparent' : ''}`}
        /**
         * `style={{ zIndex }}` 只落到 ModalContent 上，而 HeroUI 真正盖住全屏的
         * 是外层 wrapper（`fixed inset-0 z-50`）与 backdrop —— 只抬内层的话
         * wrapper 仍是 z-50，弹窗被 z-[9999] 的全屏编辑器整块压住，表现为
         * 「点了菜单没反应」。这里用 !important 变体，避免和主题里的 z-50
         * 在生成的 CSS 里拼先后顺序。
         */
        classNames={{
          ...classNames,
          backdrop: `!z-[10059] ${classNames?.backdrop ?? ''}`,
          wrapper: `!z-[10060] ${classNames?.wrapper ?? ''}`,
        }}
        isDismissable={isDismissable && !modal.preventClose}
        isKeyboardDismissDisabled={modal.preventClose}
        disableAnimation={!modal.animated}
        motionProps={modal.animated ? {variants:{enter:{opacity:1,y:0,scale:1,transition:{duration:0.16}},exit:{opacity:0,y:4,scale:0.995,transition:{duration:0.1}}}} : undefined}
        scrollBehavior={onlyContent ? 'normal' : 'inside'}
      >
        {
          onlyContent ?
            <ModalContent className="max-h-screen overflow-visible relative modal-content" >

              {
                showOnlyContentCloseButton &&
                <CloseButton onClose={requestClose} />
              }
              <DialogBodyContent content={content} />
            </ModalContent> :
            <ModalContent className="max-h-[calc(100dvh-32px)] overflow-hidden rounded-xl shadow-xl">
              {() => (
                <>
                  {title && <ModalHeader className="flex flex-col gap-1 px-5 pt-5 pb-3 pr-12 text-base font-semibold">{title}</ModalHeader>}
                  <ModalBody className={`${noPadding ? '' : 'px-5 pb-5 pt-1 '}`}>
                    <DialogBodyContent content={content} />
                  </ModalBody>
                </>
              )}
            </ModalContent>
        }
      </Modal>
    </>
  );
});

export default Dialog;
