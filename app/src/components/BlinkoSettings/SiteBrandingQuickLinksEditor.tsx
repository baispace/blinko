import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Input, Select, SelectItem, Tooltip } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { api } from '@/lib/trpc';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_WORKSPACE_MENU,
  parseWorkspaceMenu,
  resolveMenuLabel,
  type WorkspaceMenuItem,
} from '../Common/SiteQuickLinks';

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `wm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

/** 精选 iconify 预设 —— 仅选用项目已打包进 icons.tsx 的 icon 名，避免白占位。 */
const PRESET_ICONS: { name: string; label: string }[] = [
  { name: 'tabler:home', label: 'Home' },
  { name: 'tabler:brush', label: 'Brush' },
  { name: 'tabler:info-circle', label: 'Info' },
  { name: 'tabler:star', label: 'Star' },
  { name: 'tabler:book', label: 'Book' },
  { name: 'tabler:calendar', label: 'Calendar' },
  { name: 'tabler:bookmark', label: 'Bookmark' },
  { name: 'tabler:bell', label: 'Bell' },
  { name: 'tabler:bolt', label: 'Bolt' },
  { name: 'tabler:briefcase', label: 'Work' },
  { name: 'tabler:layout-grid', label: 'Apps' },
  { name: 'tabler:search', label: 'Search' },
  { name: 'tabler:external-link', label: 'External' },
  { name: 'tabler:settings', label: 'Settings' },
  { name: 'tabler:link', label: 'Link' },
  { name: 'ph:globe', label: 'Globe' },
  { name: 'ph:link', label: 'Link' },
  { name: 'tabler:check', label: 'Todo' },
  { name: 'hugeicons:note', label: 'Note' },
  { name: 'hugeicons:message-01', label: 'Chat' },
];

const SYSTEM_ACTION_ICONS: Record<string, string> = {
  home: 'tabler:home',
  appearance: 'tabler:brush',
  about: 'tabler:info-circle',
};

const SYSTEM_ACTION_LABELS = (text: (zh: string, en: string) => string) => ({
  home: text('返回主页', 'Go to home'),
  appearance: text('站点外观', 'Site appearance'),
  about: text('关于本站', 'About site'),
});

/** 编辑器内"未配置"状态显示：内置默认。注意 Editor 内部总会有一条 customQuickLinks 数组（即使为空）。 */
const SEED_FOR_EMPTY = (): WorkspaceMenuItem[] => DEFAULT_WORKSPACE_MENU();

const validate = (list: WorkspaceMenuItem[]): string | null => {
  if (list.length > 12) return '最多 12 项 / Up to 12 items';

  const indexOf = (id: string) => list.findIndex(x => x.id === id) + 1;

  const ids = new Set<string>();
  for (const item of list) {
    const pos = indexOf(item.id);
    const tag = `第 ${pos} 项`;

    if (item.type === 'system') {
      // system 项的 label 可空 —— Sidebar 渲染时 resolveMenuLabel 会回退到 SYSTEM_LABEL_I18N。
      if (item.label.trim().length > 20) return `${tag}「名称」过长 / Label too long`;
    } else {
      // internal / external: label 与 target 都必填，且 target 按 type 限定格式。
      if (!item.label.trim()) return `${tag}缺「名称」/ Item #${pos} is missing a label`;
      if (item.target.length > 500) return `${tag}「目标」过长 / Target too long`;
      if (!item.target.trim()) return `${tag}缺「目标」（路径或 URL）/ Item #${pos} is missing a target`;
      if (item.type === 'external' && !/^https?:\/\//i.test(item.target))
        return `${tag}的外部链接必须以 http:// 或 https:// 开头 / Item #${pos} external link must start with http(s)://`;
      if (item.type === 'internal' && !item.target.startsWith('/'))
        return `${tag}的站内路径必须以 / 开头 / Item #${pos} internal path must start with /`;
    }

    if (ids.has(item.id)) return `${tag}与另一项 ID 重复 / Duplicate ID`;
    ids.add(item.id);
  }
  return null;
};

/** 设置页内的工作空间菜单 CRUD 编辑器。读写 _config.customQuickLinks。 */
export const SiteBrandingQuickLinksEditor = observer(() => {
  const { t, i18n } = useTranslation();
  const text = (zh: string, en: string) => (i18n.language.startsWith('zh') ? zh : en);
  const blinko = RootStore.Get(BlinkoStore);
  const toast = RootStore.Get(ToastPlugin);

  const rawValue = blinko.config.value?.customQuickLinks;
  const initial = useMemo(() => (rawValue ? parseWorkspaceMenu(rawValue) : SEED_FOR_EMPTY()), []);
  const [items, setItems] = useState<WorkspaceMenuItem[]>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  // 拉到 raw 后（用户没改动时）重新同步；用户改了之后不再覆盖。
  useEffect(() => {
    if (!dirty.current) setItems(rawValue ? parseWorkspaceMenu(rawValue) : SEED_FOR_EMPTY());
  }, [rawValue]);

  const persist = async (next: WorkspaceMenuItem[]) => {
    const error = validate(next);
    if (error) { toast.error(error); return; }
    setSaving(true);
    try {
      const json = JSON.stringify(next);
      await api.config.update.mutate({ key: 'customQuickLinks', value: json });
      if (blinko.config.value) blinko.config.value = { ...blinko.config.value, customQuickLinks: json } as any;
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

  const onUpdate = (id: string, patch: Partial<WorkspaceMenuItem>) => {
    dirty.current = true;
    setItems(prev => prev.map(item => (item.id === id ? ({ ...item, ...patch } as WorkspaceMenuItem) : item)));
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

  const onResetToDefault = async () => {
    setItems(SEED_FOR_EMPTY());
    dirty.current = true;
    await persist(SEED_FOR_EMPTY());
  };

  const onClearCustom = () => {
    // 清空 customQuickLinks → Sidebar 会回退到 DEFAULT_WORKSPACE_MENU 渲染。
    dirty.current = true;
    setItems([]);
  };

  const isCustomized = rawValue != null && rawValue !== '';

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && (
        <p className="text-xs text-default-400">
          {text(
            '当前没有自定义菜单（点击下方「恢复默认」可重新启用内置项）。',
            'No custom menu. Click "Reset to defaults" to re-enable built-in items.'
          )}
        </p>
      )}

      {items.map((item, index) => (
        <WorkspaceMenuRow
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
        <Button size="sm" variant="light" isDisabled={saving} onPress={onResetToDefault}>
          {text('恢复默认', 'Reset to defaults')}
        </Button>
        <Button
          size="sm"
          variant="light"
          isDisabled={saving || !isCustomized}
          onPress={onClearCustom}
        >
          {text('清空自定义', 'Clear custom')}
        </Button>
      </div>
    </div>
  );
});

interface WorkspaceMenuRowProps {
  item: WorkspaceMenuItem;
  index: number;
  total: number;
  onUpdate: (patch: Partial<WorkspaceMenuItem>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const WorkspaceMenuRow = observer(({ item, index, total, onUpdate, onRemove, onMoveUp, onMoveDown }: WorkspaceMenuRowProps) => {
  const { i18n } = useTranslation();
  const text = (zh: string, en: string) => (i18n.language.startsWith('zh') ? zh : en);
  const [iconifyName, setIconifyName] = useState(item.icon.startsWith('data:') ? '' : item.icon);

  useEffect(() => {
    if (item.icon.startsWith('data:')) { setIconifyName(''); return; }
    setIconifyName(item.icon);
  }, [item.icon]);

  const isSystem = item.type === 'system';
  const isExternal = item.type === 'external';

  const targetValue = (item.type === 'internal' || item.type === 'external') ? item.target : '';
  const targetPlaceholder = isSystem
    ? text('由内置 action 决定', 'Driven by action')
    : isExternal
      ? 'https://blog.baispace.cn'
      : '/ai';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-default-200/70 bg-default-50/60 p-3">
      {/* Row 1: type · label · 工具按钮组 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[120px] flex-1">
          <Select
            aria-label={text('条目类型', 'Entry type')}
            selectedKeys={[item.type]}
            onSelectionChange={keys => {
              const v = Array.from(keys)[0] as WorkspaceMenuItem['type'];
              if (!v || v === item.type) return;
              if (isSystem) return;
              if (v === 'system') {
                onUpdate({ type: 'system', action: 'home', target: undefined, icon: SYSTEM_ACTION_ICONS['home'], iconSource: 'builtin' } as Partial<WorkspaceMenuItem>);
              } else {
                onUpdate({ type: v, target: '/', icon: 'ph:link', iconSource: 'preset' } as Partial<WorkspaceMenuItem>);
              }
            }}
            size="sm"
          >
            <SelectItem key="system">{text('内置', 'System')}</SelectItem>
            <SelectItem key="internal">{text('站内', 'Internal')}</SelectItem>
            <SelectItem key="external">{text('外部', 'External')}</SelectItem>
          </Select>
        </div>
        <div className="min-w-[160px] flex-1">
          <Input
            aria-label={text('名称', 'Label')}
            size="sm"
            value={isSystem ? resolveMenuLabel(item, i18n.language.startsWith('zh')) : item.label}
            maxLength={20}
            placeholder={text('显示名', 'Label')}
            onValueChange={value => onUpdate({ label: value } as any)}
          />
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip content={text('上移', 'Move up')}>
            <Button isIconOnly size="sm" variant="flat" isDisabled={index === 0} onPress={onMoveUp} aria-label={text('上移', 'Move up')}>
              <Icon icon="tabler:chevron-up" width={14} />
            </Button>
          </Tooltip>
          <Tooltip content={text('下移', 'Move down')}>
            <Button isIconOnly size="sm" variant="flat" isDisabled={index === total - 1} onPress={onMoveDown} aria-label={text('下移', 'Move down')}>
              <Icon icon="tabler:chevron-down" width={14} />
            </Button>
          </Tooltip>
          <Tooltip content={text('删除', 'Delete')}>
            <Button isIconOnly size="sm" variant="flat" color="danger" onPress={onRemove} aria-label={text('删除', 'Delete')}>
              <Icon icon="tabler:trash" width={14} />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Row 2: target / action */}
      <div className="flex flex-wrap items-end gap-2">
        {isSystem ? (
          <div className="min-w-[180px] flex-1">
            <Select
              aria-label={text('内置动作', 'Action')}
              selectedKeys={[item.action]}
              onSelectionChange={keys => {
                const v = Array.from(keys)[0] as 'home' | 'appearance' | 'about';
                if (!v) return;
                onUpdate({ action: v, icon: SYSTEM_ACTION_ICONS[v], iconSource: 'builtin' } as Partial<WorkspaceMenuItem>);
              }}
              size="sm"
            >
              <SelectItem key="home">{text('跳到主页', 'Go to home')}</SelectItem>
              <SelectItem key="appearance">{text('打开站点外观设置', 'Open site appearance')}</SelectItem>
              <SelectItem key="about">{text('打开关于本站', 'Open about site')}</SelectItem>
            </Select>
          </div>
        ) : (
          <div className="min-w-[180px] flex-1">
            <Input
              aria-label={text('目标', 'Target')}
              size="sm"
              value={targetValue}
              placeholder={targetPlaceholder}
              onValueChange={value => onUpdate({ target: value } as any)}
              description={
                isExternal
                  ? text('完整 URL（含 https://）', 'Full URL including https://')
                  : text('站内路径（以 / 开头）', 'In-app path starting with /')
              }
            />
          </div>
        )}
      </div>

      {/* Row 3: iconify name input + 预设按钮组 */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={text('图标（iconify 名）', 'Icon (iconify name)')}
          size="sm"
          value={iconifyName}
          placeholder="tabler:link"
          className="max-w-[200px]"
          onValueChange={value => {
            setIconifyName(value);
            if (value && !value.startsWith('data:')) onUpdate({ icon: value, iconSource: 'iconify' } as any);
          }}
        />
        <div className="flex flex-wrap items-center gap-1">
          {PRESET_ICONS.map(preset => (
            <Tooltip key={preset.name} content={preset.name}>
              <button
                type="button"
                onClick={() => onUpdate({ icon: preset.name, iconSource: 'preset' } as any)}
                className={`flex size-7 shrink-0 items-center justify-center rounded-md border text-default-600 transition-colors ${item.icon === preset.name ? 'border-primary bg-primary/10 text-primary' : 'border-default-200/70 bg-background hover:bg-default-100'}`}
                aria-label={preset.label}
              >
                <Icon icon={preset.name} width={13} height={13} />
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
              <Icon icon="tabler:sparkles" width={13} height={13} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
});
