import { lazy, type ReactNode } from 'react';
const BasicSetting = lazy(() => import('@/components/BlinkoSettings/BasicSetting').then(module => ({ default: module.BasicSetting })));
const AiSetting = lazy(() => import('@/components/BlinkoSettings/AiSetting/AiSetting'));
const PerferSetting = lazy(() => import('@/components/BlinkoSettings/PerferSetting').then(module => ({ default: module.PerferSetting })));
const TaskSetting = lazy(() => import('@/components/BlinkoSettings/TaskSetting').then(module => ({ default: module.TaskSetting })));
const ImportSetting = lazy(() => import('@/components/BlinkoSettings/ImportSetting').then(module => ({ default: module.ImportSetting })));
const UserSetting = lazy(() => import('@/components/BlinkoSettings/UserSetting').then(module => ({ default: module.UserSetting })));
const AboutSetting = lazy(() => import('@/components/BlinkoSettings/AboutSetting').then(module => ({ default: module.AboutSetting })));
const StorageSetting = lazy(() => import('@/components/BlinkoSettings/StorageSetting').then(module => ({ default: module.StorageSetting })));
const ExportSetting = lazy(() => import('@/components/BlinkoSettings/ExportSetting').then(module => ({ default: module.ExportSetting })));
const MusicSetting = lazy(() => import('@/components/BlinkoSettings/MusicSetting').then(module => ({ default: module.MusicSetting })));
const SSOSetting = lazy(() => import('@/components/BlinkoSettings/SSOSetting').then(module => ({ default: module.SSOSetting })));
const HttpProxySetting = lazy(() => import('@/components/BlinkoSettings/HttpProxySetting').then(module => ({ default: module.HttpProxySetting })));
const PluginSetting = lazy(() => import('@/components/BlinkoSettings/PluginSetting').then(module => ({ default: module.PluginSetting })));
const HotkeySetting = lazy(() => import('@/components/BlinkoSettings/HotkeySetting').then(module => ({ default: module.HotkeySetting })));

/**
 * Registry of every settings section.
 *
 * Lives in its own module (not in pages/settings) so that the settings overlay
 * can read it without pulling in the route page — otherwise Sidebar → Settings
 * → pages/settings → BlinkoSettings/* → Layout → Sidebar forms a cycle and the
 * overlay never mounts.
 */
export type SettingItem = {
  key: string;
  title: string;
  icon: string;
  component: ReactNode;
  group: string;
  description: string;
  requireAdmin: boolean;
  keywords?: string[];
};
export const allSettings: SettingItem[] = [
  {
    key: 'basic',
    title: 'settings-account',
    group: 'common',
    description: 'settings-account-desc',
    icon: 'tabler:user-circle',
    component: <BasicSetting />,
    requireAdmin: false,
    keywords: ['basic', 'information', '基本信息', '基础设置'],
  },
  {
    key: 'prefer',
    title: 'settings-appearance',
    group: 'common',
    description: 'settings-prefer-desc',
    icon: 'tabler:settings-2',
    component: <PerferSetting />,
    requireAdmin: false,
    keywords: ['preference', 'theme', 'language', '偏好设置', '主题', '语言'],
  },
  { key: 'prefer-typography', title: 'global-typography', group: 'common', description: 'settings-typography-desc', icon: 'tabler:typography', component: <PerferSetting section="typography" />, requireAdmin: false, keywords: ['font', '字体', '字号', '标题', '行距', '段落'] },
  { key: 'prefer-reading', title: 'settings-reading', group: 'common', description: 'settings-reading-desc', icon: 'tabler:layout-list', component: <PerferSetting section="reading" />, requireAdmin: false, keywords: ['list', '列表', '卡片', '阅读', '折叠', '分页', '时间格式', '导航'] },
  { key: 'site', title: 'settings-site', group: 'common', description: 'settings-site-desc', icon: 'tabler:world', component: <PerferSetting section="advanced" />, requireAdmin: true, keywords: ['站点', '名字', '名称', 'icon', 'logo', '图标', '登录页', '页脚', '背景', '标题'] },
  {
    key: 'hotkey',
    title: 'hotkeys',
    group: 'personal',
    description: 'settings-hotkey-desc',
    icon: 'material-symbols:keyboard',
    component: <HotkeySetting />,
    requireAdmin: false,
    keywords: ['hotkey', 'shortcut', 'keyboard', 'desktop', '快捷键', '热键', '桌面'],
  },
  {
    key: 'user',
    title: 'user-list',
    group: 'system',
    description: 'settings-user-desc',
    icon: 'tabler:users',
    component: <UserSetting />,
    requireAdmin: true,
    keywords: ['user', 'users', '用户', '用户列表'],
  },
  {
    key: 'ai',
    title: 'settings-ai-models',
    group: 'common',
    description: 'settings-ai-models-desc',
    icon: 'hugeicons:ai-beautify',
    component: <AiSetting />,
    requireAdmin: true,
    keywords: ['ai', 'model', 'provider', 'token', 'API', '模型', '服务商', '密钥', 'minimax', 'openai'],
  },
  { key: 'ai-knowledge', title: 'settings-ai-knowledge', group: 'ai', description: 'settings-ai-knowledge-desc', icon: 'tabler:book-2', component: <AiSetting section="knowledge" />, requireAdmin: true, keywords: ['embedding', 'rerank', '向量', '知识库', '检索'] },
  { key: 'ai-behavior', title: 'settings-ai-behavior', group: 'ai', description: 'settings-ai-behavior-desc', icon: 'tabler:adjustments', component: <AiSetting section="behavior" />, requireAdmin: true, keywords: ['prompt', '提示词', '自动标签', '后处理'] },
  { key: 'ai-tools', title: 'settings-ai-tools', group: 'ai', description: 'settings-ai-tools-desc', icon: 'tabler:plug-connected', component: <AiSetting section="tools" />, requireAdmin: true, keywords: ['MCP', 'tools', '搜索', '工具', '连接', '联网'] },
  {
    key: 'httpproxy',
    title: 'http-proxy',
    group: 'system',
    description: 'settings-proxy-desc',
    icon: 'tabler:cloud-network',
    component: <HttpProxySetting />,
    requireAdmin: true,
    keywords: ['proxy', 'http', 'connection', '代理', 'HTTP代理'],
  },
  {
    key: 'task',
    title: 'schedule-task',
    group: 'system',
    description: 'settings-task-desc',
    icon: 'tabler:list-check',
    component: <TaskSetting />,
    requireAdmin: true,
    keywords: ['task', 'schedule', '任务', '定时任务'],
  },
  {
    key: 'storage',
    title: 'storage',
    group: 'data',
    description: 'settings-storage-desc',
    icon: 'tabler:database',
    component: <StorageSetting />,
    requireAdmin: true,
    keywords: ['storage', 'database', '存储', '数据库'],
  },
  {
    key: 'music',
    title: 'music-settings',
    group: 'extensions',
    description: 'settings-music-desc',
    icon: 'tabler:music',
    component: <MusicSetting />,
    requireAdmin: true,
    keywords: ['music', '音乐设置'],
  },
  {
    key: 'import',
    title: 'import',
    group: 'data',
    description: 'settings-import-desc',
    icon: 'tabler:file-import',
    component: <ImportSetting />,
    requireAdmin: true,
    keywords: ['import', 'data', '导入', '数据导入'],
  },
  {
    key: 'sso',
    title: 'sso-settings',
    group: 'system',
    description: 'settings-sso-desc',
    icon: 'tabler:key',
    component: <SSOSetting />,
    requireAdmin: true,
    keywords: ['sso', 'single sign on', '单点登录'],
  },
  {
    key: 'export',
    title: 'export',
    group: 'data',
    description: 'settings-export-desc',
    icon: 'tabler:file-export',
    component: <ExportSetting />,
    requireAdmin: false,
    keywords: ['export', 'data', '导出', '数据导出'],
  },
  {
    key: 'plugin',
    title: 'plugin-settings',
    group: 'extensions',
    description: 'settings-plugin-desc',
    icon: 'hugeicons:plug-socket',
    component: <PluginSetting />,
    requireAdmin: true,
    keywords: ['plugin', 'plugins', '插件', '插件设置'],
  },
  {
    key: 'about',
    title: 'settings-about-site',
    group: 'about',
    description: 'settings-about-desc',
    icon: 'tabler:info-circle',
    component: <AboutSetting />,
    requireAdmin: false,
    keywords: ['about', 'information', '关于', '信息'],
  },
];

export const settingGroups = ['common', 'ai', 'personal', 'data', 'extensions', 'system', 'about'] as const;
const settingOrder = ['ai', 'site', 'prefer-reading', 'prefer', 'prefer-typography', 'basic', 'ai-behavior', 'ai-knowledge', 'ai-tools', 'hotkey', 'export', 'import', 'storage', 'plugin', 'music', 'task', 'user', 'sso', 'httpproxy', 'about'];
allSettings.sort((a,b) => settingOrder.indexOf(a.key) - settingOrder.indexOf(b.key));
