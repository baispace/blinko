import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

const TYPES = [
  { value: '', labelKey: 'all', icon: 'hugeicons:note', className: 'text-default-500' },
  { value: '0', labelKey: 'blinko', icon: 'basil:lightning-outline', className: 'text-amber-500' },
  { value: '1', labelKey: 'notes', icon: 'hugeicons:note', className: 'text-primary' },
  { value: '2', labelKey: 'todo', icon: 'solar:bill-check-linear', className: 'text-emerald-500' },
] as const;

export const TagContentTypeTabs = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get('contentType') ?? '';
  const tagId = Number(searchParams.get('tagId'));
  const tags = blinko.tagList.value;

  const countFor = (value: string) => {
    if (!Number.isFinite(tagId)) return 0;
    if (value === '0') return tags?.tagBlinkoCounts?.[tagId] ?? 0;
    if (value === '1') return tags?.tagNoteCounts?.[tagId] ?? 0;
    if (value === '2') return tags?.tagTodoCounts?.[tagId] ?? 0;
    return tags?.tagCounts?.[tagId] ?? 0;
  };

  const select = (value: string) => {
    const next = new URLSearchParams(searchParams);
    value ? next.set('contentType', value) : next.delete('contentType');
    setSearchParams(next);
  };

  return (
    <div
      role="tablist"
      aria-label={t('content-type')}
      className="flex max-w-[55%] shrink-0 items-center gap-1 overflow-x-auto border-r border-default-200 pr-2 hide-scrollbar"
    >
      {TYPES.map(type => {
        const selected = active === type.value;
        const count = countFor(type.value);
        return (
          <button
            key={type.value || 'all'}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => select(type.value)}
            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
              selected
                ? 'bg-card text-foreground shadow-sm'
                : 'text-default-500 hover:bg-background/70 hover:text-foreground'
            }`}
          >
            <Icon icon={type.icon} width={14} height={14} className={type.className} />
            <span>{t(type.labelKey)}</span>
            <span className={`text-[10.5px] tabular-nums ${selected ? 'text-default-500' : 'text-default-400'}`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
});
