import { observer } from "mobx-react-lite";
import { Card, DropdownItem, DropdownMenu, DropdownTrigger, Dropdown, Select, SelectItem, Switch, Button, Input } from "@nextui-org/react";
import { useTranslation } from "react-i18next";
import { Item, ItemWithTooltip, SelectDropdown } from "./Item";
import ThemeSwitcher from "../Common/ThemeSwitcher";
import LanguageSwitcher from "../Common/LanguageSwitcher";
import { RootStore } from "@/store";
import { BlinkoStore } from "@/store/blinkoStore";
import { PageSize, PromiseCall } from "@/store/standard/PromiseState";
import { api } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { useMediaQuery } from "usehooks-ts";
import { Icon } from "@iconify/react";
import { CollapsibleCard } from "../Common/CollapsibleCard";

export const PerferSetting = observer(() => {
  const { t } = useTranslation()
  const isPc = useMediaQuery('(min-width: 768px)')
  const blinko = RootStore.Get(BlinkoStore)
  const [textLength, setTextLength] = useState(blinko.config.value?.textFoldLength?.toString() || '500');

  useEffect(() => {
    setTextLength(blinko.config.value?.textFoldLength?.toString() || '500');
  }, [blinko.config.value?.textFoldLength]);


  return <CollapsibleCard
    icon="tabler:brush"
    title={t('preference')}
  >
    <Item
      leftContent={<>{t('theme')}</>}
      rightContent={<ThemeSwitcher onChange={async value => {
        return await PromiseCall(api.config.update.mutate({
          key: 'theme',
          value: value
        }))
      }} />} />
    <Item
      leftContent={<>{t('language')}</>}
      rightContent={<LanguageSwitcher value={blinko.config.value?.language} onChange={value => {
        PromiseCall(api.config.update.mutate({
          key: 'language',
          value: value
        }))
      }} />} />
    <Item
      leftContent={<>{t('show-navigation-bar-on-mobile')}</>}
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
      leftContent={<>{t('order-by-create-time')}</>}
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
      leftContent={<ItemWithTooltip
        content={t('text-fold-length')}
        toolTipContent={<div className="w-[300px] flex gap-2 py-4 px-2">
          <div className="min-w-[80px] min-h-[80px] bg-default-100 rounded-lg"></div>
          <div className="flex flex-col gap-2 flex-1">
            <div className="text-md font-medium">{t('title-first-line-of-the-text')}</div>
            <div className="text-sm text-default-400 line-clamp-2">{t('content-rest-of-the-text-if-the-text-is-longer-than-the-length')}</div>
          </div>
        </div>}
      />}
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
      type={isPc ? 'row' : 'col'}
      leftContent={<ItemWithTooltip content={t('device-card-columns')} toolTipContent={<div className="w-[300px] flex flex-col gap-2">
        <div>{t('columns-for-different-devices')}</div>
      </div>} />}
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

    <Item
      leftContent={<>{t('time-format')}</>}
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
      leftContent={<>{t('page-size')}</>}
      rightContent={
        <Input
          type="number"
          min="30"
          max="100"
          value={PageSize.value}
          onChange={e => {
            PageSize.save(Number(e.target.value))
          }}
        />
      } />

    <Item
      leftContent={<>{t('toolbar-visibility')}</>}
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
  </CollapsibleCard>
})