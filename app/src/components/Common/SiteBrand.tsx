import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { BrandMark } from '@/components/Common/Brand/BrandMark';
import { BRAND_NAME } from '@/components/Common/Brand/brandGeometry';

/**
 * One workspace identity across the sidebar, sign-in page and settings.
 *
 * The mark is the product logo; the name is the workspace name, which falls
 * back to the product name. A workspace that uploaded its own icon keeps
 * using it — the logo only fills in when there is none.
 *
 * The mark is decorative here on purpose: every place that renders it either
 * carries the name next to it or sits inside a control that already has an
 * accessible label.
 */
export const SiteBrand = observer(({ compact = false, size = 30, framed = false, showTagline = true }: {
  compact?: boolean; size?: number; framed?: boolean; showTagline?: boolean;
}) => {
  const config = RootStore.Get(BlinkoStore).config.value;
  const title = config?.customTitle?.trim() || BRAND_NAME.en;
  const tagline = showTagline ? config?.customTagline?.trim() || '' : '';
  const customIcon = config?.customIcon?.trim();
  return <span className="flex w-full min-w-0 items-center gap-3" title={[title,tagline].filter(Boolean).join('\n')}>
    {customIcon
      ? <span className={framed
        ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5'
        : 'flex shrink-0 items-center justify-center'}>
        <img src={customIcon} alt="" width={size} height={size} style={{ width:size,height:size }} className="shrink-0 rounded-lg object-contain"
          onError={event=>{if(event.currentTarget.getAttribute('src')!=='/favicon.svg')event.currentTarget.src='/favicon.svg';}} />
      </span>
      : <BrandMark size={size} className="shrink-0" />}
    {!compact && <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
      <span className="line-clamp-2 break-words text-[14px] font-semibold leading-[19px] tracking-[-0.01em] text-foreground">{title}</span>
      {tagline && <span className="block truncate text-[11px] font-normal leading-[15px] text-default-500">{tagline}</span>}
    </span>}
  </span>;
});
