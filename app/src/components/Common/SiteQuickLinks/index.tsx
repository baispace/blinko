/**
 * Quick Link 单条记录的契约，序列化在 _config.customQuickLinks 内。
 *
 * iconSource 区分 icon 是 iconify 名（preset）、base64 dataURL（ai）或用户手填的 iconify 名。
 * 当前展示走 Sidebar 的工作空间下拉菜单，加 / 删 / 改由 SiteBrandingSettings 处理。
 */
export type QuickLinkItem = {
  id: string;
  type: 'internal' | 'external';
  label: string;
  target: string;
  icon: string;
  iconSource?: 'preset' | 'ai' | 'iconify';
};

/** 把 _config.customQuickLinks 序列化的 string / array / 其它 都规整成 QuickLinkItem[]。 */
export const parseQuickLinks = (raw: unknown): QuickLinkItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as QuickLinkItem[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QuickLinkItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};
