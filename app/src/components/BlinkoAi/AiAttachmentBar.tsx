import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Popover, PopoverTrigger, PopoverContent } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { BlinkoSelectNote } from '../Common/BlinkoSelectNote';
import { RootStore } from '@/store';
import { AiStore } from '@/store/aiStore';
import { ToastPlugin } from '@/store/module/Toast/Toast';

/** 待发送的纯文本附件（粘贴 / 选文件）。发送时并入提问，不单独占一条消息。 */
export interface StagedFile {
  id: string;
  name: string;
  text: string;
  sizeLabel: string;
}

const MAX_FILE_BYTES = 200 * 1024;

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const preview = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 70);

/**
 * 对话框顶部的文件卡片（仅当有附件时显示）。
 * 真正的入口已收束到底部最前方的 `+` 按钮，见 AiAttachmentMenu。
 */
export const AiAttachmentCards = observer(({ staged, onRemove, onRemoveNote, disabled }: {
  staged: StagedFile[];
  onRemove: (id: string) => void;
  onRemoveNote: (id: number) => void;
  disabled: boolean;
}) => {
  const notes = RootStore.Get(AiStore).referencesNotes;
  if (!staged.length && !notes.length) return null;
  return (
    <div className="ai-attach-cards">
      {staged.map(file => (
        <div key={file.id} className="ai-attach-card">
          <Icon icon="tabler:file-text" width={16} className="ai-attach-card-icon" />
          <div className="ai-attach-card-body">
            <div className="ai-attach-card-title"><span className="truncate">{file.name}</span><span className="ai-attach-card-size">{file.sizeLabel}</span></div>
            <p className="ai-attach-card-preview">{preview(file.text) || '（空文件）'}</p>
          </div>
          <button type="button" aria-label={`移除附件 ${file.name}`} disabled={disabled}
            onClick={() => onRemove(file.id)}><Icon icon="tabler:x" width={13} /></button>
        </div>
      ))}
      {notes.map(note => (
        <div key={note.id} className="ai-attach-card">
          <Icon icon="tabler:note" width={16} className="ai-attach-card-icon" />
          <div className="ai-attach-card-body">
            <div className="ai-attach-card-title"><span className="truncate">{String(note.metadata?.title || `内容 #${note.id}`).replace(/^#+\s*/, '').slice(0, 40) || `内容 #${note.id}`}</span>
              <span className="ai-attach-card-size">引用</span>
            </div>
            <p className="ai-attach-card-preview">{preview((note.content ?? '').replace(/[#*`]/g, '')) || '（空内容）'}</p>
          </div>
          <button type="button" aria-label={`移除引用 ${note.id}`} disabled={disabled}
            onClick={() => onRemoveNote(note.id!)}><Icon icon="tabler:x" width={13} /></button>
        </div>
      ))}
    </div>
  );
});

/**
 * 底部最前方的 `+` 按钮：唤起粘贴内容 / 文件 / 图片 / 引用笔记 四个入口。
 * 附件挂上后会以文件卡片形式出现在框顶，由 AiAttachmentCards 渲染。
 */
export const AiAttachmentMenu = observer(({ staged, onChange, disabled }: {
  staged: StagedFile[];
  onChange: (next: StagedFile[]) => void;
  disabled: boolean;
}) => {
  const aiStore = RootStore.Get(AiStore);
  const toast = RootStore.Get(ToastPlugin);
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const count = staged.length + aiStore.referencesNotes.length;

  const addFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...staged];
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} 超过 ${Math.round(MAX_FILE_BYTES / 1024)} KB，已跳过`);
        continue;
      }
      const text = await file.text();
      if (!text.trim()) {
        toast.error(`${file.name} 没有可读取的文本内容`);
        continue;
      }
      next.push({ id: `${file.name}-${file.size}-${next.length}`, name: file.name, text, sizeLabel: formatSize(file.size) });
    }
    onChange(next);
  };

  const pasteClipboard = async () => {
    setOpen(false);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) { toast.error('剪贴板是空的'); return; }
      onChange([...staged, { id: `clip-${Date.now()}`, name: '剪贴板内容', text, sizeLabel: formatSize(text.length) }]);
    } catch {
      toast.error('浏览器拒绝了剪贴板读取\n请直接在输入框里按 ⌘V / Ctrl+V 粘贴');
    }
  };

  const menuItem = (icon: string, label: string, onClick: () => void, isDisabled = false) => (
    <button type="button" className="ai-attach-menu-item" disabled={isDisabled} onClick={onClick}>
      <Icon icon={icon} width={16} /><span>{label}</span>
    </button>
  );

  return (
    <Popover placement="top-start" isOpen={open} onOpenChange={setOpen}>
      <PopoverTrigger>
        <Button isIconOnly size="sm" variant="light" isDisabled={disabled}
          aria-label={count ? `添加附件（已有 ${count} 项）` : '添加附件'} aria-expanded={open}
          className="ai-attach-trigger">
          <Icon icon="tabler:plus" width={18} />
          {count > 0 && <span className="ai-attach-trigger-badge" aria-hidden>{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-1">
        <div className="flex flex-col gap-0.5">
          {menuItem('tabler:clipboard', '粘贴内容', () => void pasteClipboard())}
          {menuItem('tabler:file-plus', '文件', () => fileRef.current?.click())}
          {/* 对话通道目前是纯文本（completions 只收 question 字符串），图片无法送达模型。
              入口先占位，等后端补上多模态入参后再放开，避免给一个必然失灵的按钮。 */}
          <span className="inline-flex" title="当前对话通道仅支持文本，图片还不能发送给模型">
            {menuItem('tabler:photo', '图片', () => {}, true)}
          </span>
          <BlinkoSelectNote
            autoClose
            blackList={aiStore.referencesNotes.map(note => note.id!)}
            onSelect={note => {
              if (!disabled && !aiStore.isAnswering && !aiStore.isPreparing && !aiStore.referencesNotes.some(source => source.id === note.id)) {
                aiStore.referencesNotes.push(note);
              }
            }}
            iconButton={<button type="button" className="ai-attach-menu-item"><Icon icon="tabler:link" width={16} /><span>引用笔记</span></button>}
          />
        </div>
        <input ref={fileRef} type="file" multiple className="hidden" tabIndex={-1}
          accept=".txt,.md,.markdown,.json,.csv,.tsv,.log,.yml,.yaml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.go,.rs,.sh,text/*"
          onChange={event => { void addFiles(event.target.files); event.target.value = ''; setOpen(false); }} />
      </PopoverContent>
    </Popover>
  );
});
