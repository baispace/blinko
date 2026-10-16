import { SiteBrandingSettings } from './SiteBrandingSettings';
import { observer } from "mobx-react-lite";
import { Switch, Input, Tooltip, Textarea, Slider, Button } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Item, ItemWithTooltip, SelectDropdown } from "./Item";
import ThemeSwitcher from "../Common/Theme/ThemeSwitcher";
import { saveThemeColor } from '../Common/Theme/saveThemeColor';
import { ThemeColor } from "../Common/Theme/ThemeColor";
import LanguageSwitcher from "../Common/LanguageSwitcher";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PageSize, PromiseCall } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { useState, useEffect, useRef } from "react";
import { useMediaQuery } from "usehooks-ts";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { GradientBackground } from "../Common/GradientBackground";
import { UserStore } from "@/store/user";
import { ToastPlugin } from "@/store/module/Toast/Toast";
import { BaseStore } from "@/store/baseStore";
import FontSwitcher from "../Common/FontSwitcher";
import { Icon } from "@/components/Common/Iconify/icons";

/** 分组容器：组标题 + 副标题 + 白色圆角卡片（行间分隔线），对齐官方设置页交互样式 */
const SettingSection = observer(({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) => {
  return (
    <section className="flex flex-col gap-2">
      <div className="px-1">
        <div className="flex items-center gap-1.5 text-sm font-bold text-foreground">
          <Icon icon={icon} width="16" height="16" className="text-default-400" />
          <span>{title}</span>
        </div>
        {desc && <div className="text-xs text-default-400 mt-0.5">{desc}</div>}
      </div>
      <div className="rounded-xl border border-default-200/70 bg-background px-4 py-1 divide-y divide-default-100">
        {children}
      </div>
    </section>
  );
});

/** 带描述文字的行内标题（左侧：标题 + 灰色描述） */
const ItemLabel = ({ title, desc }: { title: string; desc?: string }) => (
  <div className="flex flex-col">
    <div className="text-sm font-medium">{title}</div>
    {desc && <div className="text-xs text-default-400">{desc}</div>}
  </div>
);

/**
 * 排版面板「数字 + 步进按钮」行 —— 参考 Obsidian / Typora / Logseq 风格。
 * 左侧 label（中文 / i18n），中间可编辑的数字输入框，右侧步进（+/−），
 * 最右侧单位（suffix）。
 *
 * 交互：
 * - onChange：每次数值变化 → 实时写 CSS 变量（视觉即时反馈，不落库）
 * - onComplete：用户失焦/回车/点击步进 → 触发 DB 持久化
 *
 * 数值 clamp 在 step/min/max 内；超出则按 max/min 截断。
 */
const TypoNumberRow = ({
  label,
  value,
  suffix,
  min,
  max,
  step,
  decimals,
  onChange,
  onComplete,
}: {
  label: string;
  value: number;
  suffix: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  onChange: (next: number) => void;
  onComplete: (next: number) => void | Promise<void>;
}) => {
  const [draft, setDraft] = useState<string>(value.toFixed(decimals));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value.toFixed(decimals));
  }, [value, decimals]);

  const clamp = (n: number) => Math.max(min, Math.min(max, n));

  const apply = (next: number) => {
    const clamped = clamp(Number.isFinite(next) ? next : value);
    setDraft(clamped.toFixed(decimals));
    onChange(clamped);
    return clamped;
  };

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="w-24 shrink-0 text-sm font-medium">{label}</div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          size="sm"
          value={draft}
          onFocus={() => { editing.current = true; }}
          onChange={e => {
            const raw = e.target.value; setDraft(raw);
            const number = Number(raw);
            if (raw.trim() && Number.isFinite(number) && number >= min && number <= max) onChange(number);
          }}
          onBlur={e => {
            editing.current = false;
            const next = parseFloat(e.target.value);
            const clamped = apply(Number.isFinite(next) ? next : value);
            void onComplete(clamped);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          }}
          min={min}
          max={max}
          step={step}
          className="w-20"
          classNames={{ input: 'text-right tabular-nums' }}
        />
        <div className="flex flex-col">
          <button
            type="button"
            aria-label="increment"
            onClick={() => {
              const next = clamp(value + step);
              setDraft(next.toFixed(decimals));
              onChange(next);
              void onComplete(next);
            }}
            className="text-default-500 hover:text-foreground hover:bg-default-100 rounded-t px-1 leading-none h-3.5"
          >
            <Icon icon="mdi:chevron-up" width="14" height="14" />
          </button>
          <button
            type="button"
            aria-label="decrement"
            onClick={() => {
              const next = clamp(value - step);
              setDraft(next.toFixed(decimals));
              onChange(next);
              void onComplete(next);
            }}
            className="text-default-500 hover:text-foreground hover:bg-default-100 rounded-b px-1 leading-none h-3.5"
          >
            <Icon icon="mdi:chevron-down" width="14" height="14" />
          </button>
        </div>
      </div>
      {suffix && <div className="text-xs text-default-500">{suffix}</div>}
    </div>
  );
};

export const PerferSetting = observer(({ section = 'appearance' }: { section?: 'appearance' | 'typography' | 'reading' | 'advanced' }) => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const base = RootStore.Get(BaseStore)
  const [textLength, setTextLength] = useState(blinko.config.value?.textFoldLength?.toString() || '1000');
  const [foldLength, setFoldLength] = useState(blinko.config.value?.cardFoldLength?.toString() || '300');
  const [maxHomePageWidth, setMaxHomePageWidth] = useState(blinko.config.value?.maxHomePageWidth?.toString() || '0');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(blinko.config.value?.customBackgroundUrl || '');
  const [signinFooterText, setSigninFooterText] = useState(blinko.config.value?.signinFooterText || '');
  const user = RootStore.Get(UserStore)

  // 全局排版：字号 12-20px / 字重 300-700 / 行高 1.0-2.5 / 段间距 0-30px /
  // 行宽 30-120ch / 首行缩进 0-4em / H1 18-40px / H2 16-36px / H3 14-32px /
  // 表格字号 12-20px（与正文同档）
  const [fontSize, setFontSize] = useState<number>(blinko.config.value?.fontSize ?? 16);
  const [fontWeight, setFontWeight] = useState<number>(blinko.config.value?.fontWeight ?? 400);
  const [lineHeight, setLineHeight] = useState<number>(blinko.config.value?.lineHeight ?? 1.6);
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(blinko.config.value?.paragraphSpacing ?? 8);
  const [lineWidthChars, setLineWidthChars] = useState<number>(blinko.config.value?.lineWidthChars ?? 60);
  const [firstLineIndentChars, setFirstLineIndentChars] = useState<number>(blinko.config.value?.firstLineIndentChars ?? 0);
  const [h1Size, setH1Size] = useState<number>(blinko.config.value?.h1Size ?? 26);
  const [h2Size, setH2Size] = useState<number>(blinko.config.value?.h2Size ?? 22);
  const [h3Size, setH3Size] = useState<number>(blinko.config.value?.h3Size ?? 20);
  const [tableSize, setTableSize] = useState<number>(blinko.config.value?.tableSize ?? 16);

  /** 与 store/user.ts 写入 :root 的默认值保持一致（除 fontWeight/lineHeight 默认 16/1.6 外其余为 UI 自行定的合理默认值） */
  const TYPOGRAPHY_DEFAULTS = {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.6,
    paragraphSpacing: 8,
    lineWidthChars: 60,
    firstLineIndentChars: 0,
    h1Size: 26,
    h2Size: 22,
    h3Size: 20,
    tableSize: 16,
  } as const;

  useEffect(() => {
    void blinko.config.call();
  }, []);

  useEffect(() => {
    setTextLength(blinko.config.value?.textFoldLength?.toString() || '1000');
    setFoldLength(blinko.config.value?.cardFoldLength?.toString() || '300');
    setMaxHomePageWidth(blinko.config.value?.maxHomePageWidth?.toString() || '0');
    setCustomBackgroundUrl(blinko.config.value?.customBackgroundUrl || '');
    setSigninFooterText(blinko.config.value?.signinFooterText || '');
    setFontSize(blinko.config.value?.fontSize ?? TYPOGRAPHY_DEFAULTS.fontSize);
    setFontWeight(blinko.config.value?.fontWeight ?? TYPOGRAPHY_DEFAULTS.fontWeight);
    setLineHeight(blinko.config.value?.lineHeight ?? TYPOGRAPHY_DEFAULTS.lineHeight);
    setParagraphSpacing(blinko.config.value?.paragraphSpacing ?? TYPOGRAPHY_DEFAULTS.paragraphSpacing);
    setLineWidthChars(blinko.config.value?.lineWidthChars ?? TYPOGRAPHY_DEFAULTS.lineWidthChars);
    setFirstLineIndentChars(blinko.config.value?.firstLineIndentChars ?? TYPOGRAPHY_DEFAULTS.firstLineIndentChars);
    setH1Size(blinko.config.value?.h1Size ?? TYPOGRAPHY_DEFAULTS.h1Size);
    setH2Size(blinko.config.value?.h2Size ?? TYPOGRAPHY_DEFAULTS.h2Size);
    setH3Size(blinko.config.value?.h3Size ?? TYPOGRAPHY_DEFAULTS.h3Size);
    setTableSize(blinko.config.value?.tableSize ?? TYPOGRAPHY_DEFAULTS.tableSize);
  }, [blinko.config.value]);

  /** 把单条排版变量写到根元素（视觉实时反馈），单条不影响其它项 */
  const setTypographyVar = (name: string, value: string) => {
    for (const el of document.querySelectorAll<HTMLElement>('.dark, .light')) {
      el.style.setProperty(name, value);
    }
  };

  /** 拖动时一次性写完全部 typography 变量（统一即时反馈，避免逐条重写时短暂回弹） */
  const applyTypographyPreviewAll = () => {
    for (const el of document.querySelectorAll<HTMLElement>('.dark, .light')) {
      el.style.setProperty('--app-font-size', `${fontSize}px`);
      el.style.setProperty('--app-font-weight', String(fontWeight));
      el.style.setProperty('--app-line-height', String(lineHeight));
      el.style.setProperty('--app-paragraph-spacing', `${paragraphSpacing}px`);
      el.style.setProperty('--app-line-width', `${lineWidthChars}ch`);
      el.style.setProperty('--app-first-line-indent', `${firstLineIndentChars}em`);
      el.style.setProperty('--app-h1-size', `${h1Size}px`);
      el.style.setProperty('--app-h2-size', `${h2Size}px`);
      el.style.setProperty('--app-h3-size', `${h3Size}px`);
      el.style.setProperty('--app-table-size', `${tableSize}px`);
    }
  };

  /**
   * 把当前面板上 10 个 typography state 落库。
   * 单一 Promise.all — 单键顺序写会触发 10 次 config 拉取，合并减少网络往返。
   * 所有更新均走 UserStore 的写入路径，与既有 fontSize/fontWeight 写法一致。
   */
  const saveTypography = async () => {
    await Promise.all([
      api.config.update.mutate({ key: 'fontSize', value: fontSize }),
      api.config.update.mutate({ key: 'fontWeight', value: fontWeight }),
      api.config.update.mutate({ key: 'lineHeight', value: lineHeight }),
      api.config.update.mutate({ key: 'paragraphSpacing', value: paragraphSpacing }),
      api.config.update.mutate({ key: 'lineWidthChars', value: lineWidthChars }),
      api.config.update.mutate({ key: 'firstLineIndentChars', value: firstLineIndentChars }),
      api.config.update.mutate({ key: 'h1Size', value: h1Size }),
      api.config.update.mutate({ key: 'h2Size', value: h2Size }),
      api.config.update.mutate({ key: 'h3Size', value: h3Size }),
      api.config.update.mutate({ key: 'tableSize', value: tableSize }),
    ]);
    blinko.config.call();
  };

  /** 把所有 typography state 重置为默认值（UI 状态 + 视觉变量 + 持久化） */
  const restoreTypographyDefaults = async () => {
    setFontSize(TYPOGRAPHY_DEFAULTS.fontSize);
    setFontWeight(TYPOGRAPHY_DEFAULTS.fontWeight);
    setLineHeight(TYPOGRAPHY_DEFAULTS.lineHeight);
    setParagraphSpacing(TYPOGRAPHY_DEFAULTS.paragraphSpacing);
    setLineWidthChars(TYPOGRAPHY_DEFAULTS.lineWidthChars);
    setFirstLineIndentChars(TYPOGRAPHY_DEFAULTS.firstLineIndentChars);
    setH1Size(TYPOGRAPHY_DEFAULTS.h1Size);
    setH2Size(TYPOGRAPHY_DEFAULTS.h2Size);
    setH3Size(TYPOGRAPHY_DEFAULTS.h3Size);
    setTableSize(TYPOGRAPHY_DEFAULTS.tableSize);
    // 立即把视觉反馈刷成默认，再落库
    setTimeout(() => {
      for (const el of document.querySelectorAll<HTMLElement>('.dark, .light')) {
        el.style.setProperty('--app-font-size', `${TYPOGRAPHY_DEFAULTS.fontSize}px`);
        el.style.setProperty('--app-font-weight', String(TYPOGRAPHY_DEFAULTS.fontWeight));
        el.style.setProperty('--app-line-height', String(TYPOGRAPHY_DEFAULTS.lineHeight));
        el.style.setProperty('--app-paragraph-spacing', `${TYPOGRAPHY_DEFAULTS.paragraphSpacing}px`);
        el.style.setProperty('--app-line-width', `${TYPOGRAPHY_DEFAULTS.lineWidthChars}ch`);
        el.style.setProperty('--app-first-line-indent', `${TYPOGRAPHY_DEFAULTS.firstLineIndentChars}em`);
        el.style.setProperty('--app-h1-size', `${TYPOGRAPHY_DEFAULTS.h1Size}px`);
        el.style.setProperty('--app-h2-size', `${TYPOGRAPHY_DEFAULTS.h2Size}px`);
        el.style.setProperty('--app-h3-size', `${TYPOGRAPHY_DEFAULTS.h3Size}px`);
        el.style.setProperty('--app-table-size', `${TYPOGRAPHY_DEFAULTS.tableSize}px`);
      }
    }, 0);
    await Promise.all([
      api.config.update.mutate({ key: 'fontSize', value: TYPOGRAPHY_DEFAULTS.fontSize }),
      api.config.update.mutate({ key: 'fontWeight', value: TYPOGRAPHY_DEFAULTS.fontWeight }),
      api.config.update.mutate({ key: 'lineHeight', value: TYPOGRAPHY_DEFAULTS.lineHeight }),
      api.config.update.mutate({ key: 'paragraphSpacing', value: TYPOGRAPHY_DEFAULTS.paragraphSpacing }),
      api.config.update.mutate({ key: 'lineWidthChars', value: TYPOGRAPHY_DEFAULTS.lineWidthChars }),
      api.config.update.mutate({ key: 'firstLineIndentChars', value: TYPOGRAPHY_DEFAULTS.firstLineIndentChars }),
      api.config.update.mutate({ key: 'h1Size', value: TYPOGRAPHY_DEFAULTS.h1Size }),
      api.config.update.mutate({ key: 'h2Size', value: TYPOGRAPHY_DEFAULTS.h2Size }),
      api.config.update.mutate({ key: 'h3Size', value: TYPOGRAPHY_DEFAULTS.h3Size }),
      api.config.update.mutate({ key: 'tableSize', value: TYPOGRAPHY_DEFAULTS.tableSize }),
    ]);
    blinko.config.call();
  };

  return <div className="flex flex-col gap-6">
    {/* ============ 外观与语言 ============ */}
    {section === 'appearance' && (<SettingSection
      icon="solar:palette-outline"
      title={t('appearance-and-language')}
      desc={t('appearance-and-language-desc')}
    >
      <Item
        leftContent={<ItemLabel title={t('theme')} desc={t('theme-desc')} />}
        rightContent={<ThemeSwitcher onChange={async value => {
          return await PromiseCall(api.config.update.mutate({
            key: 'theme',
            value: value
          }))
        }} />} />
      <Item
        leftContent={<ItemLabel title={t('theme-color')} desc={t('theme-color-desc')} />}
        rightContent={<ThemeColor
          value={blinko.config.value?.themeColor}
          onChange={saveThemeColor}
        />} />
      <Item
        leftContent={<ItemLabel title={t('language')} desc={t('language-desc')} />}
        rightContent={<LanguageSwitcher value={blinko.config.value?.language} onChange={value => {
          PromiseCall(api.config.update.mutate({
            key: 'language',
            value: value
          }))
        }} />} />
      <Item
        leftContent={<ItemLabel title={t('default-home-page')} />}
        rightContent={
          <SelectDropdown
            value={blinko.config.value?.defaultHomePage}
            placeholder={t('select-default-home-page')}
            options={base.routerList
              .filter(route => route.href === '/' || route.href.startsWith('/?path='))
              .map(route => ({
                key: route.href === '/' ? 'blinko' : route.href.split('=')[1],
                label: t(route.title)
              }))}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'defaultHomePage',
                value: value
              }))
            }}
          />
        } />
      <Item
        leftContent={<ItemLabel title={t('close-background-animation')} />}
        rightContent={
          <Tooltip content={<GradientBackground className="rounded-lg w-[200px] h-[100px]">
            <div ></div>
          </GradientBackground>}>
            <Switch
              isSelected={blinko.config.value?.isCloseBackgroundAnimation}
              onChange={e => {
                PromiseCall(api.config.update.mutate({
                  key: 'isCloseBackgroundAnimation',
                  value: e.target.checked
                }))
              }}
            />
          </Tooltip>
        } />
    </SettingSection>)}

    {/* ============ 全局排版 ============ */}
    {section === 'typography' && (<SettingSection
      icon="fluent:text-font-24-regular"
      title={t('global-typography')}
      desc={t('global-typography-desc')}
    >
      {/* 字体 */}
      <Item
        leftContent={<ItemLabel title={t('font-style')} desc={t('font-style-desc')} />}
        rightContent={
          <FontSwitcher fontname={blinko.config.value?.fontStyle} onChange={async fontname => {
            await PromiseCall(api.config.update.mutate({
              key: 'fontStyle',
              value: fontname
            }))
            // Refresh config to update UI
            await blinko.config.call()
          }} />
        }
      />

      {/* 行高 / 段间距 / 行宽 / 首行缩进 — 走「行内格子 + 步进按钮」样式，参考排版面板设计 */}
      <TypoNumberRow
        label={t('line-height')}
        value={lineHeight}
        suffix=""
        min={1.0}
        max={2.5}
        step={0.1}
        decimals={2}
        onChange={(next) => {
          setLineHeight(next);
          setTypographyVar('--app-line-height', String(next));
        }}
        onComplete={async (next) => {
          setLineHeight(next);
          await api.config.update.mutate({ key: 'lineHeight', value: next });
          blinko.config.call();
        }}
      />
      <TypoNumberRow
        label={t('paragraph-spacing')}
        value={paragraphSpacing}
        suffix="px"
        min={0}
        max={30}
        step={1}
        decimals={0}
        onChange={(next) => {
          setParagraphSpacing(next);
          setTypographyVar('--app-paragraph-spacing', `${next}px`);
        }}
        onComplete={async (next) => {
          setParagraphSpacing(next);
          await api.config.update.mutate({ key: 'paragraphSpacing', value: next });
          blinko.config.call();
        }}
      />
      <TypoNumberRow
        label={t('line-width-chars')}
        value={lineWidthChars}
        suffix={t('chars')}
        min={30}
        max={120}
        step={1}
        decimals={0}
        onChange={(next) => {
          setLineWidthChars(next);
          setTypographyVar('--app-line-width', `${next}ch`);
        }}
        onComplete={async (next) => {
          setLineWidthChars(next);
          await api.config.update.mutate({ key: 'lineWidthChars', value: next });
          blinko.config.call();
        }}
      />
      <TypoNumberRow
        label={t('first-line-indent')}
        value={firstLineIndentChars}
        suffix={t('chars')}
        min={0}
        max={4}
        step={1}
        decimals={0}
        onChange={(next) => {
          setFirstLineIndentChars(next);
          setTypographyVar('--app-first-line-indent', `${next}em`);
        }}
        onComplete={async (next) => {
          setFirstLineIndentChars(next);
          await api.config.update.mutate({ key: 'firstLineIndentChars', value: next });
          blinko.config.call();
        }}
      />

      {/* 一级 / 二级 / 三级标题字号 */}
      <TypoNumberRow
        label={t('h1-size')}
        value={h1Size}
        suffix="px"
        min={18}
        max={40}
        step={1}
        decimals={0}
        onChange={(next) => {
          setH1Size(next);
          setTypographyVar('--app-h1-size', `${next}px`);
        }}
        onComplete={async (next) => {
          setH1Size(next);
          await api.config.update.mutate({ key: 'h1Size', value: next });
          blinko.config.call();
        }}
      />
      <TypoNumberRow
        label={t('h2-size')}
        value={h2Size}
        suffix="px"
        min={16}
        max={36}
        step={1}
        decimals={0}
        onChange={(next) => {
          setH2Size(next);
          setTypographyVar('--app-h2-size', `${next}px`);
        }}
        onComplete={async (next) => {
          setH2Size(next);
          await api.config.update.mutate({ key: 'h2Size', value: next });
          blinko.config.call();
        }}
      />
      <TypoNumberRow
        label={t('h3-size')}
        value={h3Size}
        suffix="px"
        min={14}
        max={32}
        step={1}
        decimals={0}
        onChange={(next) => {
          setH3Size(next);
          setTypographyVar('--app-h3-size', `${next}px`);
        }}
        onComplete={async (next) => {
          setH3Size(next);
          await api.config.update.mutate({ key: 'h3Size', value: next });
          blinko.config.call();
        }}
      />

      {/* 正文 + 字重（保留旧版的 Slider，因为有 5 个 marks；样式不变） */}
      <div className="flex items-center gap-4 py-3">
        <div className="w-24 shrink-0 text-sm font-medium">{t('body-size')}</div>
        <Slider
          size="sm"
          minValue={12}
          maxValue={20}
          step={1}
          value={fontSize}
          aria-label={t('body-size')}
          onChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontSize(next);
            setTypographyVar('--app-font-size', `${next}px`);
          }}
          onChangeEnd={async (v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontSize(next);
            await api.config.update.mutate({ key: 'fontSize', value: next });
            blinko.config.call();
          }}
          className="flex-1"
          classNames={{ track: '!bg-default-300/50', filler: '!bg-primary', thumb: '!bg-primary !shadow-small' }}
        />
        <div className="w-14 text-right text-sm tabular-nums text-default-500">{fontSize}px</div>
      </div>
      <div className="flex items-center gap-4 py-3">
        <div className="w-24 shrink-0 text-sm font-medium">{t('font-weight')}</div>
        <Slider
          size="sm"
          minValue={300}
          maxValue={700}
          step={100}
          value={fontWeight}
          aria-label={t('font-weight')}
          onChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontWeight(next);
            setTypographyVar('--app-font-weight', String(next));
          }}
          onChangeEnd={async (v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontWeight(next);
            await api.config.update.mutate({ key: 'fontWeight', value: next });
            blinko.config.call();
          }}
          className="flex-1"
          marks={[
            { value: 300, label: '300' },
            { value: 400, label: '400' },
            { value: 500, label: '500' },
            { value: 600, label: '600' },
            { value: 700, label: '700' },
          ]}
          classNames={{ track: '!bg-default-300/50', filler: '!bg-primary', thumb: '!bg-primary !shadow-small' }}
        />
        <div className="w-14 text-right text-sm tabular-nums text-default-500">{fontWeight}</div>
      </div>

      {/* 表格字号 */}
      <TypoNumberRow
        label={t('table-size')}
        value={tableSize}
        suffix="px"
        min={12}
        max={20}
        step={1}
        decimals={0}
        onChange={(next) => {
          setTableSize(next);
          setTypographyVar('--app-table-size', `${next}px`);
        }}
        onComplete={async (next) => {
          setTableSize(next);
          await api.config.update.mutate({ key: 'tableSize', value: next });
          blinko.config.call();
        }}
      />

      {/* 实时预览 */}
      <div className="py-3">
        <div
          className="rounded-xl border border-default-200 bg-default-50 px-4 py-3.5 markdown-body"
          style={{
            '--app-font-size': `${fontSize}px`, '--app-font-weight':fontWeight,
            '--app-line-height':lineHeight, '--app-paragraph-spacing':`${paragraphSpacing}px`,
            '--app-line-width':`${lineWidthChars}ch`, '--app-first-line-indent':`${firstLineIndentChars}em`,
            '--app-h1-size':`${h1Size}px`, '--app-h2-size':`${h2Size}px`, '--app-h3-size':`${h3Size}px`, '--app-table-size':`${tableSize}px`,
            maxWidth:`min(${lineWidthChars}ch, 100%)`, marginInline:'auto',
            fontSize: `${fontSize}px`,
            fontWeight: fontWeight,
            lineHeight: lineHeight,
            transition: 'font-size .15s ease, font-weight .15s ease, line-height .15s ease',
          } as React.CSSProperties}
        >
          <h1 style={{ fontSize: `${h1Size}px`, margin: '0 0 4px' }}># {t('h1-preview-title')}</h1>
          <h2 style={{ fontSize: `${h2Size}px`, margin: '0 0 4px' }}>## {t('h2-preview-title')}</h2>
          <h3 style={{ fontSize: `${h3Size}px`, margin: '0 0 4px' }}>### {t('h3-preview-title')}</h3>
          <p style={{ fontSize:`${fontSize}px`, fontWeight, lineHeight, textIndent:`${firstLineIndentChars}em`, marginBottom: `${paragraphSpacing}px` }}>{t('typography-preview-text')}</p>
          <p style={{ fontSize:`${fontSize}px`, fontWeight, lineHeight, textIndent:`${firstLineIndentChars}em`, marginBottom: `${paragraphSpacing}px` }}>{t('typography-preview-text-2')}</p>
          <table style={{ fontSize: `${tableSize}px`, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--desc, #ccc)' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('table-col-a')}</th>
                <th style={{ textAlign: 'left', padding: '4px 8px' }}>{t('table-col-b')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '4px 8px' }}>{t('table-row-1')}</td>
                <td style={{ padding: '4px 8px' }}>{t('table-row-2')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 恢复默认 */}
      <div className="flex justify-end py-3">
        <Button
          size="sm"
          variant="flat"
          color="default"
          onPress={restoreTypographyDefaults}
        >
          {t('restore-defaults')}
        </Button>
      </div>
    </SettingSection>)}

    {/* ============ 导航与阅读 ============ */}
    {section === 'reading' && (<SettingSection
      icon="solar:route-linear"
      title={t('navigation-and-reading')}
      desc={t('navigation-and-reading-desc')}
    >
      <Item
        leftContent={<ItemLabel title={t('show-navigation-bar-on-mobile')} desc={t('show-navigation-bar-on-mobile-desc')} />}
        rightContent={<Switch
          isSelected={blinko.config.value?.isHiddenMobileBar}
          onChange={e => {
            PromiseCall(api.config.update.mutate({
              key: 'isHiddenMobileBar',
              value: e.target.checked
            }))
          }}
        />} />
      <Item
        leftContent={<ItemLabel title={t('hide-notification')} desc={t('hide-notification-desc')} />}
        rightContent={<Switch
          isSelected={blinko.config.value?.isHiddenNotification}
          onChange={e => {
            PromiseCall(api.config.update.mutate({
              key: 'isHiddenNotification',
              value: e.target.checked
            }))
          }}
        />} />
      <Item
        leftContent={<ItemLabel title={t('hide-comments-in-card')} desc={t('hide-comments-in-card-desc')} />}
        rightContent={<Switch
          isSelected={blinko.config.value?.isHideCommentInCard}
          onChange={e => {
            PromiseCall(api.config.update.mutate({
              key: 'isHideCommentInCard',
              value: e.target.checked
            }))
          }}
        />} />
      <Item
        leftContent={<ItemLabel title={t('order-by-create-time')} />}
        rightContent={<Switch
          isSelected={blinko.config.value?.isOrderByCreateTime}
          onChange={e => {
            PromiseCall(api.config.update.mutate({
              key: 'isOrderByCreateTime',
              value: e.target.checked
            }))
          }}
        />} />
      <Item
        leftContent={<ItemLabel title={t('max-home-page-width')} desc={t('max-home-page-width-tip')} />}
        rightContent={
          <div className="flex items-center gap-2">
            <Input
              type="number"
              size='sm'
              className='w-20'
              value={maxHomePageWidth}
              onChange={e => setMaxHomePageWidth(e.target.value)}
              onBlur={e => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  PromiseCall(api.config.update.mutate({
                    key: 'maxHomePageWidth',
                    value: value
                  }));
                }
              }}
              min={0}
            />
            <span className="text-sm text-default-400">px</span>
          </div>
        }
      />
      <Item
        leftContent={<ItemLabel title={t('card-fold-length')} desc={t('card-fold-length-desc')} />}
        rightContent={
          <div className="flex items-center gap-2">
            <Input
              type="number"
              size='sm'
              className='w-20'
              value={foldLength}
              onChange={e => setFoldLength(e.target.value)}
              onBlur={e => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  PromiseCall(api.config.update.mutate({
                    key: 'cardFoldLength',
                    value: value
                  }));
                }
              }}
              min={0}
            />
            <span className="text-sm text-default-400">{t('chars')}</span>
          </div>
        }
      />
      <Item
        leftContent={<ItemLabel title={t('text-fold-length')} desc={t('text-fold-length-desc')} />}
        rightContent={
          <div className="flex items-center gap-2">
            <Input
              type="number"
              size='sm'
              className='w-20'
              value={textLength}
              onChange={e => setTextLength(e.target.value)}
              onBlur={e => {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                  PromiseCall(api.config.update.mutate({
                    key: 'textFoldLength',
                    value: value
                  }));
                }
              }}
              min={0}
            />
            <span className="text-sm text-default-400">{t('chars')}</span>
          </div>
        }
      />
      <Item
        leftContent={<ItemLabel title={t('close-daily-review')} />}
        rightContent={
          <Switch
            isSelected={blinko.config.value?.isCloseDailyReview}
            onChange={e => {
              PromiseCall(api.config.update.mutate({
                key: 'isCloseDailyReview',
                value: e.target.checked
              }))
            }}
          />
        } />
      <Item
        type={isPc ? 'row' : 'col'}
        leftContent={<ItemLabel title={t('device-card-columns')} desc={t('columns-for-different-devices')} />}
        rightContent={<div className="flex gap-2 w-full justify-end">
          <SelectDropdown
            value={blinko.config.value?.smallDeviceCardColumns}
            placeholder={t('mobile')}
            icon="proicons:phone"
            options={[
              { key: "1", label: "1" },
              { key: "2", label: "2" }
            ]}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'smallDeviceCardColumns',
                value: value
              }))
            }}
          />
          <SelectDropdown
            value={blinko.config.value?.mediumDeviceCardColumns}
            placeholder={t('tablet')}
            icon="tabler:device-ipad"
            options={[
              { key: "1", label: "1" },
              { key: "2", label: "2" },
              { key: "3", label: "3" },
              { key: "4", label: "4" },
            ]}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'mediumDeviceCardColumns',
                value: value
              }))
            }}
          />
          <SelectDropdown
            value={blinko.config.value?.largeDeviceCardColumns}
            placeholder={t('desktop')}
            icon="ic:outline-tv"
            options={[
              { key: "1", label: "1" },
              { key: "2", label: "2" },
              { key: "3", label: "3" },
              { key: "4", label: "4" },
              { key: "5", label: "5" },
              { key: "6", label: "6" },
              { key: "7", label: "7" },
              { key: "8", label: "8" },
            ]}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'largeDeviceCardColumns',
                value: value
              }))
            }}
          />
        </div>}
      />
    </SettingSection>)}

    {/* ============ 内容显示 ============ */}
    {section === 'reading' && (<SettingSection
      icon="solar:document-add-outline"
      title={t('content-display')}
      desc={t('content-display-desc')}
    >
      <Item
        leftContent={<ItemLabel title={t('page-size')} desc={t('page-size-desc')} />}
        rightContent={
          <Input
            type="number"
            size="sm"
            min="10"
            max="100"
            className="w-24"
            value={PageSize.value}
            onChange={e => {
              PageSize.save(Number(e.target.value))
            }}
          />
        } />
      <Item
        leftContent={<ItemLabel title={t('time-format')} />}
        rightContent={
          <SelectDropdown
            value={blinko.config.value?.timeFormat}
            placeholder={t('select-a-time-format')}
            icon="mingcute:time-line"
            options={[
              { key: "relative", label: "1 seconds ago" },
              { key: "YYYY-MM-DD", label: "2024-01-01" },
              { key: "YYYY-MM-DD HH:mm", label: "2024-01-01 15:30" },
              { key: "HH:mm", label: "15:30" },
              { key: "YYYY-MM-DD HH:mm:ss", label: "2024-01-01 15:30:45" },
              { key: "MM-DD HH:mm", label: "03-20 15:30" },
              { key: "MMM DD, YYYY", label: "Mar 20, 2024" },
              { key: "MMM DD, YYYY HH:mm", label: "Mar 20, 2024 15:30" },
              { key: "YYYY-MM-DD, dddd", label: "2024-01-01, Monday" },
              { key: "dddd, MMM DD, YYYY", label: "Monday, Mar 20, 2024" },
            ]}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'timeFormat',
                value: value
              }))
            }}
          />
        } />
      <Item
        leftContent={<ItemLabel title={t('toolbar-visibility')} />}
        rightContent={
          <SelectDropdown
            value={blinko.config.value?.toolbarVisibility}
            placeholder={t('select-toolbar-visibility')}
            icon="mdi:tune"
            options={[
              { key: "always-show-toolbar", label: t('always-show-toolbar') },
              { key: "hide-toolbar-on-mobile", label: t('hide-toolbar-on-mobile') },
              { key: "always-hide-toolbar", label: t('always-hide-toolbar') }
            ]}
            onChange={async (value) => {
              await PromiseCall(api.config.update.mutate({
                key: 'toolbarVisibility',
                value: value
              }))
            }}
          />
        } />
      <Item
        leftContent={<ItemLabel title={t('use-blinko-hub')} desc={t('use-blinko-hub-desc')} />}
        rightContent={
          <Switch
            isSelected={blinko.config.value?.isUseBlinkoHub}
            onChange={async e => {
              await PromiseCall(api.config.update.mutate({
                key: 'isUseBlinkoHub',
                value: e.target.checked
              }))
              window.location.reload()
            }}
          />
        } />
    </SettingSection>)}

    {/* ============ 高级（管理员） ============ */}
    {
      user.isSuperAdmin && section === 'advanced' && (<SettingSection
          icon="solar:shield-keyhole-minimalistic-linear"
          title={t('advanced')}
          desc={t('advanced-desc')}
        >
          <SiteBrandingSettings />
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={<ItemLabel title={t('custom-background-url')} desc={t('custom-bg-tip')} />}
            rightContent={<Input
              className="w-full md:w-[400px]"
              placeholder="https://www.shadergradient.co/customize?"
              type="text"
              value={customBackgroundUrl}
              onChange={e => {
                setCustomBackgroundUrl(e.target.value)
              }}
              onBlur={e => {
                PromiseCall(api.config.update.mutate({
                  key: 'customBackgroundUrl',
                  value: customBackgroundUrl
                }), { autoAlert: false })
              }} />} />
          <Item
            leftContent={<ItemLabel title={t('enable-signin-footer')} />}
            rightContent={
              <Switch
                isSelected={blinko.config.value?.signinFooterEnabled ?? false}
                onChange={async (e) => {
                  await PromiseCall(api.config.update.mutate({
                    key: 'signinFooterEnabled',
                    value: e.target.checked
                  }));
                  blinko.config.call();
                }}
              />
            }
          />
          <Item
            type="col"
            leftContent={<ItemLabel title={t('signin-footer-text')} desc={t('signin-footer-desc')} />}
            rightContent={
              <Textarea
                radius="lg"
                minRows={3}
                maxRows={8}
                maxLength={1000}
                value={signinFooterText}
                onChange={(e) => setSigninFooterText(e.target.value)}
                onBlur={async () => {
                  await PromiseCall(api.config.update.mutate({
                    key: 'signinFooterText',
                    value: signinFooterText
                  }));
                  blinko.config.call();
                }}
                placeholder={t('signin-footer-placeholder')}
                className="w-full"
              />
            }
          />
        </SettingSection>
      )
    }
  </div>
})
