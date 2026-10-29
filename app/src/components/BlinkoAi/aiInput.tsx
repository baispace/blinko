import { observer } from 'mobx-react-lite';
import { Button, Textarea, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { motion } from 'framer-motion';
import { useMediaQuery } from 'usehooks-ts';
import { api } from '@/lib/trpc';
import { AiStore } from '@/store/aiStore';
import { RootStore } from '@/store/root';
import { DialogStore } from '@/store/module/Dialog';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../Common/ScrollArea';
import AiSetting from '../BlinkoSettings/AiSetting/AiSetting';
import { AiSkills } from './AiSkills';
import { AiAttachmentMenu, AiAttachmentCards, type StagedFile } from './AiAttachmentBar';
import { workflows } from '@shared/lib/aiWorkflows';
import { useRef, useEffect, useState } from 'react';
import './aiInput.css';

interface AiInputProps {
  mode?: 'card' | 'inline';
  onSubmit?: (value: string) => void;
  className?: string;
  withoutOutline?: boolean;
}

const cardIcons = [
  { tooltip: 'knowledge-base-search', label: '检索笔记', capability: 'rag', state: 'withRAG' },
  { tooltip: 'online-search', label: '联网搜索', capability: 'online', state: 'withOnline' },
  { tooltip: 'add-tools-to-model', label: '工具操作', capability: 'tools', state: 'withTools' },
] as const;

export const AiInput = observer(({ onSubmit, className, withoutOutline }: AiInputProps) => {
  const isPc = useMediaQuery('(min-width: 768px)');
  const aiStore = RootStore.Get(AiStore);
  const [checking, setChecking] = useState(true);
  const [configError, setConfigError] = useState(false);
  const [configVersion, setConfigVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setChecking(true); setConfigError(false);
      try {
        const result = await api.ai.chatCapabilities.query({ modelId: aiStore.chatModelId || undefined });
        if (active) aiStore.chatCapabilities.setValue(result);
      } catch { if (active) setConfigError(true); }
      finally { if (active) setChecking(false); }
    };
    void load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, [aiStore.chatModelId, configVersion, RootStore.Get(DialogStore).isOpen]);
  const available = aiStore.chatCapabilities.value;
  const [skillsOpen, setSkillsOpen] = useState(false);
  // 附件区的纯文本附件暂存在本地，发送时并入提问正文（见 handleSubmit）
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const busy = aiStore.isAnswering || aiStore.isPreparing;
  const canSend = !checking && !configError && !!available?.canChat && !busy
    && (!!aiStore.input.trim() || !!aiStore.referencesNotes.length || !!staged.length);
  let mode = aiStore.isChatting ? 'inline' : 'card';
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleSubmit = () => {
    if (!canSend) return;
    // 附件以带来源标注的代码块并入提问，避免模型把文件内容误当成新指令
    const merged = [aiStore.input.trim(), ...staged.map(file => `\n\n\`\`\`\n// 附件：${file.name}\n${file.text}\n\`\`\``)].join('');
    if (onSubmit) {
      onSubmit(merged);
    } else {
      aiStore.input = merged;
      aiStore.onInputSubmit();
    }
    setStaged([]);
    // Blur textarea on mobile to dismiss keyboard
    if (!isPc) {
      setTimeout(() => {
        // Try to blur the active element (textarea) to dismiss keyboard
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && (activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
          activeElement.blur();
        }
        // Also try to blur via ref if available
        if (textareaRef.current) {
          textareaRef.current.blur();
        }
      }, 100);
    }
  };

  return (
    <motion.div
      className={`w-full max-w-3xl p-3 ${withoutOutline ? '' : 'rounded-2xl ai-input-card bg-background'} ${className}`}
      animate={{
        width: '100%',
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {/* 顶部只有已挂载的附件卡片（按文件格式呈现）。入口已收束到底部最前方的 + 按钮。 */}
      <AiAttachmentCards
        staged={staged}
        onRemove={id => setStaged(prev => prev.filter(f => f.id !== id))}
        onRemoveNote={id => { aiStore.referencesNotes = aiStore.referencesNotes.filter(n => n.id !== id); }}
        disabled={busy}
      />

      <div className="flex flex-col gap-2">
        <Textarea
          className="w-full"
          data-focus-visible="false"
          autoFocus
          value={aiStore.input}
          ref={(el) => {
            // Store reference to the underlying textarea element
            if (el) {
              const textareaElement = el.querySelector('textarea') as HTMLTextAreaElement;
              if (textareaElement) {
                textareaRef.current = textareaElement;
              }
            }
          }}
          onKeyDown={(e) => {
            // Handle Enter key press to submit input, but ignore if user is composing text (e.g. using IME)
            const isComposing = Boolean(e.isComposing || (e.nativeEvent && e.nativeEvent.isComposing));

            if (e.key === 'Enter' && !isComposing && (aiStore.selectedSkill?.key === 'daily' ? (e.metaKey || e.ctrlKey) : !e.shiftKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          onChange={(e) => (aiStore.input = e.target.value)}
          classNames={{
            input: `!bg-transparent border-none ${mode == 'inline' ? 'min-h-[20px]' : 'min-h-[64px]'} whitespace-pre-wrap`,
            label: '!bg-transparent border-none',
            inputWrapper: '!bg-transparent border-none !shadow-none',
          }}
          minRows={mode == 'inline' ? 1 : 3}
          maxRows={8}
          placeholder={aiStore.selectedSkill?.key === 'daily' ? '填写昨日进展与今日安排，或继续补充、修正本次事项…' : workflows.find(workflow => workflow.key === aiStore.selectedSkill?.key)?.placeholder || '输入你的问题，或引用历史内容继续讨论…'}
        />
        {/* 底部一行收束全部操作：+ 附件 → 技能 / 能力开关在左，模型 / 设置 / 发送在右 */}
        <div className="w-full gap-1 flex flex-wrap items-center">
          <AiAttachmentMenu staged={staged} onChange={setStaged} disabled={busy} />

          <Popover disableAnimation isOpen={skillsOpen} onOpenChange={setSkillsOpen} placement="top-start">
            <PopoverTrigger>
              <Button size="sm" variant="light" isDisabled={busy} aria-expanded={skillsOpen}
                className={aiStore.selectedSkill ? 'bg-primary/10 text-primary' : 'text-default-500'}
                startContent={<Icon icon="tabler:route" width={16} />}>技能</Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(92vw,520px)] max-h-[min(70vh,560px)] overflow-y-auto p-3">
              <AiSkills />
            </PopoverContent>
          </Popover>

          {aiStore.selectedSkill && (
            <span className="ai-skill-chip">
              <Icon icon="tabler:route" width={13} />
              <span className="truncate">{aiStore.selectedSkill.key === 'daily' ? '每日整理' : aiStore.selectedSkill.title}</span>
              <button type="button" aria-label={`取消技能 ${aiStore.selectedSkill.key === 'daily' ? '每日整理' : aiStore.selectedSkill.title}`} disabled={busy}
                onClick={() => { aiStore.selectedSkill = null; aiStore.referencesNotes = []; setSkillsOpen(false); }}>
                <Icon icon="tabler:x" width={12} />
              </button>
            </span>
          )}

          {cardIcons.filter(item => !checking && !configError && available?.[item.capability]).map(item => <Button key={item.capability} size="sm" variant="light" isDisabled={busy} aria-pressed={!!aiStore[item.state].value} onPress={() => aiStore[item.state].save(!aiStore[item.state].value)} className={aiStore[item.state].value ? 'bg-primary/10 text-primary' : 'text-default-500'}>{item.label}</Button>)}

          <div className="ml-auto min-w-0">
            <select aria-label="对话模型" disabled={busy || checking || configError}
              value={aiStore.chatModelId} onChange={e => { aiStore.chatModelId = Number(e.target.value); }}
              className="max-w-[180px] text-xs bg-transparent text-default-500 rounded-lg px-2 py-2 cursor-pointer hover:bg-default-100 transition-colors focus:outline-primary">
              <option value={0}>默认模型</option>
              {available?.models.map(m => <option key={m.id} value={m.id} disabled={!m.ready}>{m.providerTitle} · {m.title}{!m.ready ? '（配置不完整）' : ''}</option>)}
            </select>
          </div>

          <Button isIconOnly size="sm" variant="light" aria-label="AI 设置" onPress={() => {
            RootStore.Get(DialogStore).setData({ isOpen: true, size: '2xl', onlyContent: true, showOnlyContentCloseButton: true, title: t('settings'), content: <ScrollArea className="h-full md:h-[600px]"><AiSetting /></ScrollArea> });
          }}><Icon icon="tabler:settings" width="18" /></Button>

          <Button isIconOnly size="sm" color="primary"
            isLoading={aiStore.chatStatus === 'stopping'}
            isDisabled={aiStore.chatStatus === 'stopping' || (!aiStore.isAnswering && !canSend)}
            aria-label={aiStore.chatStatus === 'stopping' ? '正在停止' : aiStore.isAnswering ? '停止生成' : '发送消息'}
            title={aiStore.isAnswering ? '停止生成，保留当前回复' : '发送消息'}
            onPress={() => { if (aiStore.isAnswering) aiStore.abortAiChat(); else handleSubmit(); }}>
            <Icon icon={aiStore.isAnswering ? 'tabler:player-stop-filled' : 'uil:arrow-up'} width="20" height="20" />
          </Button>
        </div>
        <p className="mt-1 text-right text-[11px] text-default-400">{busy ? '生成中可停止，已生成内容会保留' : aiStore.selectedSkill?.key === 'daily' ? '⌘ / Ctrl + Enter 整理 · Enter 换行' : 'Enter 发送 · Shift + Enter 换行'}</p>
      </div>
      {aiStore.currentConversation.value?.nextMessageCursor && <p className="mt-2 text-[11px] text-default-400">长对话使用最近40条消息及最近工作流背景；更早的关键资料可重新引用。</p>}
      {checking ? <p role="status" className="mt-2 text-xs text-default-400">正在检查可用功能…</p> : configError ? <p role="alert" className="mt-2 text-xs text-default-500">配置读取失败 <button className="text-primary" onClick={() => setConfigVersion(value => value + 1)}>重试</button></p> : !available?.canChat && <p className="mt-2 text-xs text-default-500">请先在 AI 设置中配置对话模型，或选择一个已配置的模型。</p>}
    </motion.div>
  );
});
