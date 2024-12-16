import dayjs from 'dayjs';
import { Store } from './standard/base';
import { StorageState } from './standard/StorageState';
import { makeAutoObservable, observable, action } from 'mobx';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'usehooks-ts';
import { BlinkoStore } from './blinkoStore';
import { RootStore } from '.';

export class BaseStore implements Store {
  sid = 'BaseStore';
  constructor() {
    makeAutoObservable(this)
  }
  routerList = [
    {
      title: "blinko",
      href: '/',
      shallow: true,
      icon: 'basil:lightning-outline'
    },
    {
      title: "notes",
      href: '/notes',
      shallow: true,
      icon: 'hugeicons:note'
    },
    {
      title: "resources",
      href: '/resources',
      icon: 'solar:database-linear'
    },
    {
      title: "archived",
      href: '/archived',
      shallow: true,
      icon: 'solar:box-broken'
    },
    {
      title: "trash",
      href: '/trash',
      hiddenMobile: true,
      icon: 'formkit:trash'
    },
    {
      title: "settings",
      href: '/settings',
      icon: 'lsicon:setting-outline'
    }
  ];
  currentRouter = this.routerList[0]
  currentTitle = ''
  documentHeight = 0

  locale = new StorageState({ key: 'language', default: 'en' });
  locales = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'zh-tw', label: '繁體中文' },
    { value: 'vi', label: 'Tiếng Việt' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'de', label: 'Deutsch' },
    { value: 'es', label: 'Español' },
    { value: 'fr', label: 'Français' },
    { value: 'pt', label: 'Português' },
    { value: 'ru', label: 'Русский' },
    { value: 'ko', label: '한국어' },
    { value: 'ja', label: '日本語' },
  ];

  changeLanugage(i18n, locale) {
    i18n.changeLanguage(locale)
    dayjs.locale(i18n.resolvedLanguage);
    this.locale.save(locale)
  }

  useInitApp(router) {
    const isPc = useMediaQuery('(min-width: 768px)')
    const documentHeight = () => {
      const doc = document.documentElement
      this.documentHeight = window.innerHeight
      doc.style.setProperty('--doc-height', `${window.innerHeight}px`)
    }


    const { t, i18n } = useTranslation()
    useEffect(() => {
      documentHeight()
      window.addEventListener('resize', documentHeight)
    }, [router.isReady])

    useEffect(() => {
      if (router.pathname == '/review') {
        this.currentTitle = 'daily-review'
      } else if (router.pathname == '/detail') {
        this.currentTitle = 'detail'
      } else if (router.pathname == '/all') {
        this.currentTitle = t('total')
      } else {
        this.currentTitle = this.currentRouter?.title ?? ''
      }
      if (this.currentRouter?.href != router.pathname) {
        this.currentRouter = this.routerList.find(item => item.href == router.pathname)
      }
    }, [this.currentRouter, router.pathname])
  }

  isSidebarCollapsed: boolean = false;
  sideBarWidth = 288

  toggleSidebar = () => {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    this.sideBarWidth = this.isSidebarCollapsed ? 80 : 288
  }
  collapseSidebar = () => {
    this.isSidebarCollapsed = false;
    this.sideBarWidth = 288
  }
}
