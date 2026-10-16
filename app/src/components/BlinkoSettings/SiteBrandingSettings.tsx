import { useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Input } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { SiteBrand } from '../Common/SiteBrand';
import { Item } from './Item';
import { SiteBrandingQuickLinksEditor } from './SiteBrandingQuickLinksEditor';

const DEFAULT_TAGLINE = '闪念 · 笔记 · 待办 · AI 工作流';

export const SiteBrandingSettings = observer(() => {
  const { t, i18n } = useTranslation();
  const text = (zh: string, en: string) => (i18n.language.startsWith('zh') ? zh : en);
  const blinko = RootStore.Get(BlinkoStore);
  const toast = RootStore.Get(ToastPlugin);

  const [name, setName] = useState(blinko.config.value?.customTitle || '');
  const [tagline, setTagline] = useState(blinko.config.value?.customTagline ?? '');
  const [saving, setSaving] = useState(false);
  const [iconSaving, setIconSaving] = useState(false);
  const [taglineSaving, setTaglineSaving] = useState(false);
  const nameDirty = useRef(false);
  const taglineDirty = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!nameDirty.current) setName(blinko.config.value?.customTitle || ''); }, [blinko.config.value?.customTitle]);
  useEffect(() => { if (!taglineDirty.current) setTagline(blinko.config.value?.customTagline ?? ''); }, [blinko.config.value?.customTagline]);

  const saveName = async () => {
    if (!nameDirty.current || saving) return;
    const value = name.trim();
    setSaving(true);
    try {
      await api.config.update.mutate({ key: 'customTitle', value });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customTitle: value };
      nameDirty.current = false;
      setName(value);
      toast.success(t('operation-success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('operation-failed'));
    } finally { setSaving(false); }
  };

  const saveTagline = async () => {
    if (!taglineDirty.current || taglineSaving) return;
    const value = tagline.trim();
    setTaglineSaving(true);
    try {
      await api.config.update.mutate({ key: 'customTagline', value });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customTagline: value };
      taglineDirty.current = false;
      setTagline(value);
      toast.success(t('operation-success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('operation-failed'));
    } finally { setTaglineSaving(false); }
  };

  const resetTagline = async () => {
    if (taglineSaving) return;
    setTagline('');
    setTaglineSaving(true);
    try {
      await api.config.update.mutate({ key: 'customTagline', value: '' });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customTagline: '' };
      taglineDirty.current = false;
      toast.success(t('operation-success'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('operation-failed'));
    } finally { setTaglineSaving(false); }
  };

  const saveIcon = async (value: string) => {
    setIconSaving(true);
    try {
      await api.config.update.mutate({ key: 'customIcon', value });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customIcon: value };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('operation-failed'));
    } finally { setIconSaving(false); }
  };

  const uploadIcon = async (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) {
      toast.error(text('请选择 1MB 以内的 PNG、JPG 或 WebP 图片', 'Choose a PNG, JPG or WebP image smaller than 1 MB'));
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const context = canvas.getContext('2d'); if (!context) throw new Error(text('无法处理图片，请重试', 'Could not process the image'));
        const scale = Math.min(128 / bitmap.width, 128 / bitmap.height);
        context.drawImage(bitmap, (128 - bitmap.width * scale) / 2, (128 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
        await saveIcon(canvas.toDataURL('image/png'));
      } finally { bitmap.close(); }
    } catch { toast.error(text('图片读取失败，请换一张图片', 'Could not read this image. Try another image.')); }
  };

  return (
    <div className="mb-5 space-y-4">
      <div className="rounded-xl border border-default-200 bg-default-50 p-4">
        <SiteBrand showTagline={Boolean((blinko.config.value?.customTagline ?? '').trim() || DEFAULT_TAGLINE)} />
        <p className="mt-3 text-xs text-default-400">
          {text('名称、图标与副标用于侧边栏、登录页和浏览器标签页。', 'Your name, icon and tagline appear in the sidebar, sign-in page and browser tab.')}
        </p>
      </div>
      <Item
        type="col"
        leftContent={text('站点名称', 'Workspace name')}
        rightContent={
          <div className="flex items-start gap-2">
            <Input
              aria-label={text('站点名称', 'Workspace name')}
              placeholder="Blinko"
              maxLength={50}
              value={name}
              isDisabled={saving}
              onValueChange={value => { nameDirty.current = true; setName(value); }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveName(); } }}
            />
            <Button variant="flat" isDisabled={!nameDirty.current} isLoading={saving} onPress={saveName}>{t('save')}</Button>
          </div>
        }
      />
      <Item
        type="col"
        leftContent={text('站点图标', 'Workspace icon')}
        rightContent={
          <div className="flex flex-wrap items-center gap-3">
            <SiteBrand compact size={40} />
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label={text('上传站点图标', 'Upload workspace icon')}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) void uploadIcon(file);
                event.target.value = '';
              }}
            />
            <Button size="sm" variant="flat" isLoading={iconSaving} onPress={() => fileInput.current?.click()}>
              {text('上传图标', 'Upload icon')}
            </Button>
            {blinko.config.value?.customIcon && (
              <Button size="sm" variant="light" isDisabled={iconSaving} onPress={() => saveIcon('')}>
                {t('restore-defaults')}
              </Button>
            )}
            <span className="text-xs text-default-400">PNG / JPG / WebP · ≤ 1MB</span>
          </div>
        }
      />
      <Item
        type="col"
        leftContent={
          <div className="flex flex-col">
            <span>{text('站点副标', 'Workspace tagline')}</span>
            <span className="mt-1 text-[11px] font-normal text-default-400">
              {text('在站点名称下显示的一行短语，留空使用默认。', 'A short line shown below the workspace name; leave blank for the default.')}
            </span>
          </div>
        }
        rightContent={
          <div className="flex items-start gap-2">
            <Input
              aria-label={text('站点副标', 'Workspace tagline')}
              placeholder={DEFAULT_TAGLINE}
              maxLength={50}
              value={tagline}
              isDisabled={taglineSaving}
              onValueChange={value => { taglineDirty.current = true; setTagline(value); }}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveTagline(); } }}
            />
            <Button variant="flat" isDisabled={!taglineDirty.current} isLoading={taglineSaving} onPress={saveTagline}>
              {t('save')}
            </Button>
            <Button variant="light" isDisabled={taglineSaving || !blinko.config.value?.customTagline} onPress={resetTagline}>
              {t('restore-defaults')}
            </Button>
          </div>
        }
      />
      <Item
        type="col"
        leftContent={
          <div className="flex flex-col">
            <span>{text('快速链接', 'Quick links')}</span>
            <span className="mt-1 text-[11px] font-normal text-default-400">
              {text(
                '在侧边栏顶部展示一行胶囊入口，可指向站内页面或外部链接。',
                'Show a row of pill links at the top of the sidebar — either in-app pages or external URLs.'
              )}
            </span>
          </div>
        }
        rightContent={<SiteBrandingQuickLinksEditor />}
      />
    </div>
  );
});
