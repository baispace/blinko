import { useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { ThemeColor } from './ThemeColor';
import { saveThemeColor } from './saveThemeColor';
export const AccountAppearance = observer(() => {
  const { theme, setTheme } = useTheme();
  const { i18n, t } = useTranslation();
  const base = RootStore.Get(BaseStore), blinko = RootStore.Get(BlinkoStore);
  const [busy, setBusy] = useState(false);
  const zh = i18n.language.startsWith('zh');
  const update = async (key: 'theme' | 'language', value: string) => {
    setBusy(true);
    try {
      await api.config.update.mutate({ key, value });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, [key]:value };
      if (key === 'theme') { localStorage.setItem('userTheme',value); setTheme(value); }
      else { localStorage.setItem('userLanguage',value); base.changeLanugage(i18n,value); }
    } catch (error) { RootStore.Get(ToastPlugin).error(error instanceof Error ? error.message : t('operation-failed')); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <fieldset disabled={busy}><legend className="mb-2 text-xs font-medium text-default-500">{t('theme')}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-default-100 p-1">{[['light',zh?'亮色':'Light'],['dark',zh?'暗色':'Dark'],['system',zh?'跟随系统':'System']].map(([value,label]) => <button key={value} type="button" aria-pressed={theme===value} onClick={() => void update('theme',value)} className={`rounded-md px-1 py-2 text-xs transition-colors focus-visible:outline-primary disabled:opacity-50 ${theme===value?'bg-background font-medium text-foreground shadow-sm':'text-default-500 hover:text-foreground'}`}>{label}</button>)}</div>
    </fieldset>
    <div><div className="mb-2 text-xs font-medium text-default-500">{t('theme-color')}</div><ThemeColor compact value={blinko.config.value?.themeColor} onChange={saveThemeColor} /></div>
    <label className="flex items-center justify-between gap-3 text-xs font-medium text-default-500">{t('language')}<select aria-label={t('language')} disabled={busy} value={base.locale.value} onChange={event => void update('language',event.target.value)} className="max-w-[160px] rounded-lg border border-default-200 bg-background px-2 py-2 text-xs text-foreground focus-visible:outline-primary">{base.locales.map(locale => <option key={locale.value} value={locale.value}>{locale.label}</option>)}</select></label>
  </div>;
});
