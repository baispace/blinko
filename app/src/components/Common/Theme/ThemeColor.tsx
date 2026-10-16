import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
const colors = [
  { zh:'默认蓝', en:'Default', background:'', foreground:'' },
  { zh:'海蓝', en:'Blue', background:'#2563eb', foreground:'#ffffff' },
  { zh:'靛紫', en:'Indigo', background:'#7c3aed', foreground:'#ffffff' },
  { zh:'玫瑰', en:'Rose', background:'#be123c', foreground:'#ffffff' },
  { zh:'琥珀', en:'Amber', background:'#fbe573', foreground:'#1c1c1e' },
  { zh:'橙色', en:'Orange', background:'#c2410c', foreground:'#ffffff' },
  { zh:'森林', en:'Forest', background:'#15803d', foreground:'#ffffff' },
  { zh:'青绿', en:'Teal', background:'#0f766e', foreground:'#ffffff' },
];
export const ThemeColor = ({ onChange, value = '' }: { onChange?: (background:string, foreground:string) => Promise<any>; value?:string }) => {
  const { i18n } = useTranslation();
  const [selected, setSelected] = useState(value), [saving, setSaving] = useState(false);
  useEffect(() => setSelected(value), [value]);
  return <div className="w-full max-w-[430px] space-y-3">
    <div className="grid grid-cols-4 gap-2">{colors.map(color => <button key={color.en} type="button" aria-pressed={selected===color.background} disabled={saving} onClick={async () => {
      const previous=selected; setSelected(color.background); setSaving(true);
      try { await onChange?.(color.background,color.foreground); } catch { setSelected(previous); } finally { setSaving(false); }
    }} className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 text-[11px] transition-colors focus-visible:outline-primary ${selected===color.background?'border-primary bg-primary/5 text-primary':'border-default-200 text-default-500 hover:bg-default-50'} disabled:cursor-wait`}>
      <span className="flex h-6 w-6 items-center justify-center rounded-full text-xs" style={{background:color.background||'#2f6feb',color:color.foreground||'#fff'}}>{selected===color.background?'✓':''}</span><span>{i18n.language.startsWith('zh')?color.zh:color.en}</span>
    </button>)}</div>
    {!colors.some(color => color.background===selected) && <p className="text-xs text-default-400">{i18n.language.startsWith('zh')?'当前保留自定义颜色':'Current custom color'} · {selected}</p>}
    <div className="flex items-center gap-2 text-xs text-default-400"><span className="h-2 w-2 rounded-full" style={{background:selected||'#2f6feb'}} />{i18n.language.startsWith('zh')?'用于按钮、选中项与标签，切换后立即生效。':'Applies to buttons, selection and tags.'}</div>
  </div>;
};
