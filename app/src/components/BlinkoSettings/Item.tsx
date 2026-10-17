import { useContext, useState } from 'react';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { SettingsCardContext } from '../Common/CollapsibleCard';
import { Icon } from '@/components/Common/Iconify/icons';
import { Button, DropdownTrigger, DropdownItem, DropdownMenu, Dropdown, Tooltip } from "@heroui/react";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";

type IProps = {
  leftContent?: any
  rightContent?: any
  type?: 'row' | 'col'
  hidden?: boolean
  className?: string
}


export const Item = observer(({ leftContent, rightContent, type = 'row', hidden = false, className }: IProps) => {
  const settingsMode = useContext(SettingsCardContext);
  if (hidden) return null
  if (type == 'col') {
    return <div className={`flex flex-col py-2 ${settingsMode ? 'settings-item' : ''} ${className ?? ''}`}>
      <div className={settingsMode ? "settings-item-label" : "font-semibold"}>{leftContent}</div>
      <div className="mt-2 w-full">{rightContent}</div>
    </div>
  } else {
    return <div className={`flex flex-row items-center py-2 ${settingsMode ? 'settings-item' : ''} ${className ?? ''}`}>
      {!!leftContent && <div className={rightContent ? (settingsMode ? "settings-item-label" : "font-semibold") : 'w-full'}>{leftContent}</div>}
      {!!rightContent && <div className={settingsMode ? "settings-item-control" : "ml-auto"}>{rightContent}</div>}
    </div>
  }
})


export const ItemWithTooltip = observer(({ content, toolTipContent }: { content: any, toolTipContent: any }) => {
  return  <Tooltip content={<div className="max-w-[300px] flex flex-col gap-2 p-2">
      {toolTipContent}
    </div>}>
      <div className="flex items-center gap-2">
        {content}
        <Icon icon="proicons:info" width="18" height="18" />
      </div>
    </Tooltip>
})


interface SelectDropdownProps {
  value?: string
  placeholder?: string
  icon?: string
  options: Array<{
    key: string
    label: string
  }>
  onChange: (value: string) => void | Promise<void>
}
export const SelectDropdown = ({
  value,
  placeholder,
  icon,
  options,
  onChange
}: SelectDropdownProps) => {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false);
  const selected = options.find(option => option.key === value);
  return (
    <Dropdown placement="bottom-end">
      <DropdownTrigger>
        <Button
          variant="bordered" size="sm" radius="sm" isLoading={saving} isDisabled={saving}
          aria-label={placeholder || selected?.label || t('settings')}
          endContent={<Icon icon="tabler:chevron-down" width={14} className="text-default-400" />}
          startContent={icon && <Icon icon={icon} width="20" height="20" />}
        >
          {selected ? t(selected.label) : placeholder || value}
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label={placeholder || t('settings')}
        selectionMode="single"
        disallowEmptySelection
        onAction={async (key) => {
          if (saving || key.toString() === value) return;
          setSaving(true);
          try { await onChange(key.toString()); }
          catch (error) { RootStore.Get(ToastPlugin).error(error instanceof Error ? error.message : t('operation-failed')); }
          finally { setSaving(false); }
        }}
        selectedKeys={[value || '']}
      >
        {options.map(option => (
          <DropdownItem key={option.key}>{option.label}</DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}
