import { mergeProfileIdentity } from '@/lib/profileIdentity';
import { syncHeroAccent } from '@/lib/themeAccent';
// import { User } from 'next-auth';
// import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { RootStore } from './root';
import { Store } from './standard/base';
import { eventBus } from '@/lib/event';
import { makeAutoObservable } from 'mobx';
import { PromiseState } from './standard/PromiseState';
import { api } from '@/lib/trpc';
import { BlinkoStore } from './blinkoStore';
import { BaseStore } from './baseStore';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { useNavigate, useLocation } from 'react-router-dom';
import { signIn, TokenData, navigate } from '@/components/Auth/auth-client';
import { DialogStore } from './module/Dialog';
import { ShowTwoFactorModal } from '@/components/Common/TwoFactorModal';
import { ToastPlugin } from './module/Toast/Toast';
import { StorageState } from './standard/StorageState';
import { getBlinkoEndpoint } from '@/lib/blinkoEndpoint';
import { isInTauri, setTauriTheme } from '@/lib/tauriHelper';
import { FontManager } from '@/lib/fontManager';

export class UserStore implements Store {
  sid = 'user';
  constructor() {
    makeAutoObservable(this)
  }
  tokenData = new StorageState<TokenData | null>({ key: 'blinkoToken', value: null });
  theme: any = 'light';
  isSetup: boolean = false;
  languageInitialized: boolean = false;
  themeInitialized: boolean = false;
  isHubInitialized: boolean = false;
  isUseAIInitialized: boolean = false;

  get id(): string {
    return this.tokenData.value?.user?.id || '';
  }

  get name(): string {
    return (String(this.userInfo.value?.id) === String(this.id) ? this.userInfo.value?.name : null) ?? this.tokenData.value?.user?.name ?? '';
  }

  get nickname(): string {
    return (String(this.userInfo.value?.id) === String(this.id) ? this.userInfo.value?.nickName : null) ?? this.tokenData.value?.user?.nickname ?? '';
  }

  get image(): string {
    return (String(this.userInfo.value?.id) === String(this.id) ? this.userInfo.value?.image : null) ?? this.tokenData.value?.user?.image ?? '';
  }

  get role(): string {
    return this.tokenData.value?.user?.role || '';
  }

  get token(): string | null {
    return this.tokenData.value?.token || null;
  }

  get requiresTwoFactor(): boolean {
    return !!this.tokenData.value?.requiresTwoFactor;
  }

  wait() {
    return new Promise<UserStore>((res) => {
      if (this.id) {
        res(this);
      } else {
        //@ts-ignore
        this.event.once('user:ready', () => res(this));
      }
    });
  }

  get isSuperAdmin() {
    return this.role === 'superadmin';
  }

  static wait() {
    return RootStore.Get(UserStore).wait();
  }

  get isLogin() {
    return !!this.token;
  }

  get blinko() {
    return RootStore.Get(BlinkoStore);
  }

  userInfo = new PromiseState({
    function: async (id: number) => {
      const profile = await api.users.detail.query({ id });
      if(profile && String(id) === String(this.id)) this.tokenData.save(mergeProfileIdentity(this.tokenData.value, profile));
      return profile;
    }
  });

  async refreshProfile() {
    const id = Number(this.id);
    if(!id) return;
    const profile = await api.users.detail.query({ id });
    if(!profile || String(id) !== String(this.id)) return;
    this.userInfo.setValue(profile);
    this.tokenData.save(mergeProfileIdentity(this.tokenData.value, profile));
    return profile;
  }

  canRegister = new PromiseState({
    function: async () => {
      if (isInTauri() && getBlinkoEndpoint() == '') {
        return
      }
      return await api.users.canRegister.mutate();
    }
  });

  handleTwoFactorAuth = async (twoFactorCode: string, userId: string) => {
    try {
      if (!userId) {
        console.log('Missing user ID for 2FA verification');
        eventBus.emit('user:twoFactorResult', {
          success: false,
          error: 'Missing user ID'
        });
        return false;
      }

      console.log('Verifying 2FA with userId:', userId, 'Full tokenData:', JSON.stringify(this.tokenData.value));

      const res = await signIn('oauth-2fa', {
        userId,
        twoFactorCode,
        callbackUrl: '/',
        redirect: false,
      });

      if (res?.ok) {
        eventBus.emit('user:twoFactorResult', { success: true });
        return true;
      }

      console.error('2FA verification failed:', res?.error);
      eventBus.emit('user:twoFactorResult', {
        success: false,
        error: res?.error || 'Invalid verification code'
      });
      return false;
    } catch (error) {
      console.error('Failed to handle 2FA:', error);
      return false;
    }
  };

  setData(args: Partial<UserStore>) {
    Object.assign(this, args);
    eventBus.emit('user:ready', this);
  }

  ready(userData: any) {
    if (userData.token) {
      const tokenData: TokenData = {
        user: {
          id: userData.id,
          name: userData.name,
          nickname: userData.nickname,
          image: userData.image,
          role: userData.role
        },
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        requiresTwoFactor: userData.requiresTwoFactor,
        token: userData.token
      };
      this.tokenData.save(tokenData);
    }
    this.isSetup = true;
    eventBus.emit('user:ready', this);
  }


  async initializeFonts(savedFontStyle: string) {
    try {
      if (api.fonts) {
        const fonts = await api.fonts.list.query();
        FontManager.initializeRegistry(fonts);
      }
      // 首屏恢复路径已经在 main.tsx 里用缓存跑过一次了，这里走 'optional'
      // 保证慢加载时也不会在用户眼前跳字体
      await FontManager.applyFont(savedFontStyle, 'optional');
    } catch (error) {
      console.error('Failed to initialize fonts:', error);
      // 回落到系统字体栈，而不是把裸字体名塞给 body ——
      // 裸名字没有 fallback 栈，浏览器解析不到时会静默用不可控的默认值
      await FontManager.applyFont('default').catch(() => {
        if (document.body) document.body.style.fontFamily = '';
      });
    }
  }

  clear() {
    this.tokenData.save(null);
    this.isSetup = false;
    localStorage.removeItem('token');
    eventBus.emit('user:clear', this);
  }

  updatePWAColor(theme: string) {
    const themeColor = theme === 'dark' ? '#1C1C1E' : '#F8F8F8';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', themeColor);
  }

  updateAppTitle(customTitle?: string) {
    const appTitle = customTitle?.trim() || 'Blinko';
    document.title = appTitle;
    document.querySelector('meta[name="application-name"]')?.setAttribute('content', appTitle);
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', appTitle);
  }

  updateAppIcon(icon?: string) {
    const href = icon || '/favicon.ico';
    for (const relation of ['icon', 'shortcut icon', 'apple-touch-icon']) {
      let link = document.querySelector<HTMLLinkElement>(`link[rel="${relation}"]`);
      if (!link) { link = document.createElement('link'); link.rel = relation; document.head.appendChild(link); }
      link.href = href;
      if (icon) link.type = 'image/png'; else link.removeAttribute('type');
    }
  }

  async initializeSettings(setTheme: (theme: string) => void, i18n: any) {
    const base = RootStore.Get(BaseStore);
    const config = await this.blinko.config.call()
    this.updateAppTitle(config?.customTitle);
    this.updateAppIcon(config?.customIcon);
    const handleFeatureRoute = (
      featureKey: 'hub' | 'ai',
      storageKey: string,
      routeConfig: {
        title: string;
        href: string;
        icon: string;
      } & any,
      stateFlag: 'isHubInitialized' | 'isUseAIInitialized'
    ) => {
      const savedValue = localStorage.getItem(storageKey);
      const configKey = featureKey === 'ai' ? 'mainModelId' : `isUseBlinkoHub`;
      const configValue = config?.[configKey];
      const currentValue = configValue ?? (savedValue === 'true');

      if (configValue !== undefined && savedValue !== String(configValue)) {
        localStorage.setItem(storageKey, String(configValue));
      }

      const routeIndex = base.routerList.findIndex(route => route.href === routeConfig.href);

      if (currentValue) {
        if (!this[stateFlag]) {
          if (routeIndex === -1) {
            base.routerList.splice(3, 0, routeConfig);
          }
          this[stateFlag] = true;
        }
      } else {
        if (this[stateFlag]) {
          if (routeIndex !== -1) {
            base.routerList.splice(routeIndex, 1);
          }
          this[stateFlag] = false;
        }
      }
    };

    handleFeatureRoute('ai', 'useAI', {
      title: "AI",
      href: '/ai',
      icon: 'hugeicons:ai-beautify'
    }, 'isUseAIInitialized');

    handleFeatureRoute('hub', 'hubEnabled', {
      title: "hub",
      href: '/hub',
      icon: 'hugeicons:pacman-02'
    }, 'isHubInitialized');

    const savedLanguage = localStorage.getItem('userLanguage');
    const savedTheme = localStorage.getItem('userTheme');

    if (savedLanguage && !this.languageInitialized) {
      RootStore.Get(BaseStore).changeLanugage(i18n, savedLanguage);
      this.languageInitialized = true;
    }

    if (savedTheme && !this.themeInitialized) {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      const themeToSet = savedTheme === 'system' ? systemTheme : savedTheme;
      setTheme(savedTheme);
      this.updatePWAColor(themeToSet);
      setTauriTheme(themeToSet).catch(console.error);
      this.themeInitialized = true;
    }


    const darkElement = document.querySelector('.dark')
    const lightElement = document.querySelector('.light')

    if (config?.themeColor && config?.themeForegroundColor) {
      if (darkElement) {
        //@ts-ignore
        darkElement.style.setProperty('--primary', config.themeColor)
        //@ts-ignore
        darkElement.style.setProperty('--primary-foreground', config.themeForegroundColor)
        // Tag chips follow the custom theme colour instead of the default purple
        //@ts-ignore
        darkElement.style.setProperty('--tag', config.themeColor)
      }
      if (lightElement) {
        //@ts-ignore
        lightElement.style.setProperty('--primary', config.themeColor)
        //@ts-ignore
        lightElement.style.setProperty('--primary-foreground', config.themeForegroundColor)
        //@ts-ignore
        lightElement.style.setProperty('--tag', config.themeColor)
      }
    } else {
      // No custom theme colour configured — fall back to the brand blue defined
      // in globals.css. These inline writes are what actually win over the
      // stylesheet, so they must stay in sync with it.
      if (darkElement) {
        //@ts-ignore
        darkElement.style.setProperty('--primary', '#4d8bff')
        //@ts-ignore
        darkElement.style.setProperty('--primary-foreground', '#000000')
        //@ts-ignore
        darkElement.style.removeProperty('--tag')
      }
      if (lightElement) {
        //@ts-ignore
        lightElement.style.setProperty('--primary', '#2f6feb')
        //@ts-ignore
        lightElement.style.setProperty('--primary-foreground', 'hsl(210 40% 98%)')
        //@ts-ignore
        lightElement.style.removeProperty('--tag')
      }
    }

    for (const element of document.querySelectorAll<HTMLElement>('.dark,.light')) syncHeroAccent(element);

    // Apply saved font using FontManager
    if (config?.fontStyle) {
      // Initialize FontManager with fonts from database and apply saved font
      this.initializeFonts(config.fontStyle);
    }

    // Apply global typography (font size / weight / line-height / paragraph spacing /
    // line width / first-line indent / heading scales / table size).
    // 写入 .dark / .light 根节点，让正文 (`.markdown-body`) 和编辑器 (`.tiptap`)
    // 通过 `var(--app-*)` 一起消费 —— 单一信源覆盖三种内容类型（闪念/笔记/待办）。
    {
      const fontSize = Number(config?.fontSize) >= 12 && Number(config?.fontSize) <= 20 ? Number(config.fontSize) : 16;
      const fontWeight = Number(config?.fontWeight) >= 300 && Number(config?.fontWeight) <= 700 ? Number(config.fontWeight) : 400;
      const lineHeight = Number(config?.lineHeight) >= 1 && Number(config?.lineHeight) <= 2.5 ? Number(config.lineHeight) : 1.6;
      const paragraphSpacing = Number(config?.paragraphSpacing) >= 0 && Number(config?.paragraphSpacing) <= 30 ? Number(config.paragraphSpacing) : 8;
      const lineWidthChars = Number(config?.lineWidthChars) >= 30 && Number(config?.lineWidthChars) <= 120 ? Number(config.lineWidthChars) : 60;
      const firstLineIndentChars = Number(config?.firstLineIndentChars) >= 0 && Number(config?.firstLineIndentChars) <= 4 ? Number(config.firstLineIndentChars) : 0;
      const h1Size = Number(config?.h1Size) >= 18 && Number(config?.h1Size) <= 40 ? Number(config.h1Size) : 26;
      const h2Size = Number(config?.h2Size) >= 16 && Number(config?.h2Size) <= 36 ? Number(config.h2Size) : 22;
      const h3Size = Number(config?.h3Size) >= 14 && Number(config?.h3Size) <= 32 ? Number(config.h3Size) : 20;
      const tableSize = Number(config?.tableSize) >= 12 && Number(config?.tableSize) <= 20 ? Number(config.tableSize) : fontSize;
      const typographyTargets = [...document.querySelectorAll('.dark, .light')] as HTMLElement[];
      for (const el of typographyTargets) {
        el.style.setProperty('--app-font-size', `${fontSize}px`);
        el.style.setProperty('--app-font-weight', String(fontWeight));
        el.style.setProperty('--app-line-height', String(lineHeight));
        el.style.setProperty('--app-paragraph-spacing', `${paragraphSpacing}px`);
        el.style.setProperty('--app-line-width', `${lineWidthChars}ch`);
        el.style.setProperty('--app-first-line-indent', `${firstLineIndentChars}em`);
        el.style.setProperty('--app-h1-size', `${h1Size}px`);
        el.style.setProperty('--app-h2-size', `${h2Size}px`);
        el.style.setProperty('--app-h3-size', `${h3Size}px`);
        el.style.setProperty('--app-table-size', `${tableSize}px`);
      }
    }

    if (this.isLogin) {
      try {
        if (config) {
          if (config.language && config.language !== savedLanguage) {
            localStorage.setItem('userLanguage', config.language);
            RootStore.Get(BaseStore).changeLanugage(i18n, config.language);
          }

          if (config.theme && config.theme !== savedTheme) {
            localStorage.setItem('userTheme', config.theme);
            const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            const newTheme = config.theme === 'system' ? systemTheme : config.theme;
            setTheme(config.theme);
            this.updatePWAColor(newTheme);
            setTauriTheme(newTheme).catch(console.error);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user config:', error);
      }
    }
  }

  handleToken(tokenData: TokenData | null, successCallback?: () => void) {
    const location = window.location;
    console.log('handleToken', tokenData);

    if (tokenData && (tokenData.user || tokenData.token)) {
      if (tokenData.token && (!tokenData.user || !tokenData.user.id)) {
        this.tokenData.save({
          ...tokenData,
          user: tokenData.user || { id: '' }
        });
      } else {
        this.tokenData.save(tokenData);
      }

      this.isSetup = true;

      if (tokenData.requiresTwoFactor) {
        const userId = tokenData.user?.id || '';
        this.showTwoFactorDialog(userId);
      }
      else if (location.pathname === '/signin' || location.pathname === '/signup') {
        navigate('/');
      }

      if (successCallback) {
        successCallback();
      }
    } else {
      console.log('clearing user token');
      this.clear();

      const pathname = location.pathname;
      const isInitialLoad = !this.isSetup;

      if (pathname !== '/signin' &&
        pathname !== '/signup' &&
        !pathname.includes('/share') &&
        !pathname.includes('/ai-share') &&
        !pathname.includes('/oauth-callback') &&
        !isInitialLoad) {
        navigate('/signin');
      }
    }
  }

  showTwoFactorDialog(userId: string) {
    if (this.requiresTwoFactor) {
      console.log('Showing 2FA modal due to requiresTwoFactor flag');

      ShowTwoFactorModal(async (code) => {
        try {
          await this.handleTwoFactorAuth(code, userId);
        } catch (error) {
          RootStore.Get(ToastPlugin).error('verification-failed');
        }
      }, false);
    }
  }

  use() {
    const { i18n } = useTranslation()
    const { setTheme, resolvedTheme } = useTheme()
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
      this.initializeSettings(setTheme, i18n);
    }, []);

    useEffect(() => {
      this.updateAppTitle(this.blinko.config.value?.customTitle);
    }, [this.blinko.config.value?.customTitle]);
    useEffect(() => { this.updateAppIcon(this.blinko.config.value?.customIcon); }, [this.blinko.config.value?.customIcon]);

    useEffect(() => {
      if (!resolvedTheme) return;
      const config = this.blinko.config.value;
      for (const element of document.querySelectorAll<HTMLElement>('.dark,.light')) {
        const dark = resolvedTheme === 'dark';
        element.style.setProperty('--primary',config?.themeColor || (dark?'#4d8bff':'#2f6feb'));
        element.style.setProperty('--primary-foreground',config?.themeForegroundColor || (dark?'#000000':'#ffffff'));
        if (config?.themeColor) element.style.setProperty('--tag',config.themeColor); else element.style.removeProperty('--tag');
        syncHeroAccent(element);
      }
      this.updatePWAColor(resolvedTheme);
      setTauriTheme(resolvedTheme).catch(console.error);
    }, [resolvedTheme, this.blinko.config.value?.themeColor, this.blinko.config.value?.themeForegroundColor]);

    useEffect(() => {
      eventBus.on('user:token', (tokenData) => {
        this.handleToken(tokenData, () => {
          this.initializeSettings(setTheme, i18n);
          if (tokenData?.user?.id) {
            this.userInfo.call(Number(tokenData.user.id));
          }
        });
      });

      eventBus.on('user:showTwoFactor', (data) => {
        if (data && data.userId) {
          const userId = typeof data.userId === 'number' ? String(data.userId) : data.userId;
          this.tokenData.save({
            ...this.tokenData.value,
            requiresTwoFactor: true,
            user: {
              ...(this.tokenData.value?.user || {}),
              id: userId
            }
          });

          setTimeout(() => {
            this.showTwoFactorDialog(data.userId);
          }, 0);
        } else {
          console.error('Missing userId in showTwoFactor event:', data);
        }
      });

      eventBus.on('user:twoFactorResult', (result) => {
        if (result.success) {
          RootStore.Get(DialogStore).close();
          if (!this.requiresTwoFactor) {
            navigate('/');
          }
        } else {
          RootStore.Get(ToastPlugin).error('verification-failed');
        }
      });

      return () => {
        eventBus.off('user:token', this.handleToken);
        eventBus.off('user:showTwoFactor', () => { });
        eventBus.off('user:twoFactorResult', () => { });
      };
    }, []);

    useEffect(() => {
      this.userInfo.call(Number(this.id));
    }, [this.id]);

    useEffect(() => {
      const handleSignout = () => {
        const pathname = location.pathname;
        if (pathname === '/signup' || pathname.includes('/share') || pathname.includes('/ai-share') || pathname.includes('/oauth-callback')) {
          return
        }
        this.clear()
        navigate('/signin')
      }

      eventBus.on('user:signout', handleSignout)

      return () => {
        eventBus.off('user:signout', handleSignout)
      }
    }, []);
  }
}
