import { observer } from "mobx-react-lite";
import { Switch, Input, Tooltip, Textarea, Slider } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { Item, ItemWithTooltip, SelectDropdown } from "./Item";
import ThemeSwitcher from "../Common/Theme/ThemeSwitcher";
import { ThemeColor } from "../Common/Theme/ThemeColor";
import LanguageSwitcher from "../Common/LanguageSwitcher";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PageSize, PromiseCall } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { CollapsibleCard } from "../Common/CollapsibleCard";
import { GradientBackground } from "../Common/GradientBackground";
import { UserStore } from "@/store/user";
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
      <div className="rounded-xl bg-content1 heo-shadow-card px-4 py-1 divide-y divide-default-100">
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

export const PerferSetting = observer(() => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const base = RootStore.Get(BaseStore)
  const [textLength, setTextLength] = useState(blinko.config.value?.textFoldLength?.toString() || '500');
  const [maxHomePageWidth, setMaxHomePageWidth] = useState(blinko.config.value?.maxHomePageWidth?.toString() || '0');
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState(blinko.config.value?.customBackgroundUrl || '');
  const [signinFooterText, setSigninFooterText] = useState(blinko.config.value?.signinFooterText || '');
  const [customTitle, setCustomTitle] = useState(blinko.config.value?.customTitle || '');
  const user = RootStore.Get(UserStore)

  // 全局排版：字号 12-20px / 字重 300-700
  const [fontSize, setFontSize] = useState<number>(blinko.config.value?.fontSize ?? 16);
  const [fontWeight, setFontWeight] = useState<number>(blinko.config.value?.fontWeight ?? 400);

  useEffect(() => {
    blinko.config.call();
    setTextLength(blinko.config.value?.textFoldLength?.toString() || '500');
    setMaxHomePageWidth(blinko.config.value?.maxHomePageWidth?.toString() || '0');
    setCustomBackgroundUrl(blinko.config.value?.customBackgroundUrl || '');
    setSigninFooterText(blinko.config.value?.signinFooterText || '');
    setCustomTitle(blinko.config.value?.customTitle || '');
    setFontSize(blinko.config.value?.fontSize ?? 16);
    setFontWeight(blinko.config.value?.fontWeight ?? 400);
  }, [blinko.config.value]);

  /** 拖动时即时把变量写到根元素（视觉实时反馈），写库由 onChangeEnd 负责 */
  const applyTypographyPreview = (size: number, weight: number) => {
    for (const el of document.querySelectorAll<HTMLElement>('.dark, .light')) {
      el.style.setProperty('--app-font-size', `${size}px`);
      el.style.setProperty('--app-font-weight', String(weight));
    }
  };

  const saveTypography = async (size: number, weight: number) => {
    await Promise.all([
      api.config.update.mutate({ key: 'fontSize', value: size }),
      api.config.update.mutate({ key: 'fontWeight', value: weight }),
    ]);
    blinko.config.call();
  };

  return <CollapsibleCard
    icon="tabler:brush"
    title={t('preference')}
  >
    {/* ============ 外观与语言 ============ */}
    <SettingSection
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
          onChange={async (background, foreground) => {
            await PromiseCall(api.config.update.mutate({
              key: 'themeColor',
              value: background
            }), { autoAlert: false })
            await PromiseCall(api.config.update.mutate({
              key: 'themeForegroundColor',
              value: foreground
            }))

            const darkElement = document.querySelector('.dark')
            if (darkElement) {
              //@ts-ignore
              darkElement.style.setProperty('--primary', background || "#f9f9f9")
              //@ts-ignore
              darkElement.style.setProperty('--primary-foreground', foreground || "#000000")
            }

            const lightElement = document.querySelector('.light')
            if (lightElement) {
              //@ts-ignore
              lightElement.style.setProperty('--primary', background || "black")
              //@ts-ignore
              lightElement.style.setProperty('--primary-foreground', foreground || "hsl(210 40% 98%)")
            }
          }}
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
    </SettingSection>

    {/* ============ 全局排版 ============ */}
    <SettingSection
      icon="fluent:text-font-24-regular"
      title={t('global-typography')}
      desc={t('global-typography-desc')}
    >
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
      {/* 字号 */}
      <div className="flex items-center gap-4 py-3">
        <div className="w-16 shrink-0 text-sm font-medium">{t('font-size')}</div>
        <Slider
          size="sm"
          minValue={12}
          maxValue={20}
          step={1}
          value={fontSize}
          onChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontSize(next);
            applyTypographyPreview(next, fontWeight);
          }}
          onChangeEnd={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            saveTypography(next, fontWeight);
          }}
          className="flex-1"
          classNames={{ track: '!bg-default-300/50', filler: '!bg-primary', thumb: '!bg-primary !shadow-small' }}
        />
        <div className="w-12 text-right text-sm tabular-nums text-default-500">{fontSize}px</div>
      </div>
      {/* 字重 */}
      <div className="flex items-center gap-4 py-3">
        <div className="w-16 shrink-0 text-sm font-medium">{t('font-weight')}</div>
        <Slider
          size="sm"
          minValue={300}
          maxValue={700}
          step={100}
          value={fontWeight}
          onChange={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            setFontWeight(next);
            applyTypographyPreview(fontSize, next);
          }}
          onChangeEnd={(v) => {
            const next = Array.isArray(v) ? v[0] : v;
            saveTypography(fontSize, next);
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
        <div className="w-12 text-right text-sm tabular-nums text-default-500">{fontWeight}</div>
      </div>
      {/* 实时预览 */}
      <div className="py-3">
        <div
          className="rounded-xl border border-default-200 bg-default-50 dark:bg-default-100 px-4 py-3.5 select-none"
          style={{ fontSize: `${fontSize}px`, fontWeight: fontWeight, lineHeight: 1.6, transition: 'font-size .15s ease, font-weight .15s ease' }}
        >
          {t('typography-preview-text')}
        </div>
      </div>
    </SettingSection>

    {/* ============ 导航与阅读 ============ */}
    <SettingSection
      icon="solar:routes-linear"
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
    </SettingSection>

    {/* ============ 内容显示 ============ */}
    <SettingSection
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
            icon="mdi:toolbar"
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
    </SettingSection>

    {/* ============ 高级（管理员） ============ */}
    {
      user.isSuperAdmin && (
        <SettingSection
          icon="solar:shield-keyhole-minimalistic-linear"
          title={t('advanced')}
          desc={t('advanced-desc')}
        >
          <Item
            type={isPc ? 'row' : 'col'}
            leftContent={<ItemLabel title={t('custom-title')} desc={t('custom-title-tip')} />}
            rightContent={<Input
              className="w-full md:w-[400px]"
              placeholder={t('custom-title-placeholder')}
              type="text"
              maxLength={50}
              value={customTitle}
              onChange={e => {
                setCustomTitle(e.target.value)
              }}
              onBlur={async () => {
                const titleValue = customTitle.trim().slice(0, 50);
                setCustomTitle(titleValue);
                await PromiseCall(api.config.update.mutate({
                  key: 'customTitle',
                  value: titleValue
                }));
                blinko.config.call();
              }} />} />
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
  </CollapsibleCard>
})
