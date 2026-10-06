import dayjs from 'dayjs';
import { Store } from './standard/base';
import { StorageState } from './standard/StorageState';
import { makeAutoObservable } from 'mobx';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
export class BaseStore implements Store {
  sid = 'BaseStore';
  constructor() {
    makeAutoObservable(this);
  }
  routerList = [
    {
      title: 'blinko',
      href: '/',
      shallow: true,
      group: 'record' as const,
      icon: 'basil:lightning-outline',
    },
    {
      title: 'notes',
      shallow: true,
      href: '/?path=notes',
      group: 'record' as const,
      icon: 'hugeicons:note',
    },
    {
      title: 'todo',
      shallow: true,
      href: '/?path=todo',
      group: 'record' as const,
      icon: 'solar:bill-check-linear',
    },
    {
      title: 'analytics',
      href: '/analytics',
      group: 'tool' as const,
      hiddenMobile: true,
      icon: 'hugeicons:analytics-01',
    },
    {
      title: 'resources',
      href: '/resources',
      group: 'tool' as const,
      icon: 'solar:database-linear',
      hiddenMobile: true,
    },
    {
      title: 'archived',
      href: '/?path=archived',
      group: 'tidy' as const,
      icon: 'solar:box-broken',
      // 归档是内容视图，移动端必须可达：之前这里 hiddenMobile 为 true 且没进
      // 头像菜单（那里只渲染 hiddenSidebar 项），手机上等于没有归档入口。
      hiddenMobile: false,
    },
    {
      title: 'trash',
      href: '/?path=trash',
      group: 'tidy' as const,
      hiddenMobile: true,
      hiddenSidebar: false,
      icon: 'hugeicons:delete-02',
    },
    {
      title: 'plugin',
      href: '/plugin',
      group: 'tool' as const,
      hiddenSidebar: false,
      hiddenMobile: true,
      icon: 'hugeicons:plug-socket',
    },
    {
      title: 'settings',
      href: '/settings',
      group: 'tool' as const,
      hiddenSidebar: true,
      hiddenMobile: true,
      icon: 'hugeicons:settings-01',
    },
  ];
  currentRouter = this.routerList[0];
  currentQuery = {};
  currentTitle = '';
  documentHeight = 0;
  isSideBarActive(routerInfo: any, currentRouter: any) {
    const pathname = routerInfo.pathname;
    const path = routerInfo.searchParams?.get ? routerInfo.searchParams.get('path') : routerInfo.query?.path;

    if (pathname == currentRouter.href && !path) {
      return true;
    }
    if (path == currentRouter.title) {
      return true;
    }
    return false;
  }

  locale = new StorageState({ key: 'language', default: 'en' });
  locales = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'zh-TW', label: '繁體中文' },
  ];

  changeLanugage(i18n, locale) {
    i18n.changeLanguage(locale);
    dayjs.locale(i18n.resolvedLanguage);
    this.locale.save(locale);
  }

  isOnline: boolean = typeof window !== 'undefined' ? window.navigator.onLine : true;

  setOnlineStatus = (status: boolean) => {
    this.isOnline = status;
  };

  useInitApp() {
    const isPc = useMediaQuery('(min-width: 768px)');
    const { t, i18n } = useTranslation();
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams] = useSearchParams()

    const documentHeight = () => {
      const doc = document.documentElement;
      this.documentHeight = window.innerHeight;
      doc.style.setProperty('--doc-height', `${window.innerHeight}px`);
    };

    useEffect(() => {
      const handleOnline = () => this.setOnlineStatus(true);
      const handleOffline = () => this.setOnlineStatus(false);

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      documentHeight();
      window.addEventListener('resize', documentHeight);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('resize', documentHeight);
      };
    }, [navigate]);

    useEffect(() => {
      if (location.pathname == '/review') {
        this.currentTitle = 'daily-review';
      } else if (location.pathname == '/detail') {
        this.currentTitle = 'detail';
      } else if (searchParams.get('path') == 'all') {
        this.currentTitle = t('total');
      } else if (searchParams.get('path') == 'notes') {
        this.currentTitle = 'notes';
      } else if (searchParams.get('path') == 'todo') {
        this.currentTitle = 'todo';
      } else if (searchParams.get('path') == 'archived') {
        this.currentTitle = 'archived';
      } else if (location.pathname == '/resources') {
        this.currentTitle = 'resources';
      } else if (searchParams.get('path') == 'trash') {
        this.currentTitle = 'trash';
      } else if (location.pathname == '/plugin') {
        this.currentTitle = 'plugin';
      } else if (location.pathname == '/') {
        this.currentTitle = 'blinko';
      } else {
        this.currentTitle = this.currentRouter?.title ?? '';
      }

      if (this.currentRouter?.href != location.pathname) {
        this.currentRouter = this.routerList.find((item) => item.href == location.pathname) as any;
      }
    }, [this.currentRouter, location.pathname, searchParams]);

    useEffect(() => {
      this.currentQuery = searchParams;
    }, [searchParams]);
  }

  sidebarWidth = new StorageState<number>({
    key: 'sidebar-width',
    default: 220,
    validate: (value: number) => {
      if (value < 220) return 220;
      if (value > 400) return 400;
      return value;
    },
  });

  sidebarCollapsed = new StorageState<boolean>({
    key: 'sidebar-collapsed',
    default: false,
  });

  isResizing = false;
  isDragging = false;

  get isSidebarCollapsed() {
    return this.sidebarCollapsed.value;
  }

  get sideBarWidth() {
    return this.isSidebarCollapsed ? 80 : this.sidebarWidth.value;
  }

  set sideBarWidth(value: number) {
    if (!this.isSidebarCollapsed) {
      this.sidebarWidth.save(value);
    }
  }

  startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.isDragging = true;
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.stopResizing);
  };

  handleMouseMove = (e: MouseEvent) => {
    if (!this.isResizing || this.isSidebarCollapsed) return;

    e.preventDefault();
    const newWidth = Math.max(80, Math.min(400, e.clientX));
    this.sidebarWidth.save(newWidth);
  };

  stopResizing = () => {
    this.isResizing = false;
    setTimeout(() => {
      this.isDragging = false;
    }, 50);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.stopResizing);
  };

  toggleSidebar = () => {
    const newCollapsed = !this.isSidebarCollapsed;
    this.sidebarCollapsed.save(newCollapsed);
  };

  collapseSidebar = () => {
    this.sidebarCollapsed.save(false);
  };
}
