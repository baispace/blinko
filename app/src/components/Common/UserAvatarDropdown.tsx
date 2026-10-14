import { Icon } from '@/components/Common/Iconify/icons';
import { Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, Image } from '@heroui/react';
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
  showOverlay?: boolean;
}

export const UserAvatarDropdown = observer(({ onItemClick, collapsed = false, showOverlay = false }: UserAvatarDropdownProps) => {
  const base = RootStore.Get(BaseStore);
  const user = RootStore.Get(UserStore);
  const { t } = useTranslation();
  const navigate = useNavigate()
  return (
    <Dropdown
      placement="bottom-start"
      classNames={{
        content: 'bg-background border border-default-200 rounded-xl min-w-[220px] shadow-lg',
      }}
    >
      <DropdownTrigger>
        <button type="button" aria-label="账户与管理菜单" title={user.nickname || user.name || "账户与管理"} className={`cursor-pointer rounded-lg p-1.5 hover:bg-default-100 transition-colors focus-visible:outline-primary flex items-center justify-center shrink-0`}>
          <div className="relative group">
            {user.image ? (
              <img src={getBlinkoEndpoint(`${user.image}?token=${user.tokenData.value?.token}`)} alt="avatar" className={`${collapsed ? 'w-9 h-9' : 'w-8 h-8'} rounded-lg object-cover !transition-all`} />
            ) : (
              <Image src="/logo.png" width={30} />
            )}

          </div>

        </button>
      </DropdownTrigger>
      <DropdownMenu aria-label="账户与管理">
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
