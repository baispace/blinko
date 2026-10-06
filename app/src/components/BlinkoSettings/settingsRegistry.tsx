import { JSX } from 'react';
import { BasicSetting } from '@/components/BlinkoSettings/BasicSetting';
import AiSetting from '@/components/BlinkoSettings/AiSetting/AiSetting';
import { PerferSetting } from '@/components/BlinkoSettings/PerferSetting';
import { TaskSetting } from '@/components/BlinkoSettings/TaskSetting';
import { ImportSetting } from '@/components/BlinkoSettings/ImportSetting';
import { UserSetting } from '@/components/BlinkoSettings/UserSetting';
import { AboutSetting } from '@/components/BlinkoSettings/AboutSetting';
import { StorageSetting } from '@/components/BlinkoSettings/StorageSetting';
import { ExportSetting } from '@/components/BlinkoSettings/ExportSetting';
import { MusicSetting } from '@/components/BlinkoSettings/MusicSetting';
import { SSOSetting } from '@/components/BlinkoSettings/SSOSetting';
import { HttpProxySetting } from '@/components/BlinkoSettings/HttpProxySetting';
import { PluginSetting } from '@/components/BlinkoSettings/PluginSetting';
import { HotkeySetting } from '@/components/BlinkoSettings/HotkeySetting';

/**
 * Registry of every settings section.
 *
 * Lives in its own module (not in pages/settings) so that the settings overlay
 * can read it without pulling in the route page — otherwise Sidebar → Settings
 * → pages/settings → BlinkoSettings/* → Layout → Sidebar forms a cycle and the
 * overlay never mounts.
 */
type SettingItem = {
  key: string;
  title: string;
  icon: string;
  component: JSX.Element;
  requireAdmin: boolean;
  keywords?: string[];
};
export const allSettings: SettingItem[] = [
  {
    key: 'basic',
    title: ('basic-information'),
    icon: 'tabler:tool',
    component: <BasicSetting />,
    requireAdmin: false,
    keywords: ['basic', 'information', '基本信息', '基础设置'],
  },
  {
    key: 'prefer',
    title: ('preference'),
    icon: 'tabler:settings-2',
    component: <PerferSetting />,
    requireAdmin: false,
    keywords: ['preference', 'theme', 'language', '偏好设置', '主题', '语言'],
  },
  {
    key: 'hotkey',
    title: ('hotkeys'),
    icon: 'material-symbols:keyboard',
    component: <HotkeySetting />,
    requireAdmin: false,
    keywords: ['hotkey', 'shortcut', 'keyboard', 'desktop', '快捷键', '热键', '桌面'],
  },
  {
    key: 'user',
    title: ('user-list'),
    icon: 'tabler:users',
    component: <UserSetting />,
    requireAdmin: true,
    keywords: ['user', 'users', '用户', '用户列表'],
  },
  {
    key: 'ai',
    title: 'AI',
    icon: 'hugeicons:ai-beautify',
    component: <AiSetting />,
    requireAdmin: true,
    keywords: ['ai', 'artificial intelligence', '人工智能'],
  },
  {
    key: 'httpproxy',
    title: ('http-proxy'),
    icon: 'tabler:cloud-network',
    component: <HttpProxySetting />,
    requireAdmin: true,
    keywords: ['proxy', 'http', 'connection', '代理', 'HTTP代理'],
  },
  {
    key: 'task',
    title: ('schedule-task'),
    icon: 'tabler:list-check',
    component: <TaskSetting />,
    requireAdmin: true,
    keywords: ['task', 'schedule', '任务', '定时任务'],
  },
  {
    key: 'storage',
    title: ('storage'),
    icon: 'tabler:database',
    component: <StorageSetting />,
    requireAdmin: true,
    keywords: ['storage', 'database', '存储', '数据库'],
  },
  {
    key: 'music',
    title: ('music-settings'),
    icon: 'tabler:music',
    component: <MusicSetting />,
    requireAdmin: true,
    keywords: ['music', '音乐设置'],
  },
  {
    key: 'import',
    title: ('import'),
    icon: 'tabler:file-import',
    component: <ImportSetting />,
    requireAdmin: true,
    keywords: ['import', 'data', '导入', '数据导入'],
  },
  {
    key: 'sso',
    title: ('sso-settings'),
    icon: 'tabler:key',
    component: <SSOSetting />,
    requireAdmin: true,
    keywords: ['sso', 'single sign on', '单点登录'],
  },
  {
    key: 'export',
    title: ('export'),
    icon: 'tabler:file-export',
    component: <ExportSetting />,
    requireAdmin: false,
    keywords: ['export', 'data', '导出', '数据导出'],
  },
  {
    key: 'plugin',
    title: ('plugin-settings'),
    icon: 'hugeicons:plug-socket',
    component: <PluginSetting />,
    requireAdmin: true,
    keywords: ['plugin', 'plugins', '插件', '插件设置'],
  },
  {
    key: 'about',
    title: ('about'),
    icon: 'tabler:info-circle',
    component: <AboutSetting />,
    requireAdmin: false,
    keywords: ['about', 'information', '关于', '信息'],
  },
];
