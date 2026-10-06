import { observer } from "mobx-react-lite";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger, Slider, Switch } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { api } from "@/lib/trpc";
import { PromiseCall } from "@/store/standard/PromiseState";
import {
  getPageViewScope,
  getPageViewSetting,
  updatePageViewSetting,
  updatePageViewColumns,
  type PageViewScope,
} from "@/lib/pageViewConfig";

/**
 * "视图设置" trigger glyph — reproduces the Iconly `view` icon used by the
 * official app. Its resting Lottie frame is a two-track slider; the geometry
 * below is normalized from the original 512×512 artwork to a 24×24 viewBox
 * (lines y=6.745/17.255, x=3.483→21.474, stroke 1.5, knobs r=2.958 at
 * x=9.333 / 15.9) so the trigger matches the reference pixel for pixel.
 */
const ViewOptionsGlyph = ({ size = 21 }: { size?: number }) => (
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

const WIDTH_OPTIONS = [
  { value: 860, label: '860px', glyph: 12 },
  { value: 1120, label: '1120px', glyph: 18 },
  { value: 1440, label: '1440px', glyph: 24 },
  { value: 0, label: 'full-width', glyph: 30 },
] as const;

type WidthKey = typeof WIDTH_OPTIONS[number]['value'];

// 历史档位（xs/sm/md/lg → 1200/1600/2100/2800）迁移到新四档
const LEGACY_WIDTH_MAP: Record<number, WidthKey> = { 1200: 860, 1600: 1120, 2100: 1440, 2800: 0 };

const SORT_OPTIONS = [
  { key: 'updatedAt', label: 'updated-at' },
  { key: 'createdAt', label: 'created-at' },
] as const;

type SortKey = typeof SORT_OPTIONS[number]['key'];

// continuous = 瀑布流（默认），byDay = 按天时间线分组。
// 与 pages/index.tsx:351 的分支判断保持一致。
const LIST_STYLE_OPTIONS = [
  { key: 'continuous', label: 'masonry' },
  { key: 'byDay', label: 'by-day' },
] as const;

type ListStyleKey = typeof LIST_STYLE_OPTIONS[number]['key'];

// 视图设置按页面作用域读写（pageViewSettings[scope]），页面间互不影响
const updateScopedConfig = (blinko: BlinkoStore, scope: PageViewScope, key: string, value: any) =>
  updatePageViewSetting(blinko, scope, key as any, value, async (k, v) => {
    await PromiseCall(api.config.update.mutate({ key: k, value: v }), { autoAlert: false });
    blinko.config.call();
  });

const updateScopedColumns = (blinko: BlinkoStore, scope: PageViewScope, n: number) =>
  updatePageViewColumns(blinko, scope, n, async (k, v) => {
    await PromiseCall(api.config.update.mutate({ key: k, value: v }), { autoAlert: false });
    blinko.config.call();
  });

/** 宽度档位示意：宽度递增的小圆角矩形，颜色随选中态走 currentColor */
const WidthGlyph = ({ w }: { w: number }) => (
  <span
    aria-hidden="true"
    className="inline-block h-3 shrink-0 rounded-[3px] bg-current"
    style={{ width: w }}
  />
);

const SegmentedButtons = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; icon?: React.ReactNode; iconOnly?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="grid gap-1 rounded-xl bg-secondbackground p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
    {options.map((opt) => {
      const selected = opt.key === value;
      return (
        <button
          key={String(opt.key)}
          type="button"
          aria-label={opt.label}
          title={opt.label}
          data-selected={selected}
          onClick={() => onChange(opt.key)}
          className={`view-option-button min-w-0 rounded-lg px-2 py-2.5 text-sm font-medium !transition-colors flex items-center justify-center gap-1.5 ${selected ? 'bg-default-300/80 text-foreground shadow-sm dark:bg-default-600' : 'text-default-500 hover:text-foreground'}`}
        >
          {opt.icon}
          {!opt.iconOnly && <span>{opt.label}</span>}
        </button>
      );
    })}
  </div>
);

export const BlinkoHomeSettingsPop = observer(() => {
  const { t } = useTranslation();
  const blinko = RootStore.Get(BlinkoStore);
  const location = useLocation();
  // 当前页面作用域：闪念 / 笔记 / 全部…各自独立记忆视图设置
  const scope = getPageViewScope(new URLSearchParams(location.search));
  const [isOpen, setIsOpen] = useState(false);

  const hidePcEditor = !!getPageViewSetting(blinko, scope, 'hidePcEditor');
  const maxHomePageWidth = (getPageViewSetting(blinko, scope, 'maxHomePageWidth') as number | null | undefined) ?? 0;
  const cardSpacing = (getPageViewSetting(blinko, scope, 'cardSpacing') as number | undefined) ?? 16;
  // 列数取大屏档作为单一真相源
  const noteListColumnCount = Number(getPageViewSetting(blinko, scope, 'largeDeviceCardColumns') ?? 1);
  const noteListSortBy = ((getPageViewSetting(blinko, scope, 'noteListSortBy') as SortKey | undefined) ?? 'createdAt');
  // 「按周」已从 UI 移除；历史配置里的 byWeek 归一到 byDay，避免切换器无选中项
  const rawListStyle = getPageViewSetting(blinko, scope, 'noteListStyle') as string | undefined;
  const noteListStyle: ListStyleKey = rawListStyle === 'byWeek' ? 'byDay' : ((rawListStyle as ListStyleKey | undefined) ?? 'continuous');
  const scopeLabel = { blinko: t('blinko'), notes: t('notes'), all: t('all'), todo: t('todo'), archived: t('archived'), trash: t('trash') }[scope] ?? scope;

  // 把当前宽度值归一到 4 档（兼容历史 xs/sm/md/lg 值）；0 = 全宽
  const matchedWidth: WidthKey = (WIDTH_OPTIONS.find(o => o.value === maxHomePageWidth)?.value)
    ?? LEGACY_WIDTH_MAP[maxHomePageWidth as number]
    ?? (WIDTH_OPTIONS.find(o => o.value === 0)?.value as WidthKey);

  return (
    <Popover placement="bottom-start" backdrop="transparent" isOpen={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger>
        <button
          type="button"
          aria-label={t('blinko-view-settings')}
          className="view-options-trigger z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-desc subpixel-antialiased !transition-colors hover:bg-secondbackground hover:text-foreground aria-expanded:scale-[0.97] aria-expanded:opacity-70"
        >
          <ViewOptionsGlyph />
        </button>
      </PopoverTrigger>
      <PopoverContent className="!p-0 !bg-content1 !shadow-xl !rounded-2xl">
        <div className="flex w-full flex-col gap-5 p-4 w-[310px]">
          <div>
            <div className="font-semibold text-base">{t('blinko-view-settings')}</div>
            <div className="text-xs text-default-400 mt-0.5">{t('blinko-view-settings-subtitle')}</div>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-secondbackground px-2 py-0.5 text-[11px] text-default-500">
              {t('view-scope-current')}：{scopeLabel}
            </div>
          </div>

          {/* 隐藏桌面编辑器 */}
          <section className="flex items-center justify-between gap-3 rounded-xl bg-secondbackground px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('hide-desktop-editor')}</div>
              <p className="mt-0.5 text-[11px] text-default-400">{t('hide-desktop-editor-desc')}</p>
            </div>
            <Switch
              size="sm"
              isSelected={hidePcEditor}
              onValueChange={(v) => updateScopedConfig(blinko, scope, 'hidePcEditor', v)}
            />
          </section>

          {/* 内容宽度 */}
          <section className="flex flex-col gap-2">
            <span className="text-sm text-default-400">{t('content-width')}</span>
            <SegmentedButtons
              value={matchedWidth}
              onChange={(v) => updateScopedConfig(blinko, scope, 'maxHomePageWidth', v)}
              options={WIDTH_OPTIONS.map(o => ({
                key: o.value,
                label: o.value === 0 ? t('full-width') : o.label,
                icon: <WidthGlyph w={o.glyph} />,
                iconOnly: true,
              }))}
            />
          </section>

          {/* 卡片间距 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-400">{t('card-spacing')}</span>
              <span className="text-sm font-medium tabular-nums text-foreground">{cardSpacing}px</span>
            </div>
            <Slider
              size="sm"
              aria-label={t('card-spacing')}
              minValue={4}
              maxValue={24}
              step={2}
              value={cardSpacing}
              onChange={(v) => updateScopedConfig(blinko, scope, 'cardSpacing', Array.isArray(v) ? v[0] : v)}
              classNames={{ track: '!bg-default-300/50', filler: '!bg-[#fbe573]', thumb: '!bg-[#fbe573] !shadow-small' }}
            />
            <div className="flex justify-between px-1 text-[11px] text-default-400">
              <span>{t('compact')}</span>
              <span>{t('loose')}</span>
            </div>
          </section>

          {/* 卡片列数 */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-400">{t('card-columns')}</span>
              <span className="text-sm font-medium tabular-nums text-foreground">{noteListColumnCount}</span>
            </div>
            <Slider
              size="sm"
              aria-label={t('card-columns')}
              minValue={1}
              maxValue={4}
              step={1}
              value={noteListColumnCount}
              onChange={(v) => updateScopedColumns(blinko, scope, Array.isArray(v) ? v[0] : v)}
              marks={[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' },
              ]}
              classNames={{ track: '!bg-default-300/50', filler: '!bg-[#fbe573]', thumb: '!bg-[#fbe573] !shadow-small' }}
            />
          </section>

          {/* 列表样式：按天 / 按周时间线，或瀑布流 */}
          <section className="flex flex-col gap-2">
            <span className="text-sm text-default-400">{t('list-style')}</span>
            <SegmentedButtons
              value={noteListStyle}
              onChange={(v) => updateScopedConfig(blinko, scope, 'noteListStyle', v)}
              options={LIST_STYLE_OPTIONS.map(o => ({ key: o.key, label: t(o.label) }))}
            />
            {noteListStyle !== 'continuous' && (
              <p className="mt-0.5 text-[11px] text-default-400">{t('list-style-timeline-desc')}</p>
            )}
          </section>

          {/* 排序方式 */}
          <section className="flex flex-col gap-2">
            <span className="text-sm text-default-400">{t('sort-by')}</span>
            <SegmentedButtons
              value={noteListSortBy}
              onChange={(v) => updateScopedConfig(blinko, scope, 'noteListSortBy', v)}
              options={SORT_OPTIONS.map(o => ({ key: o.key, label: t(o.label) }))}
            />
          </section>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default BlinkoHomeSettingsPop;