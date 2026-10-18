import { useEffect, useRef, useState } from 'react';
import './todoTable.css';

/**
 * 任务标题单元格：单击打开任务，双击或 F2 编辑标题。
 *
 * 改一个标题过去要开弹窗，弹窗里还要再找输入框、保存。
 * 这里是单击即进入编辑：Enter 保存、Esc 取消、失焦保存，
 * 编辑框随内容自动增高，长任务不会被截断。
 */

interface TodoTitleCellProps {
  value: string;
  done: boolean;
  /** 看板布局里标题要折两行，列表布局单行截断 */
  multiline?: boolean;
  onOpen: () => void;
  onSave: (next: string) => void;
}

export const TodoTitleCell = ({ value, done, multiline, onOpen, onSave }: TodoTitleCellProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const clickTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelled = useRef(false);
  useEffect(()=>()=>clearTimeout(clickTimer.current),[]);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // 外部值变化（例如切换分组后重渲染）时，跟上最新的，但不要打断正在进行的编辑
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    // 进入编辑后按内容高度展开
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing]);

  const commit = () => {
    if(cancelled.current){cancelled.current=false;return;}
    setEditing(false);
    const next = draft.trim();
    if (next && next !== value) onSave(next);
    else setDraft(value);
  };

  const cancel = () => {
    cancelled.current=true;
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={inputRef}
        className="todo-title-input"
        value={draft}
        rows={1}
        onChange={e => {
          setDraft(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onBlur={commit}
        aria-label="编辑任务标题"
      />
    );
  }

  return (
    <button
      type="button"
      className={`w-full py-1 text-left text-sm transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${multiline ? 'line-clamp-2 break-words leading-6' : 'block truncate'} ${done ? 'text-default-500 line-through' : 'text-foreground'}`}
      onClick={e => {clearTimeout(clickTimer.current);if(e.detail===0){onOpen();return;}if(e.detail===1)clickTimer.current=setTimeout(onOpen,260);}}
      onDoubleClick={e=>{e.preventDefault();clearTimeout(clickTimer.current);cancelled.current=false;setEditing(true);}}
      onKeyDown={e=>{if(e.key==='F2'){e.preventDefault();cancelled.current=false;setEditing(true);}}}
      title={value+"（单击打开，双击编辑标题）"}
    >
      {value}
    </button>
  );
};
