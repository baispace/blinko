import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Input, Select, SelectItem, Switch, Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import type { QuickLinkItem } from '../Common/SiteQuickLinks';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `ql_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

/**
 * 精选 iconify 预设 —— 让用户在不离开 Settings 的情况下点选图标。
 * 整套 iconify 在线搜索不在本期范围；后续接 AI 生成图标时再开放「自定义 iconify 名」入口。
 */
const PRESET_ICONS: { name: string; label: string }[] = [
  { name: 'ph:globe', label: 'Globe' },
  { name: 'ph:link', label: 'Link' },
  { name: 'mingcute:apps-2-line', label: 'Apps' },
  { name: 'hugeicons:message-01', label: 'Chat' },
  { name: 'hugeicons:note', label: 'Note' },
  { name: 'hugeicons:checkbox', label: 'Todo' },
  { name: 'mdi:cog-outline', label: 'Settings' },
  { name: 'tabler:home', label: 'Home' },
  { name: 'tabler:briefcase', label: 'Work' },
  { name: 'tabler:book', label: 'Book' },
  { name: 'tabler:brush', label: 'Brush' },
  { name: 'tabler:calendar', label: 'Calendar' },
  { name: 'tabler:bookmark', label: 'Bookmark' },
  { name: 'tabler:star', label: 'Star' },
  { name: 'tabler:bolt', label: 'Bolt' },
  { name: 'tabler:bell', label: 'Bell' },
  { name: 'tabler:search', label: 'Search' },
  { name: 'tabler:plus', label: 'Plus' },
  { name: 'tabler:external-link', label: 'External' },
  { name: 'tabler:layout-grid', label: 'Grid' },
];

const normalize = (raw: unknown): QuickLinkItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as QuickLinkItem[];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as QuickLinkItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** 设置页内的 Quick Links CRUD 编辑器。直接读写 _config.customQuickLinks。 */
export const SiteBrandingQuickLinksEditor = observer(() => {
  const { t, i18n } = useTranslation();
  const text = (zh: string, en: string) => (i18n.language.startsWith('zh') ? zh : en);
  const blinko = RootStore.Get(BlinkoStore);
  const toast = RootStore.Get(ToastPlugin);

  const rawValue = blinko.config.value?.customQuickLinks;
  const initial = useMemo(() => normalize(rawValue), []);
  const [items, setItems] = useState<QuickLinkItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  // 当外部（fetch 回来 / 重置）变化时，重新同步一次；用户改了之后不再覆盖。
  useEffect(() => {
    if (!dirty.current) setItems(normalize(rawValue));
  }, [rawValue]);

  const validate = (list: QuickLinkItem[]): string | null => {
    if (list.length > 12) return text('最多 12 个快捷入口', 'Up to 12 quick links');
    const ids = new Set<string>();
    for (const item of list) {
      if (!item.label.trim()) return text('每个入口都需要一个名称', 'Each link needs a label');
      if (!item.target.trim()) return text('每个入口都需要一个目标（路径或 URL）', 'Each link needs a target');
      if (item.target.length > 500) return text('目标过长', 'Target too long');
      if (ids.has(item.id)) return text('存在重复 ID，请刷新页面重试', 'Duplicate IDs found');
      ids.add(item.id);
    }
    return null;
  };

  const persist = async (next: QuickLinkItem[]) => {
    const error = validate(next);
    if (error) { toast.error(error); return; }
    setSaving(true);
    try {
      await api.config.update.mutate({ key: 'customQuickLinks', value: JSON.stringify(next) });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customQuickLinks: JSON.stringify(next) } as any;
      dirty.current = false;
      toast.success(t('operation-success'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('operation-failed'));
    } finally {
      setSaving(false);
    }
  };

  const onAdd = () => {
    dirty.current = true;
    setItems(prev => [
      ...prev,
      { id: newId(), type: 'internal', label: '', target: '/', icon: 'ph:link', iconSource: 'preset' },
    ]);
  };

  const onUpdate = (id: string, patch: Partial<QuickLinkItem>) => {
    dirty.current = true;
    setItems(prev => prev.map(item => (item.id === id ? { ...item, ...patch } : item)));
  };

  const onRemove = (id: string) => {
    dirty.current = true;
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const onMove = (id: string, direction: -1 | 1) => {
    dirty.current = true;
    setItems(prev => {
      const idx = prev.findIndex(item => item.id === id);
      const target = idx + direction;
      if (idx < 0 || target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-xs text-default-400">
          {text('没有快捷入口。点击下方「新增」开始配置。', 'No quick links yet. Click "Add" to start.')}
        </p>
      )}

      {items.map((item, index) => (
        <QuickLinkRow
          key={item.id}
          item={item}
          index={index}
          total={items.length}
          onUpdate={patch => onUpdate(item.id, patch)}
          onRemove={() => onRemove(item.id)}
          onMoveUp={() => onMove(item.id, -1)}
          onMoveDown={() => onMove(item.id, 1)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="flat" startContent={<Icon icon="tabler:plus" width={16} />} onPress={onAdd}>
          {text('新增', 'Add')}
        </Button>
        <Button
          size="sm"
          color="primary"
          isDisabled={!dirty.current}
          isLoading={saving}
          onPress={() => persist(items)}
        >
          {t('save')}
        </Button>
        <Button
          size="sm"
          variant="light"
          isDisabled={saving || items.length === 0}
          onPress={() => {
            dirty.current = true;
            setItems([]);
          }}
        >
          {text('清空', 'Clear all')}
        </Button>
      </div>
    </div>
  );
});

interface QuickLinkRowProps {
  item: QuickLinkItem;
  index: number;
  total: number;
  onUpdate: (patch: Partial<QuickLinkItem>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** 单行编辑器：类型切换 / 名称 / 目标 / icon 选择器 / 上下移动 / 删除 */
const QuickLinkRow = observer(({ item, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }: QuickLinkRowProps) => {
  const { i18n } = useTranslation();
  const text = (zh: string, en: string) => (i18n.language.startsWith('zh') ? zh : en);
  const [iconifyName, setIconifyName] = useState(item.icon.startsWith('data:') ? '' : item.icon);

  useEffect(() => {
    if (item.icon.startsWith('data:')) { setIconifyName(''); return; }
    setIconifyName(item.icon);
  }, [item.icon]);

  const isExternal = item.type === 'external';
  const targetPlaceholder = isExternal ? 'https://blog.baispace.cn' : '/ai';

  return (
    <div
      className="grid grid-cols-1 gap-2 rounded-lg border border-default-200/70 bg-default-50/60 p-3 md:grid-cols-[110px_1fr_1fr_auto]"
    >
      <Select
        aria-label={text('入口类型', 'Link type')}
        selectedKeys={[item.type]}
        onSelectionChange={keys => {
          const v = Array.from(keys)[0] as QuickLinkItem['type'];
          if (v) onUpdate({ type: v });
        }}
        size="sm"
        classNames={{ trigger: 'h-9' }}
      >
        <SelectItem key="internal">{text('站点内', 'Internal')}</SelectItem>
        <SelectItem key="external">{text('外部', 'External')}</SelectItem>
      </Select>

      <Input
        aria-label={text('名称', 'Label')}
        size="sm"
        value={item.label}
        maxLength={20}
        placeholder={text('显示名', 'Label')}
        onValueChange={value => onUpdate({ label: value })}
      />

      <Input
        aria-label={text('目标', 'Target')}
        size="sm"
        value={item.target}
        placeholder={targetPlaceholder}
        onValueChange={value => onUpdate({ target: value })}
        description={
          isExternal
            ? text('完整 URL（含 https://）', 'Full URL including https://')
            : text('站内路径（以 / 开头）', 'In-app path starting with /')
        }
      />

      <div className="flex flex-col gap-1.5 md:items-end">
        <div className="flex items-center gap-1.5">
          <Switch
            size="sm"
            isSelected={!isExternal}
            isDisabled
            aria-label={text('类型为站点内', 'Is internal')}
          />
          <span className="text-[11px] text-default-400">{text('位置', 'Order')}</span>
          <Tooltip content={text('上移', 'Move up')}><Button isIconOnly size="sm" variant="flat" isDisabled={index === 0} onPress={onMoveUp} aria-label={text('上移', 'Move up')}><Icon icon="tabler:chevron-up" width={14} /></Button></Tooltip>
          <Tooltip content={text('下移', 'Move down')}><Button isIconOnly size="sm" variant="flat" isDisabled={index === total - 1} onPress={onMoveDown} aria-label={text('下移', 'Move down')}><Icon icon="tabler:chevron-down" width={14} /></Button></Tooltip>
          <Tooltip content={text('删除', 'Delete')}><Button isIconOnly size="sm" variant="flat" color="danger" onPress={onRemove} aria-label={text('删除', 'Delete')}><Icon icon="tabler:trash" width={14} /></Button></Tooltip>
        </div>
        <div className="flex w-full items-center gap-1.5">
          <Input
            aria-label={text('图标（iconify 名或上传后留空）', 'Icon (iconify name)')}
            size="sm"
            value={iconifyName}
            placeholder="ph:link"
            onValueChange={value => {
              setIconifyName(value);
              if (value && !value.startsWith('data:')) onUpdate({ icon: value, iconSource: 'iconify' });
            }}
          />
        </div>
        <div className="flex w-full flex-wrap items-center gap-1 overflow-x-auto">
          {PRESET_ICONS.slice(0, 12).map(preset => (
            <Tooltip key={preset.name} content={preset.name}>
              <button
                type="button"
                onClick={() => onUpdate({ icon: preset.name, iconSource: 'preset' })}
                className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-default-600 transition-colors ${
                  item.icon === preset.name
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-default-200/70 bg-background hover:bg-default-100'
                }`}
                aria-label={preset.label}
              >
                <Icon icon={preset.name} width={14} height={14} />
              </button>
            </Tooltip>
          ))}
          <Tooltip content={text('AI 生成图标（即将上线）', 'AI icon (coming soon)')}>
            <button
              type="button"
              disabled
              className="flex size-7 shrink-0 cursor-not-allowed items-center justify-center rounded-md border border-dashed border-default-300 bg-background text-default-400 opacity-60"
              aria-label={text('AI 生成', 'AI generate')}
            >
              <Icon icon="tabler:sparkles" width={14} height={14} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});
