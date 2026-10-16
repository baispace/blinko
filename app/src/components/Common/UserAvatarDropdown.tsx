import { getAvatarUrl } from '@/lib/profileIdentity';
import { Icon } from '@/components/Common/Iconify/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { useState } from 'react';
import { AccountAppearance } from './Theme/AccountAppearance';
import { AboutSetting } from '../BlinkoSettings/AboutSetting';
import { DialogStore } from '@/store/module/Dialog';
import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BaseStore } from '@/store/baseStore';
import { UserStore } from '@/store/user';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { signOut } from '../Auth/auth-client';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { ShowSettingsDialog } from '../BlinkoSettings/SettingsDialog';

interface UserAvatarDropdownProps {
  onItemClick?: () => void;
  collapsed?: boolean;
}

export const UserAvatarDropdown = observer(({ onItemClick, collapsed = false }: UserAvatarDropdownProps) => {
  const base = RootStore.Get(BaseStore);
  const user = RootStore.Get(UserStore);
  const { t, i18n } = useTranslation();
  const accountLabel = i18n.language.startsWith('zh') ? '账户与设置' : 'Account & settings';
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const close = () => { setOpen(false); onItemClick?.(); };
  const zh = i18n.language.startsWith('zh');
  const rowClass = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-default-600 transition-colors hover:bg-default-100 focus-visible:outline-primary';
  return (
    <Popover placement="top-start" isOpen={open} onOpenChange={value => { setOpen(value); if (!value) setAppearance(false); }}>
      <PopoverTrigger>
        <button type="button" aria-label={accountLabel} title={collapsed ? accountLabel : (user.nickname || user.name || accountLabel)} className={`cursor-pointer rounded-lg p-2 hover:bg-default-100 transition-colors focus-visible:outline-primary flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'w-full text-left'}`}>
          <div className="relative shrink-0">
            {user.image ? (
              <img src={getAvatarUrl(user.image, user.token || '', getBlinkoEndpoint('/'))} alt="avatar" className={`${collapsed ? 'w-9 h-9' : 'w-8 h-8'} rounded-lg object-cover !transition-all`} />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-default-100 text-sm font-medium text-default-600">{(user.nickname || user.name || "U").slice(0, 1).toUpperCase()}</span>
            )}

          </div>
          {!collapsed && <span className="min-w-0 text-left"><span className="block truncate text-[13px] font-medium text-default-700">{user.nickname || user.name || accountLabel}</span><span className="block text-[11px] text-default-400">{accountLabel}</span></span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="block w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-xl border border-default-200 bg-background p-1.5 shadow-xl">
        <div className="max-h-[min(650px,80dvh)] overflow-y-auto">
          <div className="px-3 pb-2 pt-2 text-xs text-default-400">{user.nickname || user.name}</div>
          <nav aria-label={accountLabel}>
            {base.routerList.filter(item => item.hiddenSidebar).map(item => <button key={item.title} type="button" className={rowClass} onClick={() => {
              close();
              if (item.href === '/settings') ShowSettingsDialog();
              else { navigate(item.href); base.currentRouter = item; }
            }}><Icon icon={item.icon} width={18} height={18} /><span>{t(item.title)}</span></button>)}
            <button type="button" className={rowClass} aria-expanded={appearance} aria-controls="account-appearance" onClick={() => setAppearance(value => !value)}>
              <Icon icon="mdi:theme-light-dark" width={18} /><span className="flex-1">{zh ? '外观与语言' : 'Appearance & language'}</span><Icon icon="tabler:chevron-right" width={15} className={`transition-transform ${appearance ? 'rotate-90' : ''}`} />
            </button>
          </nav>
          {appearance && <div id="account-appearance" className="mx-1 mb-1 rounded-lg border border-default-200/70 bg-default-50/50 p-3"><AccountAppearance /></div>}
          <button type="button" className={rowClass} onClick={() => {
            close();
            RootStore.Get(DialogStore).setData({ isOpen:true, size:'2xl', title:zh ? '更新日志' : 'Update history', content:<div className="max-h-[70dvh] overflow-y-auto px-1 pb-4"><AboutSetting updatesOnly /></div> });
          }}><Icon icon="tabler:history" width={18} /><span>{zh ? '更新日志' : 'Update history'}</span></button>
          <div className="my-1 border-t border-default-100" />
          <button type="button" className={`${rowClass} !text-danger`} onClick={async () => {
            close(); await signOut({ callbackUrl:'/signin', redirect:false }); navigate('/signin');
          }}><Icon icon="hugeicons:logout-05" width={18} /><span>{t('logout')}</span></button>
        </div>
      </PopoverContent>
    </Popover>
  );
});
