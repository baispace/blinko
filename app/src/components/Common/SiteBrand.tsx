import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

const DEFAULT_TAGLINE = '闪念 · 笔记 · 待办 · AI 工作流';

/**
 * Sidebar 顶部的站点品牌块。
 *
 * 布局：
 *   左侧：站点图标（垂直居中于 brand 区整体高度）
 *   右侧：站点名（customTitle）+ 副标（customTagline），上下两行
 *
 * 折叠态（compact）只保留站点图标（+ 站点名 hover title）。
 * 副标只在 `description` 显式可见时显示；空串时用 DEFAULT_TAGLINE 回退。
 *
 * 数据来源：blinkoStore.config（统一从 _config 表读 customTitle / customTagline / customIcon），
 * 与 Settings → Site Appearance 写入共享。
 */
export const SiteBrand = observer(({
  compact = false,
  size = 30,
  framed = false,
  showTagline = true,
}: {
  compact?: boolean;
  size?: number;
  framed?: boolean;
  showTagline?: boolean;
}) => {
  const config = RootStore.Get(BlinkoStore).config.value;
  const title = config?.customTitle?.trim() || 'Blinko';
  const tagline = (config?.customTagline ?? '').trim() || (showTagline ? DEFAULT_TAGLINE : '');
  return (
    <span className="flex min-w-0 items-center gap-1 self-stretch" title={title}>
      <span
        className={
          framed
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-default-200/70 bg-default-100/70 shadow-sm'
            : 'flex shrink-0 items-center justify-center self-center'
        }
      >
        <img
          src={config?.customIcon || '/logo.png'}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className="shrink-0 rounded-lg object-contain"
          onError={event => {
            if (event.currentTarget.getAttribute('src') !== '/logo.png') event.currentTarget.src = '/logo.png';
          }}
        />
      </span>
      {!compact && (
        <span className="flex min-w-0 shrink-0 flex-col gap-0.5 py-0.5">
          <span className="truncate text-sm font-semibold leading-none">{title}</span>
          {tagline && showTagline && (
            <span className="truncate text-[10.5px] font-normal leading-tight text-default-500">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
});
