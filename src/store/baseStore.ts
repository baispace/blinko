import dayjs from 'dayjs';
import { Store } from './standard/base';
import { StorageState } from './standard/StorageState';
import { makeAutoObservable, observable, action } from 'mobx';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { BlinkoStore } from './blinkoStore';
import { RootStore } from '.';
import { T } from '@mastra/core/base-D90KQ4XI';

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
      icon: 'basil:lightning-outline',
    },
    {
      title: 'notes',
      shallow: true,
      href: '/?path=notes',
      icon: 'hugeicons:note',
    },
    {
      title: 'analytics',
      href: '/analytics',
      hiddenMobile: true,
      icon: 'hugeicons:analytics-01',
    },
    {
      title: 'resources',
      href: '/resources',
      icon: 'solar:database-linear',
      hiddenMobile: true,
    },
    {
      title: 'archived',
      href: '/?path=archived',
      icon: 'solar:box-broken',
      hiddenMobile: true,
    },
    {
      title: 'trash',
      href: '/?path=trash',
      hiddenMobile: true,
      hiddenSidebar: true,
      icon: 'formkit:trash',
    },
    {
      title: 'plugin',
      href: '/plugin',
      hiddenSidebar: true,
      hiddenMobile: false,
      icon: 'mingcute:plugin-line',
    },
    {
      title: 'settings',
      href: '/settings',
      hiddenSidebar: true,
      hiddenMobile: true,
      icon: 'lsicon:setting-outline',
    },
  ];
  currentRouter = this.routerList[0];
  currentQuery = {};
  currentTitle = '';
  documentHeight = 0;
  isSideBarActive(router: any, currentRouter: any) {
    if (router.pathname == currentRouter.href && !router.query?.path) {
      return true;
    }
    if (router.query?.path == currentRouter.title) {
      return true;
    }
    return false;
  }

  locale = new StorageState({ key: 'language', default: 'en' });
  locales = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'zh-tw', label: '繁體中文' },
    { value: 'vi', label: 'Tiếng Việt' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'ka', label: 'ქართული' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'pt', label: 'Português' },
    { value: 'pl', label: 'Polish' },
    { value: 'ru', label: 'Русский' },
    { value: 'ko', label: '한국어' },
    { value: 'ja', label: '日本語' },
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

  useInitApp(router) {
    const isPc = useMediaQuery('(min-width: 768px)');
    const { t, i18n } = useTranslation();

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
    }, [router.isReady]);

    useEffect(() => {
      if (router.pathname == '/review') {
        this.currentTitle = 'daily-review';
      } else if (router.pathname == '/detail') {
        this.currentTitle = 'detail';
      } else if (router.query?.path == 'all') {
        this.currentTitle = t('total');
      } else if (router.query?.path == 'notes') {
        this.currentTitle = 'notes';
      } else if (router.query?.path == 'archived') {
        this.currentTitle = 'archived';
      } else if (router.pathname == '/resources') {
        this.currentTitle = 'resources';
      } else if (router.query?.path == 'trash') {
        this.currentTitle = 'trash';
      } else if (router.pathname == '/plugin') {
        this.currentTitle = 'plugin';
      } else if (router.pathname == '/') {
        this.currentTitle = 'blinko';
      } else {
        this.currentTitle = this.currentRouter?.title ?? '';
      }

      if (this.currentRouter?.href != router.pathname) {
        this.currentRouter = this.routerList.find((item) => item.href == router.pathname);
      }
    }, [this.currentRouter, router.pathname, router.query]);

    useEffect(() => {
      this.currentQuery = router.query;
    }, [router.query]);
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
