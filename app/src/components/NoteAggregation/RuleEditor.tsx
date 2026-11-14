import { useState } from 'react';
import { Button, Input, Modal, ModalContent, Select, SelectItem, Switch } from '@heroui/react';
import { aggregationRuleSchema, type AggregationRule } from '@shared/lib/noteAggregation';
import { api } from '@/lib/trpc';
import { Icon } from '@/components/Common/Iconify/icons';
import { periods } from './constants';

type Preview = Awaited<ReturnType<typeof api.notes.aggregationPage.query>>;

export function AggregationRuleEditor({ rule, tags, isNew, type, rulesForPreview, onSave, onClose }: {
  rule: AggregationRule;
  tags: { id: number; name: string }[];
  isNew: boolean;
  type: number;
  rulesForPreview: (rule: AggregationRule) => AggregationRule[];
  onSave: (rule: AggregationRule) => Promise<void>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(rule);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);
  const patch = (value: Partial<AggregationRule>) => {
    setDraft((previous) => ({ ...previous, ...value }));
    setPreview(null);
    setError('');
  };
  const close = () => {
    if (!busy && (!dirty || window.confirm('放弃这次规则修改？'))) onClose();
  };
  const submit = async (action: 'preview' | 'save') => {
    const parsed = aggregationRuleSchema.safeParse(draft);
    if (!draft.name.trim()) { setError('请填写规则名称'); return; }
    if (!draft.tagIds.length) { setError('请至少选择一个标签'); return; }
    if (!parsed.success) { setError('请填写有效的起止日期，并确认规则名称不超过80字'); return; }
    setBusy(action);
    setError('');
    try {
      if (action === 'save') await onSave(parsed.data);
      else setPreview(await api.notes.aggregationPage.query({ type, previewRules: rulesForPreview(parsed.data), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    } catch (error) {
      setError(error instanceof Error ? error.message : '操作失败，请重试');
    } finally { setBusy(null); }
  };
  const matchingTags = tags.filter((tag) => tag.name.toLowerCase().includes(keyword.toLowerCase()));
  const stats = preview?.ruleStats.find((item) => item.ruleId === draft.id);
  return <Modal isOpen onClose={close} hideCloseButton placement="center" scrollBehavior="inside" isDismissable={!busy} isKeyboardDismissDisabled={!!busy} size="2xl"
    classNames={{ wrapper: 'aggregation-modal-wrapper', backdrop: 'aggregation-modal-backdrop' }}>
    <ModalContent className="aggregation-rule-dialog">
      <header className="aggregation-dialog-header">
        <div><h2>{isNew ? '新建聚合规则' : '编辑聚合规则'}</h2><p>选择标签和日期条件，预览后保存到列表</p></div>
        <Button isIconOnly variant="light" radius="full" isDisabled={!!busy} aria-label="关闭规则编辑" onPress={close}><Icon icon="tabler:x" width={20} /></Button>
      </header>
      <div className="aggregation-dialog-body">
        <fieldset disabled={!!busy} className="grid gap-5 min-w-0">
          <Input autoFocus label="规则名称" labelPlacement="outside" placeholder="例如：业务负责人训练" value={draft.name} maxLength={80} onValueChange={(name) => patch({ name })} />
          <section>
            <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-medium">匹配标签</h3><span className="text-xs text-default-400">已选 {draft.tagIds.length} 个</span></div>
            <Input size="sm" aria-label="搜索标签" placeholder="搜索标签" value={keyword} onValueChange={setKeyword} startContent={<Icon icon="tabler:search" width={16} />} />
            <div className="aggregation-tag-picker">
              {matchingTags.map((tag) => <Button key={tag.id} size="sm" variant="flat" color={draft.tagIds.includes(tag.id) ? 'primary' : 'default'} aria-pressed={draft.tagIds.includes(tag.id)}
                onPress={() => patch({ tagIds: draft.tagIds.includes(tag.id) ? draft.tagIds.filter((id) => id !== tag.id) : [...draft.tagIds, tag.id] })}>#{tag.name}</Button>)}
              {!matchingTags.length && <p className="text-xs text-default-500">没有匹配的标签</p>}
            </div>
            {draft.tagIds.filter((id) => !tags.some((tag) => tag.id === id)).map((id) => <Button key={id} size="sm" variant="flat" color="warning" onPress={() => patch({ tagIds: draft.tagIds.filter((value) => value !== id) })}>移除已删除标签 ×</Button>)}
            {draft.tagIds.some((id) => !tags.some((tag) => tag.id === id)) && <p className="text-xs text-warning-600">部分标签已删除，请重新选择标签。</p>}
          </section>
          <div className="aggregation-editor-grid">
            <Select label="标签关系" selectedKeys={[draft.tagMatch]} onChange={(event) => patch({ tagMatch: event.target.value as AggregationRule['tagMatch'] })}>
              <SelectItem key="any">满足任一标签</SelectItem><SelectItem key="all">同时满足全部标签</SelectItem>
            </Select>
            <Select label="日期依据" selectedKeys={[draft.dateField]} onChange={(event) => patch({ dateField: event.target.value as AggregationRule['dateField'] })}>
              <SelectItem key="createdAt">创建时间</SelectItem><SelectItem key="updatedAt">更新时间</SelectItem>
            </Select>
          </div>
          <Select label="日期范围与分组" selectedKeys={[draft.period]} onChange={(event) => patch({ period: event.target.value as AggregationRule['period'] })}>
            {Object.entries(periods).map(([key, label]) => <SelectItem key={key}>{label}</SelectItem>)}
          </Select>
          {draft.period === 'range' && <div className="aggregation-editor-grid">
            <Input type="date" label="开始日期" value={draft.rangeStart || ''} onValueChange={(rangeStart) => patch({ rangeStart })} />
            <Input type="date" label="结束日期" value={draft.rangeEnd || ''} onValueChange={(rangeEnd) => patch({ rangeEnd })} />
          </div>}
          <div className="aggregation-editor-grid">
            <Select label="列表展示" selectedKeys={[draft.display]} onChange={(event) => patch({ display: event.target.value as AggregationRule['display'] })}>
              <SelectItem key="grouped">聚合卡片</SelectItem><SelectItem key="individual">逐篇展示</SelectItem>
            </Select>
            <div className="flex items-center justify-between gap-3 px-1"><span className="text-sm">启用规则</span><Switch aria-label="启用规则" isSelected={draft.enabled} onValueChange={(enabled) => patch({ enabled })} /></div>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        {preview && <section className="aggregation-preview" aria-live="polite"><h3>匹配预览</h3><p>{stats?.noteCount || 0} 篇内容，将形成 {stats?.groups || 0} 张聚合卡片</p><small>{!draft.enabled ? '当前规则已停用。' : draft.display === 'individual' ? '当前设为逐篇展示。' : '已结合规则优先级计算，置顶内容与不足两篇的内容继续单独展示。'}</small></section>}
      </div>
      <footer className="aggregation-dialog-footer">
        <Button variant="light" isDisabled={!!busy} onPress={close}>取消</Button>
        <div className="flex gap-2"><Button variant="flat" isDisabled={!!busy} isLoading={busy === 'preview'} onPress={() => void submit('preview')}>预览匹配</Button><Button color="primary" isDisabled={!!busy} isLoading={busy === 'save'} onPress={() => void submit('save')}>{isNew ? '创建并应用' : '保存修改'}</Button></div>
      </footer>
    </ModalContent>
  </Modal>;
}
