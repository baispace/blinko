import { getAvatarUrl } from '@/lib/profileIdentity';
import { Icon } from '@/components/Common/Iconify/icons';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
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
  const navigate = useNavigate()
  return (
    <Dropdown
      placement="top-start"
      classNames={{
        content: 'bg-background border border-default-200 rounded-xl min-w-[220px] shadow-lg',
      }}
    >
      <DropdownTrigger>
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
      </DropdownTrigger>
      <DropdownMenu aria-label={accountLabel}>
        <>
          {base.routerList
            .filter((i) => i.hiddenSidebar)
            .map((i) => (
              <DropdownItem
                key={i.title}
                className='text-default-600 rounded-lg'
                startContent={<Icon icon={i.icon} width="20" height="20" />}
                onPress={() => {
                  // 设置走 overlay 弹窗，不做路由跳转。跳转会把用户从当前页面
                  // （闪念列表 / 详情页）踢走，而 PC 端设置本来就是弹窗交互；
                  // 关闭弹窗后应当原样停在原页面。
                  if (i.href === '/settings') {
                    ShowSettingsDialog();
                  } else {
                    navigate(i.href);
                    base.currentRouter = i;
                  }
                  onItemClick?.();
                }}
              >
                {t(i.title)}
              </DropdownItem>
            ))}

          <DropdownItem
            key="logout"
            className="text-danger rounded-lg border-t border-default-200 mt-1"
            startContent={<Icon icon="hugeicons:logout-05" width="20" height="20" />}
            onPress={async () => {
              await signOut({ callbackUrl: '/signin', redirect: false });
              navigate('/signin');
              onItemClick?.();
            }}
          >
            {t('logout')}
          </DropdownItem>
        </>
      </DropdownMenu>
    </Dropdown>
  );
});
