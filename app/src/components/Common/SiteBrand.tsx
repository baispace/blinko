import { observer } from 'mobx-react-lite';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

/** One workspace identity across the sidebar, sign-in page and settings. */
export const SiteBrand = observer(({ compact = false, size = 30, framed = false, showTagline = true }: {
  compact?: boolean; size?: number; framed?: boolean; showTagline?: boolean;
}) => {
  const config = RootStore.Get(BlinkoStore).config.value;
  const title = config?.customTitle?.trim() || 'Blinko';
  const tagline = showTagline ? config?.customTagline?.trim() || '' : '';
  return <span className="flex w-full min-w-0 items-center gap-3" title={[title,tagline].filter(Boolean).join('\n')}>
    <span className={framed
      ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/5'
      : 'flex shrink-0 items-center justify-center'}>
      <img src={config?.customIcon || '/logo.png'} alt="" width={size} height={size} style={{ width:size,height:size }} className="shrink-0 rounded-lg object-contain"
        onError={event=>{if(event.currentTarget.getAttribute('src')!=='/logo.png')event.currentTarget.src='/logo.png';}} />
    </span>
    {!compact && <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
      <span className="line-clamp-2 break-words text-[14px] font-semibold leading-[19px] tracking-[-0.01em] text-foreground">{title}</span>
      {tagline && <span className="block truncate text-[11px] font-normal leading-[15px] text-default-400">{tagline}</span>}
    </span>}
  </span>;
});
