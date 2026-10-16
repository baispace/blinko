import { observer } from 'mobx-react-lite';
import { useState, type ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger, Slider, Switch } from '@heroui/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { api } from '@/lib/trpc';
import { PromiseCall } from '@/store/standard/PromiseState';
import {
  getPageViewScope,
  getPageViewSetting,
  updatePageViewSetting,
  updatePageViewColumns,
  type PageViewScope,
} from '@/lib/pageViewConfig';

const ViewOptionsGlyph = ({ size = 20 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3.48 6.75h3.64M11.54 6.75h9.94" />
    <circle cx="9.33" cy="6.75" r="2.96" />
    <path d="M3.48 17.25h10.21M18.11 17.25h3.37" />
    <circle cx="15.9" cy="17.25" r="2.96" />
  </svg>
);

const SORT_OPTIONS = [
  { key: 'updatedAt', label: 'updated-at' },
  { key: 'createdAt', label: 'created-at' },
  { key: 'manual', label: 'manual-order' },
] as const;
type SortKey = typeof SORT_OPTIONS[number]['key'];

const LIST_STYLE_OPTIONS = [
  { key: 'continuous', label: 'masonry' },
  { key: 'byDay', label: 'by-day' },
  { key: 'byWeek', label: 'by-week' },
] as const;
type ListStyleKey = typeof LIST_STYLE_OPTIONS[number]['key'];

const WIDTH_OPTIONS = [
  { key: 960, label: 'compact' },
  { key: 1200, label: 'page-width-default' },
  { key: 1440, label: 'page-width-wide' },
  { key: 0, label: 'page-width-full' },
] as const;

const updateScopedConfig = (blinko: BlinkoStore, scope: PageViewScope, key: string, value: unknown) =>
  updatePageViewSetting(blinko, scope, key as any, value, async (configKey, configValue) => {
    await PromiseCall(api.config.update.mutate({ key: configKey, value: configValue }), { autoAlert: false });
    await blinko.config.call();
  });

const updateScopedColumns = (blinko: BlinkoStore, scope: PageViewScope, count: number) =>
  updatePageViewColumns(blinko, scope, count, async (configKey, configValue) => {
    await PromiseCall(api.config.update.mutate({ key: configKey, value: configValue }), { autoAlert: false });
    await blinko.config.call();
  });

const SegmentedButtons = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) => (
  <div className="inline-flex w-full gap-0.5 rounded-lg bg-default-100 p-0.5">
    {options.map(option => {
      const selected = option.key === value;
      return (
        <button
          key={String(option.key)}
          type="button"
          aria-pressed={selected}
          title={option.label}
          onClick={() => onChange(option.key)}
          className={`flex min-h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
            selected
              ? 'bg-card text-foreground shadow-sm'
              : 'text-default-500 hover:bg-background/70 hover:text-foreground'
          }`}
        >
          {option.icon}
          <span className="truncate">{option.label}</span>
        </button>
      );
    })}
  </div>
);

const Section = ({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) => (
  <section className="border-t border-default-200/70 py-2.5 first:border-t-0">
    <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-default-500">
      <span>{label}</span>
      {value}
    </div>
    {children}
  </section>
);

export const BlinkoHomeSettingsPop = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const scope = getPageViewScope(searchParams);
  const path = searchParams.get('path');
  const [isOpen, setIsOpen] = useState(false);

  const cardSpacing = Number(getPageViewSetting(blinko, scope, 'cardSpacing') ?? 16);
  const cardColumns = Number(getPageViewSetting(blinko, scope, 'largeDeviceCardColumns') ?? 1);
  const sortBy = (getPageViewSetting(blinko, scope, 'noteListSortBy') as SortKey | undefined) ?? 'createdAt';
  const listStyle = (getPageViewSetting(blinko, scope, 'noteListStyle') as ListStyleKey | undefined) ?? 'continuous';
  const configuredWidth = Number(getPageViewSetting(blinko, scope, 'maxHomePageWidth') ?? 0);
  const widthPreset = WIDTH_OPTIONS.some(option => option.key === configuredWidth) ? configuredWidth : 1200;
  const hideDesktopEditor = Boolean(getPageViewSetting(blinko, scope, 'hidePcEditor') ?? false);

  const isTodo = scope === 'todo';
  const isMasonry = listStyle === 'continuous' && !isTodo;
  const canShowComposer = scope !== 'archived' && scope !== 'trash';

  const changeSort = async (next: SortKey) => {
    await updateScopedConfig(blinko, scope, 'noteListSortBy', next);
    await blinko.getListByPath(path).resetAndCall({});

  };

  return (
    <Popover
      placement="bottom-end"
      backdrop="transparent"
      isOpen={isOpen}
      onOpenChange={setIsOpen}
    >
      <PopoverTrigger>
        <button
          type="button"
          data-testid="home-view-settings"
          aria-label={t('blinko-view-settings')}
          title={t('blinko-view-settings')}
          className={`grid size-8 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
            isOpen ? 'bg-default-100 text-foreground' : 'text-default-600 hover:bg-default-100 hover:text-foreground'
          }`}
        >
          <ViewOptionsGlyph />
        </button>
      </PopoverTrigger>

      <PopoverContent className="max-h-[min(78vh,620px)] overflow-y-auto border border-default-200 bg-card !p-0 shadow-xl !rounded-xl">
        <div className="w-[min(286px,calc(100vw-24px))] px-3 pb-3 pt-2.5 text-left">
          <div className="pb-2.5">
            <h2 className="text-[13px] font-semibold text-foreground">{t('blinko-view-settings')}</h2>
            <p className="mt-0.5 text-[10.5px] leading-relaxed text-default-400">
              {t('blinko-view-settings-subtitle')}
            </p>
          </div>

          {!isTodo && (
            <Section label={t('list-style')}>
              <SegmentedButtons
                value={listStyle}
                onChange={value => void updateScopedConfig(blinko, scope, 'noteListStyle', value)}
                options={LIST_STYLE_OPTIONS.map(option => ({ key: option.key, label: t(option.label) }))}
              />
              {listStyle !== 'continuous' && (
                <p className="mt-1.5 text-[10.5px] text-default-400">{t('list-style-timeline-desc')}</p>
              )}
            </Section>
          )}

          <Section label={t('page-width')}>
            <SegmentedButtons
              value={widthPreset}
              onChange={value => void updateScopedConfig(blinko, scope, 'maxHomePageWidth', value)}
              options={WIDTH_OPTIONS.map(option => ({ key: option.key, label: t(option.label) }))}
            />
          </Section>

          <Section label={t('sort-by')}>
            <SegmentedButtons
              value={sortBy}
              onChange={value => void changeSort(value)}
              options={SORT_OPTIONS.map(option => ({ key: option.key, label: t(option.label) }))}
            />
          </Section>

          {isMasonry && (
            <>
              <Section
                label={t('card-columns')}
                value={<span className="tabular-nums text-default-500">{cardColumns}</span>}
              >
                <Slider
                  size="sm"
                  aria-label={t('card-columns')}
                  minValue={1}
                  maxValue={4}
                  step={1}
                  value={cardColumns}
                  onChange={value => void updateScopedColumns(blinko, scope, Array.isArray(value) ? value[0] : value)}
                  marks={[1, 2, 3, 4].map(value => ({ value, label: String(value) }))}
                  classNames={{
                    track: '!bg-default-200',
                    filler: '!bg-default-300',
                    thumb: '!bg-default-400 !shadow-small',
                    mark: '!text-[10px]',
                  }}
                />
              </Section>

              <Section
                label={t('card-spacing')}
                value={<span className="tabular-nums text-default-500">{cardSpacing}px</span>}
              >
                <Slider
                  size="sm"
                  aria-label={t('card-spacing')}
                  minValue={4}
                  maxValue={24}
                  step={2}
                  value={cardSpacing}
                  onChange={value => void updateScopedConfig(blinko, scope, 'cardSpacing', Array.isArray(value) ? value[0] : value)}
                  classNames={{
                    track: '!bg-default-200',
                    filler: '!bg-default-300',
                    thumb: '!bg-default-400 !shadow-small',
                  }}
                />
              </Section>
            </>
          )}

          {canShowComposer && (
            <section className="flex items-center justify-between gap-3 border-t border-default-200/70 py-2.5">
              <div className="min-w-0">
                <div className="text-[11px] text-default-600">{t('hide-desktop-editor')}</div>
                <p className="mt-0.5 text-[10px] leading-relaxed text-default-400">{t('hide-desktop-editor-desc')}</p>
              </div>
              <Switch
                size="sm"
                aria-label={t('hide-desktop-editor')}
                isSelected={hideDesktopEditor}
                onChange={event => void updateScopedConfig(blinko, scope, 'hidePcEditor', event.target.checked)}
              />
            </section>
          )}

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mt-1 h-8 w-full rounded-lg border border-default-200 text-[11.5px] font-medium text-foreground transition-colors hover:bg-default-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            {t('done')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default BlinkoHomeSettingsPop;
