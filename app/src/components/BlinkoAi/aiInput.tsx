import { observer } from 'mobx-react-lite';
import { Button, Textarea } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { motion } from 'framer-motion';
import { useMediaQuery } from 'usehooks-ts';
import { api } from '@/lib/trpc';
import { AiStore } from '@/store/aiStore';
import { RootStore } from '@/store/root';
import { DialogStore } from '@/store/module/Dialog';
import { BlinkoSelectNote } from '../Common/BlinkoSelectNote';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '../Common/ScrollArea';
import AiSetting from '../BlinkoSettings/AiSetting/AiSetting';
import { AiSkills } from './AiSkills';
import { workflows } from '@shared/lib/aiWorkflows';
import { useRef, useEffect, useState } from 'react';

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
  const [showWorkflows, setShowWorkflows] = useState(false);
  const canSend = !checking && !configError && !!available?.canChat && !aiStore.isPreparing && !aiStore.isAnswering && (!!aiStore.input.trim() || !!aiStore.referencesNotes.length);
  let mode = aiStore.isChatting ? 'inline' : 'card';
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  
  const handleSubmit = () => {
    if (!canSend) return;
    if (onSubmit) {
      onSubmit(aiStore.input);
    } else {
      aiStore.onInputSubmit();
    }
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
      className={`w-full max-w-3xl p-3 ${withoutOutline ? '' : 'rounded-2xl border border-default-200 bg-background'} ${className}`}
      animate={{
        width: '100%',
      }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
    >
      {(!aiStore.isChatting || showWorkflows || !!aiStore.selectedSkill) && <div className="mb-3 max-h-[min(26vh,240px)] md:max-h-[min(40vh,360px)] md:[mask-image:none] overflow-y-auto overscroll-contain pr-1 [mask-image:linear-gradient(to_bottom,#000_calc(100%-28px),transparent)]"><AiSkills /></div>}
      <div className="flex items-center gap-1 px-1 pb-2">
        <BlinkoSelectNote autoClose={false} blackList={aiStore.referencesNotes.map(note => note.id!)} onSelect={note => { if (!aiStore.isAnswering && !aiStore.isPreparing && !aiStore.referencesNotes.some(source => source.id === note.id)) aiStore.referencesNotes.push(note); }}
          iconButton={<Button size="sm" variant="flat" isDisabled={aiStore.isAnswering || aiStore.isPreparing} startContent={<Icon icon="tabler:link" width={16} />}>引用历史内容</Button>} />
        <Button size="sm" variant="light" isDisabled={aiStore.isAnswering || aiStore.isPreparing} aria-expanded={showWorkflows} onPress={() => setShowWorkflows(!showWorkflows)} startContent={<Icon icon="tabler:route" width={16} />}>工作流</Button>
      </div>
      {!!aiStore.referencesNotes.length && <div className="flex flex-wrap gap-2 px-2 pt-2 max-h-28 overflow-y-auto">
        {aiStore.referencesNotes.map(note => <div key={note.id} className="flex items-center gap-2 max-w-full rounded-lg bg-default-100 px-2 py-1 text-xs">
          <span className="truncate max-w-[210px]">{String(note.metadata?.title || (note.content ?? '').replace(/[#*`]/g, '')).slice(0, 45) || `内容 #${note.id}`}</span>
          <button type="button" disabled={aiStore.isAnswering || aiStore.isPreparing} aria-label={`移除来源 ${note.id}`} onClick={() => { aiStore.referencesNotes = aiStore.referencesNotes.filter(n => n.id !== note.id); }} className="px-1 text-default-500">×</button>
        </div>)}
      </div>}
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

            if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
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
          placeholder={workflows.find(workflow => workflow.key === aiStore.selectedSkill?.key)?.placeholder || '输入你的问题，或引用历史内容继续讨论…'}
        />
        <div className="w-full gap-1 flex flex-wrap items-center">
          <>
            {cardIcons.filter(item => !checking && !configError && available?.[item.capability]).map(item => <Button key={item.capability} size="sm" variant="light" isDisabled={aiStore.isAnswering || aiStore.isPreparing} aria-pressed={!!aiStore[item.state].value} onPress={() => aiStore[item.state].save(!aiStore[item.state].value)} className={aiStore[item.state].value ? 'bg-primary/10 text-primary' : 'text-default-500'}>{item.label}</Button>)}
          </>

          <div className="ml-auto min-w-0">
            <select aria-label="对话模型" disabled={aiStore.isAnswering || checking || configError || aiStore.isPreparing}
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
            isDisabled={aiStore.chatStatus === 'stopping' || (!aiStore.isAnswering && !canSend)}
            aria-label={aiStore.chatStatus === 'stopping' ? '正在停止' : aiStore.isAnswering ? '停止生成' : '发送消息'}
            title={aiStore.isAnswering ? '停止生成，保留当前回复' : '发送消息'}
            onPress={() => { if (aiStore.isAnswering) aiStore.abortAiChat(); else handleSubmit(); }}>
            <Icon icon={aiStore.isAnswering ? 'tabler:player-stop-filled' : 'uil:arrow-up'} width="20" height="20" />
          </Button>
        </div>
      </div>
      {aiStore.currentConversation.value?.nextMessageCursor && <p className="mt-2 text-[11px] text-default-400">长对话使用最近40条消息及最近工作流背景；更早的关键资料可重新引用。</p>}
      {checking ? <p role="status" className="mt-2 text-xs text-default-400">正在检查可用功能…</p> : configError ? <p role="alert" className="mt-2 text-xs text-default-500">配置读取失败 <button className="text-primary" onClick={() => setConfigVersion(value => value + 1)}>重试</button></p> : !available?.canChat && <p className="mt-2 text-xs text-default-500">请先在 AI 设置中配置对话模型，或选择一个已配置的模型。</p>}
    </motion.div>
  );
});
