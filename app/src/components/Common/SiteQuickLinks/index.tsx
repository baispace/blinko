/**
 * 工作空间下拉菜单项的统一契约。
 *
 * 三种 type：
 * - 'system'：初始化默认项（home / appearance / about 三种 action 由前端路由 dispatch）。
 *   放在 _config.customQuickLinks 中时 label/icon 可改；target 是 system enum；
 *   「恢复默认」= 清空自定义数组，让代码内置默认重新接管。
 * - 'internal'：站内路径跳转，target 必须以 / 开头。
 * - 'external'：外部 URL，window.open 新标签。
 *
 * 数据序列化在 _config.customQuickLinks，update 接口走 zod JSON 校验。
 */
export type WorkspaceMenuAction = 'home' | 'appearance' | 'about';

export type WorkspaceMenuItem =
  | {
      id: string;
      type: 'system';
      action: WorkspaceMenuAction;
      label: string;
      icon: string;
      iconSource?: 'builtin' | 'preset' | 'iconify' | 'ai';
    }
  | {
      id: string;
      type: 'internal';
      label: string;
      target: string;
      icon: string;
      iconSource?: 'builtin' | 'preset' | 'iconify' | 'ai';
    }
  | {
      id: string;
      type: 'external';
      label: string;
      target: string;
      icon: string;
      iconSource?: 'builtin' | 'preset' | 'iconify' | 'ai';
    };

/** 把 _config 里的 string / array / 其它 都规整成 WorkspaceMenuItem[]；旧 QuickLinkItem 数据按默认字段推断。 */
export const parseWorkspaceMenu = (raw: unknown): WorkspaceMenuItem[] => {
  if (!raw) return [];
  let arr: any[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch { return []; }
  } else return [];

  const out: WorkspaceMenuItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id ?? '').trim();
    if (!id) continue;
    const icon = String(item.icon ?? '').trim() || 'ph:link';
    const label = String(item.label ?? '').trim();
    const iconSource = item.iconSource;
    if (item.type === 'system' && (item.action === 'home' || item.action === 'appearance' || item.action === 'about')) {
      out.push({ id, type: 'system', action: item.action, label, icon, iconSource });
    } else if (item.type === 'external' && typeof item.target === 'string') {
      out.push({ id, type: 'external', label, target: item.target, icon, iconSource });
    } else if (typeof item.target === 'string') {
      // 兼容旧 QuickLinkItem 数据（无 type 字段）：归 internal。
      out.push({ id, type: 'internal', label, target: item.target, icon, iconSource });
    }
  }
  return out;
};

/**
 * 内置默认菜单 —— 用户未配置 customQuickLinks 时使用。
 * label 用 zh 默认，渲染时根据 i18n 切换（见 resolveDefaultLabel）。
 * 改动其中内容时，前端语言切换即可生效，不需要迁库。
 */
const SYSTEM_LABEL_I18N: Record<string, { zh: string; en: string }> = {
  'system-home': { zh: '返回主页', en: 'Go to home' },
  'system-appearance': { zh: '站点外观', en: 'Site appearance' },
  'system-about': { zh: '关于本站', en: 'About site' },
};

export const DEFAULT_WORKSPACE_MENU = (): WorkspaceMenuItem[] => ([
  { id: 'system-home', type: 'system', action: 'home', label: '返回主页', icon: 'tabler:home', iconSource: 'builtin' },
  { id: 'system-appearance', type: 'system', action: 'appearance', label: '站点外观', icon: 'tabler:brush', iconSource: 'builtin' },
  { id: 'system-about', type: 'system', action: 'about', label: '关于本站', icon: 'tabler:info-circle', iconSource: 'builtin' },
]);

/**
 * 解析一项菜单的展示 label。
 * - system 项：用户没编辑就回退到 SYSTEM_LABEL_I18N 当前语言；编辑过保留自定义 label。
 * - internal/external：直接用 item.label。
 */
export const resolveMenuLabel = (item: WorkspaceMenuItem, isZh: boolean): string => {
  if (item.type !== 'system') return item.label;
  if (item.label.trim()) {
    // 用户改过 → 看 label 是否就是当前语言族对应的内置默认；
    // 如果改成了别的字（非默认值）→ 保留用户改的。
    // 如果还是默认值 → 切语种。
    const dict = SYSTEM_LABEL_I18N[item.id];
    if (dict) {
      if (isZh && item.label.trim() === dict.zh) return dict.zh;
      if (!isZh && item.label.trim() === dict.en) return dict.en;
      // 改了别的（既不是当前语言族也不是目标语言族）→ 检查另一族是不是默认值
      if (!isZh && item.label.trim() === dict.zh) return dict.en;
      if (isZh && item.label.trim() === dict.en) return dict.zh;
    }
    return item.label;
  }
  const dict = SYSTEM_LABEL_I18N[item.id];
  if (!dict) return item.label;
  return isZh ? dict.zh : dict.en;
};
