import { observer } from "mobx-react-lite";
import { Card, Chip, Input } from "@heroui/react";
import { Icon } from '@/components/Common/Iconify/icons';
import { Copy } from "../Common/Copy";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { DialogStore } from "@/store/module/Dialog";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { PromiseState } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { useTranslation } from "react-i18next";
import { Note } from "@shared/lib/types";

/**
 * 发布到主页。
 *
 * 与「分享」是两套独立开关：分享是带密码/过期时间的私密链接，
 * 发布是公开内容源（isPublished + 8 位 publishId），供外部博客服务查询展示。
 * 这里的按钮全部用原生 <button> —— HeroUI 的 onPress 在弹窗容器里不触发。
 */
export const BlinkoPublishDialog = observer(({ note }: { note: Note }) => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);

  const store = RootStore.Local(() => ({
    isPublished: !!note.isPublished,
    publishId: note.publishId ?? '',
    publishState: new PromiseState({
      function: async (isCancel: boolean) => {
        return await api.notes.publishNote.mutate({ id: note.id!, isCancel });
      },
    }),
  }));

  const publishUrl = store.publishId ? `${window.location.origin}/blog/${store.publishId}` : '';

  const handleToggle = async () => {
    const isCancel = store.isPublished;
    try {
      const res = await store.publishState.call(isCancel);
      store.isPublished = !!res?.isPublished;
      store.publishId = res?.publishId ?? '';
      RootStore.Get(ToastPlugin).success(isCancel ? t('unpublished') : t('published'));
      // 让列表重新拉一次，卡片上的已发布标记才能跟着变
      blinko.updateTicker++;
      if (isCancel) {
        RootStore.Get(DialogStore).close();
      }
    } catch (e: any) {
      RootStore.Get(ToastPlugin).error(e?.message ?? 'publish failed');
    }
  };

  return (
    <Card shadow="none" className="p-4 flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <Icon icon="tabler:world" width="20" height="20" className="mt-[2px]" />
        <div className="flex-1">
          <div className="font-bold">{t('publish-to-home')}</div>
          <div className="text-sm text-desc mt-1">{t('publish-desc')}</div>
        </div>
        <Chip
          size="sm"
          variant="flat"
          color={store.isPublished ? 'success' : 'default'}
        >
          {store.isPublished ? t('published') : t('unpublished')}
        </Chip>
      </div>

      {store.isPublished && publishUrl && (
        <div className="flex flex-col gap-2">
          <span className="text-default-700 font-medium text-sm">{t('publish-link')}</span>
          <div className="flex gap-2 items-center">
            <Input value={publishUrl} readOnly size="sm" />
            <Copy content={publishUrl} size={24} />
          </div>
          <div className="text-xs text-desc">
            {t('publish-id')}: <span className="font-mono">{store.publishId}</span>
          </div>
        </div>
      )}

      <div className="w-full flex items-end gap-3 mt-2">
        <button
          className="flex-1 h-9 rounded-medium border border-default-200 text-sm font-medium hover:bg-default-100 !transition-all"
          onClick={() => RootStore.Get(DialogStore).close()}
        >
          {t('close')}
        </button>
        <button
          className={`flex-1 h-9 rounded-medium text-sm font-medium !transition-all ${store.isPublished ? 'bg-danger text-white' : 'bg-primary text-primary-foreground'}`}
          disabled={store.publishState.loading.value}
          onClick={handleToggle}
        >
          {store.publishState.loading.value
            ? t('loading')
            : store.isPublished
              ? t('cancel-publish')
              : t('publish')}
        </button>
      </div>
    </Card>
  );
});
