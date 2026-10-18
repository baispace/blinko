import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, Progress, Button } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Common/Iconify/icons';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { RootStore } from '@/store';

export interface UpdateProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 应用内更新对话框。
 *
 * 流程刻意分成两段，而不是一打开就下载：
 *   检查 → 「发现新版本 vX」→ 用户点「下载更新」才真正拉包 → 安装 → 提示重启。
 * 自动更新下载的是整个 .app bundle，用户有权先知道要装什么。
 */
type UpdateStatus =
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'installing'
  | 'completed'
  | 'error';

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const UpdateProgressDialog: React.FC<UpdateProgressDialogProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus>('checking');
  const [pending, setPending] = useState<Update | null>(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(0);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // 组件可能在中途被父级关掉，用 ref 防止 setState 打到已卸载的树上
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const runCheck = useCallback(async () => {
    setStatus('checking');
    setErrorMessage('');
    try {
      const [version, update] = await Promise.all([getVersion().catch(() => ''), check()]);
      if (!alive.current) return;
      setCurrentVersion(version);
      if (!update) {
        setPending(null);
        setStatus('up-to-date');
        return;
      }
      setPending(update);
      setStatus('available');
    } catch (error) {
      if (!alive.current) return;
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    alive.current = true;
    setProgress(0);
    setDownloaded(0);
    setTotal(0);
    void runCheck();
  }, [isOpen, runCheck]);

  const downloadAndInstall = useCallback(async (update: Update) => {
    setStatus('downloading');
    setProgress(0);
    setDownloaded(0);
    setTotal(0);
    let contentLength = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (!alive.current) return;
        if (event.event === 'Started') {
          contentLength = event.data.contentLength ?? 0;
          setTotal(contentLength);
        } else if (event.event === 'Progress') {
          setDownloaded(prev => {
            const next = prev + event.data.chunkLength;
            if (contentLength > 0) setProgress((next / contentLength) * 100);
            return next;
          });
        }
      });
      if (!alive.current) return;
      setStatus('completed');
      RootStore.Get(ToastPlugin).success(t('update-completed'));
    } catch (error) {
      if (!alive.current) return;
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : String(error));
      RootStore.Get(ToastPlugin).error(t('update-failed'));
    }
  }, [t]);

  const restartApp = useCallback(async () => {
    setBusy(true);
    try {
      await relaunch();
    } catch (error) {
      setBusy(false);
      RootStore.Get(ToastPlugin).error(
        error instanceof Error ? error.message : t('update-failed'),
      );
    }
  }, [t]);

  // 下载/安装过程中不允许关掉，否则用户会留下一个半更新的应用
  const busy_ = status === 'downloading' || status === 'installing';
  const handleClose = useCallback(() => {
    if (busy_) return;
    onClose();
  }, [busy_, onClose]);

  const statusText = () => {
    switch (status) {
      case 'checking': return t('checking-for-updates');
      case 'up-to-date': return t('no-update-available');
      case 'downloading': return t('downloading-update');
      case 'installing': return t('installing-update');
      case 'completed': return t('update-completed');
      case 'error': return t('update-failed');
      default: return t('new-version-available');
    }
  };

  const statusIcon = () => {
    switch (status) {
      case 'checking': return <Icon icon="mdi:cloud-sync-outline" className="animate-pulse" width="24" height="24" />;
      case 'available': return <Icon icon="mdi:download-circle-outline" width="24" height="24" className="text-primary" />;
      case 'up-to-date': return <Icon icon="mdi:check-circle-outline" width="24" height="24" className="text-success" />;
      case 'downloading': return <Icon icon="mdi:download" className="animate-bounce" width="24" height="24" />;
      case 'installing': return <Icon icon="mdi:cog" className="animate-spin" width="24" height="24" />;
      case 'completed': return <Icon icon="mdi:check-decagram-outline" width="24" height="24" className="text-success" />;
      case 'error': return <Icon icon="mdi:alert-circle-outline" width="24" height="24" className="text-danger" />;
    }
  };

  return <Modal
    isOpen={isOpen}
    onClose={handleClose}
    isDismissable={!busy_}
    hideCloseButton={busy_}
    classNames={{ backdrop: 'bg-gradient-to-t from-zinc-900 to-zinc-900/10 backdrop-opacity-20' }}
  >
    <ModalContent>
      <ModalHeader className="flex items-center gap-2">
        {statusIcon()}
        <span>{t('app-update')}</span>
      </ModalHeader>
      <ModalBody className="pb-6">
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-sm text-default-600">{statusText()}</p>
            {currentVersion && (
              <p className="mt-1 text-xs text-default-400">
                {t('current-app-version')} · v{currentVersion}
              </p>
            )}
          </div>

          {status === 'available' && pending && <>
            <div className="rounded-xl border border-primary/25 bg-primary/[.04] px-4 py-3 text-center">
              <p className="text-xs text-default-500">{t('updating-to-version')}</p>
              <p className="mt-1 text-xl font-semibold">v{pending.version}</p>
            </div>
            {pending.body && <p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-default-100/60 px-3 py-2 text-xs leading-relaxed text-default-500">{pending.body}</p>}
            <div className="flex gap-2">
              <Button variant="light" className="flex-1" onPress={handleClose}>{t('cancel')}</Button>
              <Button color="primary" className="flex-1" startContent={<Icon icon="mdi:download" width="16" height="16" />} onPress={() => pending && downloadAndInstall(pending)}>
                {t('download')}
              </Button>
            </div>
          </>}

          {status === 'up-to-date' && <div className="flex justify-center"><Button variant="light" onPress={handleClose}>{t('close')}</Button></div>}

          {status === 'downloading' && <div className="space-y-3">
            <Progress
              aria-label={t('downloading-update')}
              size="lg"
              value={progress}
              showValueLabel
              formatOptions={{ style: 'percent', maximumFractionDigits: 0 }}
              classNames={{
                base: 'max-w-md',
                track: 'border border-default',
                label: 'tracking-wider text-default-500',
              }}
            />
            {total > 0 && <div className="flex justify-between text-xs text-default-400">
              <span>{formatBytes(downloaded)} / {formatBytes(total)}</span>
              <span>{progress.toFixed(0)}%</span>
            </div>}
          </div>}

          {status === 'installing' && <Progress aria-label={t('installing-update')} size="lg" isIndeterminate classNames={{ base: 'max-w-md', track: 'border border-default' }} />}

          {status === 'completed' && <div className="flex justify-center">
            <Button color="primary" isLoading={busy} startContent={<Icon icon="mdi:restart" width="16" height="16" />} onPress={restartApp}>
              {t('restart-app')}
            </Button>
          </div>}

          {status === 'error' && <div className="space-y-3 text-center">
            <p className="break-words text-sm text-default-600">{errorMessage || t('update-failed')}</p>
            <div className="flex gap-2">
              <Button variant="light" className="flex-1" onPress={handleClose}>{t('cancel')}</Button>
              <Button color="primary" className="flex-1" startContent={<Icon icon="mdi:refresh" width="16" height="16" />} onPress={runCheck}>{t('retry')}</Button>
            </div>
          </div>}
        </div>
      </ModalBody>
    </ModalContent>
  </Modal>;
};
