import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { Icon } from '@/components/Common/Iconify/icons';

const foreground = [null, '#8a8f99', '#de3c36', '#d46b08', '#b88200', '#25852b', '#245bdb', '#7c3aed'];
const background = [null, '#f1f2f4', '#ffc2bf', '#ffdfb8', '#fff79a', '#c6f1bd', '#cbdcff', '#dfccff', '#e4e6e9', '#bfc3ca', '#ff6b64', '#ffa637', '#ffe633', '#64cf53', '#99b8ff', '#c3a0ff'];
const names = ['默认', '灰色', '红色', '橙色', '黄色', '绿色', '蓝色', '紫色'];

export const SelectionColorPicker = ({ editor }: { editor: Editor }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const attrs = editor.getAttributes('inlineColor');
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); editor.commands.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open, editor]);
  const apply = (name: string, value: string | null) => {
    const next = { ...editor.getAttributes('inlineColor'), [name]: value };
    let chain = editor.chain().focus();
    if (name === 'backgroundColor') chain = chain.unsetHighlight();
    if (!next.color && !next.backgroundColor) chain.unsetMark('inlineColor').run();
    else chain.setMark('inlineColor', next).run();
    setOpen(false);
  };
  return <div className="selection-colors" ref={root}>
    <button type="button" className="bubble-labeled" title="字体颜色与背景颜色" aria-label="字体颜色与背景颜色" aria-expanded={open} aria-haspopup="dialog"
      onMouseDown={event => event.preventDefault()} onClick={() => setOpen(!open)}>
      <span className="selection-color-letter" style={{ borderBottomColor: attrs.color || 'currentColor' }}>A</span>
      <Icon icon="tabler:chevron-down" width={12} />
    </button>
    {open && <div className="selection-color-panel" role="dialog" aria-label="文字颜色设置" onMouseDown={event => event.preventDefault()}>
      {(['color', 'backgroundColor'] as const).map(name => <section key={name}>
        <div className="selection-color-heading">{name === 'color' ? '字体颜色' : '背景颜色'}</div>
        <div className="selection-color-grid">
          {(name === 'color' ? foreground : background).map((value, index) => {
            const label = name === 'backgroundColor' && !value ? '无背景' : `${index >= 8 ? '深' : ''}${names[index % 8]}`;
            const selected = (attrs[name] || null) === value && !(name === 'backgroundColor' && editor.isActive('highlight'));
            return <button key={value || 'default'} type="button" aria-label={`${name === 'color' ? '字体' : '背景'}：${label}`} title={label} aria-pressed={selected}
              className={`selection-color-swatch ${selected ? 'selected' : ''} ${!value && name === 'backgroundColor' ? 'no-color' : ''}`}
              style={name === 'color' ? { color: value || 'inherit' } : { backgroundColor: value || 'transparent' }}
              onClick={() => apply(name, value)}>{name === 'color' ? 'A' : ''}</button>;
          })}
        </div>
      </section>)}
      <button type="button" className="selection-color-reset" onClick={() => { editor.chain().focus().unsetMark('inlineColor').unsetHighlight().run(); setOpen(false); }}>恢复默认颜色</button>
    </div>}
  </div>;
};
