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

/**
 * Segmented control: prototype uses muted track + raised white active cell.
 * Single source of truth — used for both list-style and sort controls.
 */
const SegmentedButtons = <T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string; icon?: React.ReactNode; iconOnly?: boolean }[];
  value: T;
  onChange: (v: T) => void;
}) => (
  <div className="inline-flex w-full gap-[2px] rounded-md bg-default-100 p-[2px]">
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
          className={`min-w-0 flex-1 rounded-[5px] px-2 py-[3px] text-[11px] !transition-all flex items-center justify-center gap-1 ${
            selected
              ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
              : 'bg-transparent text-default-500 hover:text-foreground'
          }`}
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

  const cardSpacing = (getPageViewSetting(blinko, scope, 'cardSpacing') as number | undefined) ?? 16;
  // 列数取大屏档作为单一真相源
  const noteListColumnCount = Number(getPageViewSetting(blinko, scope, 'largeDeviceCardColumns') ?? 1);
  const noteListSortBy = ((getPageViewSetting(blinko, scope, 'noteListSortBy') as SortKey | undefined) ?? 'createdAt');
  // 「按周」已从 UI 移除；历史配置里的 byWeek 归一到 byDay，避免切换器无选中项
  const rawListStyle = getPageViewSetting(blinko, scope, 'noteListStyle') as string | undefined;
  const noteListStyle: ListStyleKey = rawListStyle === 'byWeek' ? 'byDay' : ((rawListStyle as ListStyleKey | undefined) ?? 'continuous');

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
      {/*
        容器严格按原型 .view-popover 视觉对齐：
          - 240px 宽（原 260 → 260→240；原型 228，留 12px 富余给中文 label）
          - rounded-[10px]
          - shadow-lg + 1px border
          - section 之间用 border-top 分隔（首段无上边框）
          - label 11px text-default-500
          - 底部「完成」按钮收尾
      */}
      <PopoverContent className="!p-0 !bg-card !shadow-lg !rounded-[10px] border border-default-200">
        <div className="flex w-[240px] flex-col p-3 text-left">
          {/* 列表样式（原 .vp-section：8px padding + 1px 上边框分隔） */}
          <section className="py-2 border-t border-default-200 first:border-t-0 first:pt-1">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-default-500">
              <span>{t('list-style')}</span>
            </div>
            <SegmentedButtons
              value={noteListStyle}
              onChange={(v) => updateScopedConfig(blinko, scope, 'noteListStyle', v)}
              options={LIST_STYLE_OPTIONS.map(o => ({ key: o.key, label: t(o.label) }))}
            />
            {noteListStyle !== 'continuous' && (
              <p className="mt-1 text-[11px] text-default-400">{t('list-style-timeline-desc')}</p>
            )}
          </section>

          {/* 排序 */}
          <section className="py-2 border-t border-default-200">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-default-500">
              <span>{t('sort-by')}</span>
            </div>
            <SegmentedButtons
              value={noteListSortBy}
              onChange={(v) => updateScopedConfig(blinko, scope, 'noteListSortBy', v)}
              options={SORT_OPTIONS.map(o => ({ key: o.key, label: t(o.label) }))}
            />
          </section>

          {/* 卡片列数 */}
          <section className="py-2 border-t border-default-200">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-default-500">
              <span>{t('card-columns')}</span>
              <span className="text-default-500 tabular-nums">{noteListColumnCount}</span>
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
              classNames={{
                track: '!bg-default-200',
                filler: '!bg-default-300',
                thumb: '!bg-default-400 !shadow-small',
                mark: '!text-[10px]',
              }}
            />
          </section>

          {/* 卡片间距 */}
          <section className="py-2 border-t border-default-200">
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-default-500">
              <span>{t('card-spacing')}</span>
              <span className="text-default-500 tabular-nums">{cardSpacing}px</span>
            </div>
            <Slider
              size="sm"
              aria-label={t('card-spacing')}
              minValue={4}
              maxValue={24}
              step={2}
              value={cardSpacing}
              onChange={(v) => updateScopedConfig(blinko, scope, 'cardSpacing', Array.isArray(v) ? v[0] : v)}
              classNames={{
                track: '!bg-default-200',
                filler: '!bg-default-300',
                thumb: '!bg-default-400 !shadow-small',
              }}
            />
          </section>

          {/* 完成（vp-done） */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="mt-2 w-full rounded-md border border-default-200 py-1.5 text-[11.5px] text-foreground hover:!bg-hover !transition-colors"
          >
            {t('done')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
});

export default BlinkoHomeSettingsPop;