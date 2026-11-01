import { useEffect, useRef, useState } from 'react';
import { Button, Modal, ModalContent } from '@heroui/react';
import { api } from '@/lib/trpc';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { Icon } from '@/components/Common/Iconify/icons';
import {
  BlogCoverGeneratorDialog,
  type CoverGeneratorResult,
} from './BlogCoverGeneratorDialog';

type Settings = Awaited<ReturnType<typeof api.blog.publishSettings.query>>;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '操作失败，请重试。';

/**
 * 列表行上的封面助手。
 *
 * 走的是文章详情页那一套：同一个生成器、同一套提示词、同一套预览场景 ——
 * 列表只是省掉「先打开文章再找按钮」这两步，生成与预览的规则完全一致。
 *
 * 有封面就直接进预览（看看现在这张在各位置上的样子），没有就进生成；
 * 两条路最后都落到「应用到封面」，写的是草稿，发布后才对外生效。
 */
export function BlogCoverAssistant({
  noteId,
  onApplied,
  onClose,
}: {
  noteId: number;
  onApplied?: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(true);
  const alive = useRef(true);
  /* 生成器点「应用到封面」后会立刻关掉自己 —— 用 ref 记住正在写入，别把提示吞掉。 */
  const savingRef = useRef(false);

  useEffect(() => {
    alive.current = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const state = await api.blog.publishSettings.query({ noteId });
        if (!alive.current) return;
        setSettings(state);
      } catch (error) {
        if (alive.current) setError(errorText(error));
      } finally {
        if (alive.current) setLoading(false);
      }
    };
    void load();
    return () => {
      alive.current = false;
    };
  }, [noteId]);

  const apply = async (result: CoverGeneratorResult) => {
    if (!settings) return;
    savingRef.current = true;
    setError('');
    try {
      /*
       * applyCover 只写草稿：底图挂到 draftCoverAttachmentId，文字层写进
       * notes.metadata。公开快照一概不动 —— 要点「更新发布」才对外生效。
       */
      await api.blog.applyCover.mutate({
        noteId,
        ...(result.id ? { attachmentId: result.id } : { path: result.path }),
        config: {
          mode: result.coverMode,
          templateVersion: settings.config.templateVersion,
          title: result.coverTitle,
          subtitle: result.coverSubtitle,
          align: settings.config.align,
          sizeScale: settings.config.sizeScale,
          palette: result.coverPalette ?? settings.config.palette,
        },
      });
      RootStore.Get(ToastPlugin).success('封面已写入草稿，发布后生效。');
      await onApplied?.();
      onClose();
    } catch (error) {
      savingRef.current = false;
      if (!alive.current) return;
      setError(errorText(error));
    }
  };

  /* 生成器自己关掉时：正在写入就先把窗口收起来，写完再给结果。 */
  const handleClose = () => {
    if (savingRef.current) {
      setOpen(false);
      return;
    }
    onClose();
  };

  if (loading) {
    return <StatusModal title="封面助手" message="正在读取封面设置…" onClose={onClose} />;
  }

  if (!settings) {
    return (
      <StatusModal
        title="封面助手"
        message={error || '读取封面设置失败，请重试。'}
        tone="danger"
        onClose={onClose}
      />
    );
  }

  if (!settings.hasPublication) {
    /*
     * 草稿箱里的笔记还没有发布记录，封面生成要挂在发布记录上 ——
     * 与其让人点进去撞一句报错，不如在这里说清楚。
     */
    return (
      <StatusModal
        title="封面助手"
        message="这篇文章还没有发布过，封面要等发布记录有了才能生成。先发布一次，再回来做封面。"
        onClose={onClose}
      />
    );
  }

  return (
    <>
      {open && (
        <BlogCoverGeneratorDialog
          noteId={noteId}
          mode={settings.cover ? 'preview' : 'generate'}
          initial={{
            base: settings.cover
              ? { id: settings.cover.id, path: settings.cover.path }
              : null,
            coverTitle: settings.config.title,
            coverSubtitle: settings.config.subtitle,
            coverMode: settings.config.mode,
            articleTitle: settings.title,
            text: {
              align: settings.config.align,
              palette: settings.config.palette,
              sizeScale: settings.config.sizeScale,
              templateVersion: settings.config.templateVersion,
            },
          }}
          onApply={(result) => void apply(result)}
          onClose={handleClose}
        />
      )}
      {!open && !!error && (
        <StatusModal
          title="封面助手"
          message={error}
          tone="danger"
          onClose={onClose}
        />
      )}
    </>
  );
}

function StatusModal({
  title,
  message,
  tone = 'default',
  onClose,
}: {
  title: string;
  message: string;
  tone?: 'default' | 'danger';
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      classNames={{ wrapper: 'z-[10001]', backdrop: 'z-[10000]' }}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      hideCloseButton
      disableAnimation
      isDismissable
      placement="center"
      size="sm"
    >
      <ModalContent className="bg-background">
        <header className="flex items-center justify-between border-b border-default-200 px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <Button isIconOnly variant="light" onPress={onClose} aria-label="关闭">
            <Icon icon="tabler:x" width={18} />
          </Button>
        </header>
        <div className="px-5 py-4">
          <p
            className={`text-sm ${tone === 'danger' ? 'text-danger' : 'text-default-600'}`}
            role={tone === 'danger' ? 'alert' : 'status'}
          >
            {message}
          </p>
        </div>
      </ModalContent>
    </Modal>
  );
}
