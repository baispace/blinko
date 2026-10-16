import { observer } from 'mobx-react-lite';
import { Link } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { Icon } from '@/components/Common/Iconify/icons';

/**
 * Quick Link 单条记录的契约，序列化在 _config.customQuickLinks 内。
 *
 * iconSource 区分 icon 是 iconify 名（preset）还是 base64 dataURL（ai），
 * 未来接 AI 生成图标时才会出现 'ai'，当前实现只支持 preset + 用户输入 iconify 名。
 */
export type QuickLinkItem = {
  id: string;
  type: 'internal' | 'external';
  label: string;
  target: string;
  icon: string;
  iconSource?: 'preset' | 'ai' | 'iconify';
};

const parseLinks = (raw: unknown): QuickLinkItem[] => {
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

/**
 * Sidebar 顶部 brand 下方渲染一行胶囊快捷入口（HEO 风）。
 * 只做展示，加 / 删 / 改在 SiteBrandingSettings 里编辑。
 */
export const SiteQuickLinksRow = observer(() => {
  const config = RootStore.Get(BlinkoStore).config.value;
  const links = parseLinks(config?.customQuickLinks).slice(0, 8);
  if (links.length === 0) return null;

  return (
    <div
      data-testid="sidebar-quick-links"
      className="flex flex-wrap gap-1.5 overflow-x-auto px-2.5 pt-1 hide-scrollbar"
    >
      {links.map(link => {
        const isInternal = link.type === 'internal';
        const isBase64 = link.icon.startsWith('data:');
        const className =
          'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-default-200/70 bg-background pl-1 pr-2 text-[11.5px] font-medium text-default-600 hover:!bg-default-100 hover:!text-foreground !transition-colors';
        const content = (
          <>
            {isBase64 ? (
              <img src={link.icon} alt="" width={14} height={14} className="size-3.5 shrink-0 rounded-sm object-contain" />
            ) : (
              <Icon icon={link.icon} width={14} height={14} className="shrink-0" />
            )}
            <span className="truncate leading-none">{link.label}</span>
          </>
        );
        if (isInternal) {
          return (
            <Link key={link.id} to={link.target} className={className} aria-label={link.label}>
              {content}
            </Link>
          );
        }
        return (
          <a
            key={link.id}
            href={link.target}
            target="_blank"
            rel="noreferrer"
            className={className}
            aria-label={link.label}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
});
