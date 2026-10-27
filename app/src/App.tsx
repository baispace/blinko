import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ThemeProvider } from 'next-themes';
import { Inspector, InspectParams } from 'react-dev-inspector';
import { HeroUIProvider } from '@heroui/react';
import './styles/github-markdown.css';
import 'react-photo-view/dist/react-photo-view.css';
import '@/lib/i18n';
import { initStore } from '@/store/init';
import { CommonLayout } from '@/components/Layout';
import { AppProvider } from '@/store/module/AppProvider';
import { BlinkoMultiSelectPop } from '@/components/BlinkoMultiSelectPop';
import { BlinkoMusicPlayer } from '@/components/BlinkoMusicPlayer';
import { LoadingPage } from '@/components/Common/LoadingPage';
import { PluginManagerStore } from '@/store/plugin/pluginManagerStore';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { getTokenData, setNavigate } from '@/components/Auth/auth-client';
import { BlinkoStore } from '@/store/blinkoStore';
import { useAndroidShortcuts } from '@/lib/hooks';
import { useQuickaiHotkey } from '@/hooks/useQuickaiHotkey';
import { useInitialHotkeySetup } from '@/hooks/useInitialHotkeySetup';
import { isInTauri, isDesktop } from "@/lib/tauriHelper";
import { isPublicRoute } from '@/lib/publicRoutes';
import { listen } from "@tauri-apps/api/event";
import QuickNotePage from "./pages/quicknote";
import QuickAIPage from "./pages/quickai";
import QuickToolPage from "./pages/quicktool";
import { useQuicknoteHotkey } from "./hooks/useQuicknoteHotkey";

const HomePage = lazy(() => import('./pages/index'));
const SignInPage = lazy(() => import('./pages/signin'));
const SignUpPage = lazy(() => import('./pages/signup'));
const HubPage = lazy(() => import('./pages/hub'));
const AiTasksPage = lazy(() => import('./pages/ai-tasks'));
const AIPage = lazy(() => import('./pages/ai'));
const ResourcesPage = lazy(() => import('./pages/resources'));
const BlogManagePage = lazy(() => import('./pages/blog-manage'));
const BlogArticleDetail = lazy(() => import('./pages/blog-article'));
const BlogTopicArrange = lazy(() => import('./pages/blog-topic'));
const BlogTopicDetail = lazy(() => import('./pages/blog-topic-detail'));
const ReviewPage = lazy(() => import('./pages/review'));
const SettingsPage = lazy(() => import('./pages/settings'));
const PluginPage = lazy(() => import('./pages/plugin'));
const AnalyticsPage = lazy(() => import('./pages/analytics'));
const AllPage = lazy(() => import('./pages/all'));
const OAuthCallbackPage = lazy(() => import('./pages/oauth-callback'));
const DesktopNotePage = lazy(() => import('./pages/desktop-note'));
const DetailPage = lazy(() => import('./pages/detail'));
const ShareIndexPage = lazy(() => import('./pages/share'));
const BlogShell = lazy(() => import('./components/BlinkoBlog/public/BlogShell').then(m => ({ default: m.BlogShell })));
const BlogHomePage = lazy(() => import('./pages/blog/index'));
const BlogTopicsPage = lazy(() => import('./pages/blog/topics'));
const BlogTopicPage = lazy(() => import('./pages/blog/t/[slug]'));
const BlogAboutPage = lazy(() => import('./pages/blog/about'));
const BlogMomentsPage = lazy(() => import('./pages/blog/moments'));
const BlogSubscribePage = lazy(() => import('./pages/blog/subscribe'));
const BlogStatsPage = lazy(() => import('./pages/blog/stats'));
const PublishedNotePage = lazy(() => import('./pages/blog/[id]'));
const ShareDetailPage = lazy(() => import('./pages/share/[id]'));
const AiSharePage = lazy(() => import('./pages/ai-share'));
const MindmapPocPage = lazy(() => import('./pages/mindmapPoc'));

const HomeRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const blinko = RootStore.Get(BlinkoStore);
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(() => location.key === 'default' && !searchParams.get('path'));
  const [bootError, setBootError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const redirectToDefaultPage = async () => {
      setBootError(null);
      // In-app mode switches already know their destination. Do not flash a
      // loading screen or refetch configuration before returning to content.
      if (location.key !== 'default' || searchParams.get('path')) {
        setLoading(false);
        return;
      }
      if (!blinko.config.value) {
        try {
          // A hung request must not leave the brand animation running
          // forever — after the timeout the page switches to error + retry.
          let timer: number | undefined;
          await Promise.race([
            blinko.config.call(),
            new Promise((_, reject) => {
              timer = window.setTimeout(() => reject(new Error('config-timeout')), 15000);
            }),
          ]).finally(() => window.clearTimeout(timer));
        } catch (error) {
          if (!cancelled) setBootError('配置加载失败，请检查服务连接后重试');
          return;
        }
      }
      if (cancelled) return;
      const defaultHomePage = blinko.config.value?.defaultHomePage;
      const currentPath = searchParams.get('path');
      const isDirectNavigation = location.key === 'default';
      if (currentPath || !defaultHomePage || defaultHomePage === 'blinko' || !isDirectNavigation) {
        setLoading(false);
        return;
      }

      navigate(`/?path=${defaultHomePage}`, { replace: true });
    };

    void redirectToDefaultPage();
    return () => { cancelled = true; };
  }, [navigate, searchParams, location, retryKey]);

  if (loading) {
    return (
      <LoadingPage
        state={bootError ? 'error' : 'loading'}
        errorMessage={bootError ?? undefined}
        onRetry={bootError ? () => { setBootError(null); setLoading(true); setRetryKey((key) => key + 1); } : undefined}
      />
    );
  }

  return <HomePage />;
};

const ProtectedRoute = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const userStore = RootStore.Get(UserStore);

  useEffect(() => {
    setNavigate(navigate);
  }, [navigate]);

  useEffect(() => {
    const checkAuth = async () => {
      if (!userStore.isLogin && !isPublicRoute(location.pathname)) {
        const tokenData = await getTokenData();
        console.log('tokenData', tokenData);

        if (!tokenData?.user?.id) {
          console.log('No valid token, redirecting to login page');
          navigate('/signin', { replace: true });
        }
      }

      setIsChecking(false);
    };

    checkAuth();
  }, [userStore.isLogin]);

  if (isChecking) {
    return <LoadingPage />;
  }

  return children;
};

// Detect current window type
const getWindowType = () => {
  if (!isInTauri()) return 'main';
  // Keep the floating window's route tree stable during sign-in redirects.
  if (getCurrentWebviewWindow().label.startsWith('pinned-note-')) return 'desktop-note';

  // Check URL path to determine window type
  const path = window.location.pathname;
  if (path.startsWith('/quicktool')) return 'quicktool';
  if (path.startsWith('/desktop-note')) return 'desktop-note';
  if (path.startsWith('/quicknote')) return 'quicknote';
  if (path.startsWith('/quickai')) return 'quickai';
  return 'main';
};

function AppRoutes() {
  const navigate = useNavigate();
  const windowType = getWindowType();
  useEffect(() => {
    if (windowType !== 'main' || !isInTauri()) return;
    const refresh = (event: StorageEvent) => {
      if (event.key === 'ink.desktop-note-saved') RootStore.Get(BlinkoStore).forceQuery++;
    };
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, [windowType]);


  // Initialize Quick AI hotkey handler inside Router context (only for main window on desktop)
  if (windowType === 'main' && isDesktop()) {
    useQuickaiHotkey();
    useQuicknoteHotkey(true);
  }

  // Listen for navigation commands from Tauri (only for current window type)
  useEffect(() => {
    if (!isInTauri()) return;

    let isMounted = true;
    let unlistenNavigation: (() => void) | null = null;

    const setupListener = async () => {
      try {
        if (!isMounted) return;

        unlistenNavigation = await listen('navigate-to-route', (event) => {
          const { route, replace = false, targetWindow } = event.payload as {
            route: string;
            replace?: boolean;
            targetWindow?: string;
          };

          // Only handle navigation for current window type or if no target specified
          if (!targetWindow || targetWindow === windowType) {
            console.log(`🔄 [${windowType}] Received navigation command:`, route, 'replace:', replace);

            if (replace) {
              navigate(route, { replace: true });
            } else {
              navigate(route);
            }

            // Emit event to notify components to refresh configuration
            if (windowType === 'quicktool') {
              console.log("🔄 Emitting config refresh event for quicktool");
              // This will be picked up by quicktool component to refresh its config
              window.dispatchEvent(new CustomEvent('quicktool-config-refresh'));
            }
          }
        });
      } catch (error) {
        console.error('Failed to setup navigation listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;

      // Only try to unlisten if we have a valid function
      try {
        if (unlistenNavigation && typeof unlistenNavigation === 'function') {
          unlistenNavigation();
        }
      } catch (error) {
        console.error('Error cleaning up navigation listener:', error);
      }
    };
  }, [navigate, windowType]);

  // Return different routes based on window type
  switch (windowType) {
    case 'quicktool':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quicktool" element={<QuickToolPage />} />
            <Route path="*" element={<Navigate to="/quicktool" replace />} />
          </Routes>
        </Suspense>
      );

    case 'desktop-note':
      return <Suspense fallback={<LoadingPage />}><Routes>
        <Route path="/desktop-note" element={<ProtectedRoute><DesktopNotePage /></ProtectedRoute>} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="*" element={<Navigate to="/desktop-note" replace />} />
      </Routes></Suspense>;

    case 'quicknote':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quicknote" element={<QuickNotePage />} />
            <Route path="*" element={<Navigate to="/quicknote" replace />} />
          </Routes>
        </Suspense>
      );

    case 'quickai':
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/quickai" element={<QuickAIPage />} />
            <Route path="*" element={<Navigate to="/quickai" replace />} />
          </Routes>
        </Suspense>
      );

    default: // main window
      return (
        <Suspense fallback={<LoadingPage />}>
          <Routes>
            <Route path="/" element={<ProtectedRoute><HomeRedirect /></ProtectedRoute>} />
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/hub" element={<ProtectedRoute><HubPage /></ProtectedRoute>} />
            <Route path="/ai/tasks/:taskId?" element={<ProtectedRoute><AiTasksPage /></ProtectedRoute>} />
            <Route path="/ai" element={<ProtectedRoute><AIPage /></ProtectedRoute>} />
            <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
            <Route path="/blog-manage" element={<ProtectedRoute><BlogManagePage /></ProtectedRoute>} />
            {/* 旧发布入口：现在统一走文章工作台。保留跳转，老链接不会失效。 */}
            <Route path="/blog-manage/publish/:noteId" element={<ProtectedRoute><BlogPublishRedirect /></ProtectedRoute>} />
            <Route path="/blog-manage/content/:noteId" element={<ProtectedRoute><BlogArticleDetail /></ProtectedRoute>} />
            <Route path="/blog-manage/content/:noteId/check" element={<ProtectedRoute><BlogPublishRedirect /></ProtectedRoute>} />
            <Route path="/blog-manage/topic/:topicId" element={<ProtectedRoute><BlogTopicDetail /></ProtectedRoute>} />
            <Route path="/blog-manage/topic/:topicId/arrange" element={<ProtectedRoute><BlogTopicArrange /></ProtectedRoute>} />
            <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/plugin" element={<ProtectedRoute><PluginPage /></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
            <Route path="/all" element={<ProtectedRoute><AllPage /></ProtectedRoute>} />
            <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
            <Route path="/detail/*" element={<ProtectedRoute><DetailPage /></ProtectedRoute>} />
            <Route path="/share" element={<ShareIndexPage />} />
            <Route path="/share/:id" element={<ShareDetailPage />} />
            <Route path="/blog" element={<BlogShell />}>
              <Route index element={<BlogHomePage />} />
              <Route path="topics" element={<BlogTopicsPage />} />
              <Route path="t/:slug" element={<BlogTopicPage />} />
              <Route path="about" element={<BlogAboutPage />} />
              <Route path="moments" element={<BlogMomentsPage />} />
              <Route path="subscribe" element={<BlogSubscribePage />} />
              <Route path="stats" element={<BlogStatsPage />} />
              <Route path=":id" element={<PublishedNotePage />} />
              <Route path="*" element={<div className="ink-wrap ink-empty">页面不存在</div>} />
            </Route>
            <Route path="/ai-share/:id" element={<AiSharePage />} />
            <Route path="/quicknote" element={<QuickNotePage />} />
            <Route path="/quickai" element={<QuickAIPage />} />
            <Route path="/quicktool" element={<QuickToolPage />} />
            <Route path="/mindmap-poc" element={<ProtectedRoute><MindmapPocPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      );
  }
}

// Public readers do not mount workspace menus, editors, selection overlays or
// account-setting providers. Guest access stays independent of login state.
function AppExperience() {
  const { pathname } = useLocation();
  const publicBlog = pathname === '/blog' || pathname.startsWith('/blog/');
  // 博客管理是「内容管理的单独页面」：左下角入口点进来后不再套应用外壳，
  // 侧边栏与顶栏都退场，只留管理页本身 —— 免得像后台功能寄居在笔记应用里。
  // AppProvider 仍然要留：tRPC、登录态、Toast、发布对话框都挂在它上面。
  // 「发布文章」向导是管理页的子流程，同样走独立页，不套应用外壳。
  const standaloneManage = pathname.startsWith('/blog-manage');
  useEffect(() => { if (!publicBlog) RootStore.Get(PluginManagerStore).initInstalledPlugins(); }, [publicBlog]);
  if (publicBlog) return <AppRoutes />;
  if (standaloneManage) return <><AppProvider /><div className="app-content"><AppRoutes /></div></>;
  return <><AppProvider /><CommonLayout><div className="app-content"><AppRoutes /><BlinkoMultiSelectPop /></div></CommonLayout><BlinkoMusicPlayer /></>;
}


/**
 * 旧发布入口的跳转。
 *
 * 以前这里挂的是"发布向导"—— 一套三步的独立页面，跟文章工作台、
 * 发布弹窗在做的事高度重合，同一篇文章有三个发布界面。
 * 内容管理收口成「列表 → 工作台 → 发布」之后，这个入口只保留跳转，
 * 老链接（收藏、文档、SEO 审核）点进来还是落到同一篇文章。
 */
function BlogPublishRedirect() {
  const { noteId } = useParams();
  return <Navigate to={`/blog-manage/content/${noteId}?publish=1`} replace />;
}

function App() {
  initStore();

  // Initialize Android shortcuts handler
  useAndroidShortcuts();

  // Initialize hotkey setup for desktop app only
  if (isDesktop()) {
    useInitialHotkeySetup();
  }

  /**
   * 首屏占位退场。
   *
   * index.html 里内联的品牌占位在 React 挂载前一直盖在页面上；等应用真正
   * 接管 DOM 后再撤掉，中间不会有白屏，也不会有"文字先出现、样式后到"的跳变。
   */
  useEffect(() => {
    document.documentElement.classList.add('app-ready');
  }, []);

  return (
    <>
      <Inspector
        keys={['control', 'alt', 'x']}
        onClickElement={({ codeInfo }: InspectParams) => {
          if (!codeInfo?.absolutePath) return
          const { absolutePath, lineNumber, columnNumber } = codeInfo
          window.open(`cursor://file/${absolutePath}:${lineNumber}:${columnNumber}`)
        }}
      />
      <BrowserRouter>
        <HeroUIProvider>
          <ThemeProvider attribute="class" enableSystem>
            <AppExperience />
          </ThemeProvider>
        </HeroUIProvider>
      </BrowserRouter>
    </>
  );
}

export default App;
