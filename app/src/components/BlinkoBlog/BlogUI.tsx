import { Children, forwardRef, isValidElement, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type HTMLAttributes } from 'react';
import { Button, Input, Textarea, Select, SelectItem, Checkbox, Switch, Tabs, Tab, Chip, Accordion, AccordionItem } from '@heroui/react';
import type { ButtonProps, InputProps, TextAreaProps, SelectProps, CheckboxProps, SwitchProps } from '@heroui/react';
import { readBlogTheme } from '@/lib/blogTheme';
import './hero-admin.css';

/**
 * HeroUI 的 props 比原生标签更严格（value 只收 string、size 只收 sm/md/lg），
 * 而调用方写的是原生属性。这里保留原生写法，在包装层内部转一次型，
 * 业务代码不用为了组件库改写法。
 */
type NativeButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;
/** 按钮也可以是链接：HeroUI 支持 as="a"，焦点态与悬停态才能跟其它按钮一致。 */
type BlogButtonProps = NativeButtonProps & { as?: 'button' | 'a'; href?: string; target?: string; rel?: string };
type NativeInputProps = InputHTMLAttributes<HTMLInputElement>;
type NativeTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number };
type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Shared HeroUI controls retain native change events and existing business handlers. */
export const BlogButton = forwardRef<HTMLButtonElement, BlogButtonProps>(({className='',disabled,children,color,...props},ref)=>{
 const action=className.includes('ink-mg-button');
 const primary=className.includes('ink-mg-button-primary');
 const danger=props['data-danger' as keyof typeof props]==='true'||className.includes('danger');
 const quiet=!action||className.includes('ghost');
 return <Button {...(props as unknown as ButtonProps)} ref={ref} size="sm" radius="md" color={danger?'danger':primary?'primary':'default'} variant={primary?'solid':quiet?'light':'flat'} isDisabled={disabled} className={`blog-ui-button ${className} ${!action?'h-auto min-h-0 min-w-0':''}`}>{children}</Button>;
});
BlogButton.displayName='BlogButton';

export const BlogInput=forwardRef<HTMLInputElement,NativeInputProps&{startContent?:ReactNode;endContent?:ReactNode;invalid?:boolean}>(({className='',disabled,readOnly,required,size,color,startContent,endContent,invalid,...props},ref)=><Input {...(props as unknown as InputProps)} startContent={startContent} endContent={endContent} ref={ref} size="sm" radius="md" variant="bordered" isDisabled={disabled} isReadOnly={readOnly} isRequired={required} isInvalid={invalid} color={(invalid?'danger':color) as InputProps['color']} aria-label={props['aria-label']||props.placeholder||'输入内容'} className={`blog-ui-field ${className}`} classNames={{inputWrapper:'shadow-none',input:'text-sm'}}/>);
BlogInput.displayName='BlogInput';
export const BlogTextarea=forwardRef<HTMLTextAreaElement,NativeTextareaProps&{invalid?:boolean}>(({className='',disabled,readOnly,required,rows,style,minRows,invalid,...props},ref)=>{
  /*
   * HeroUI 的 Textarea 底层是 react-textarea-autosize：
   * 它收到 style.minHeight 会直接抛错，把整页 React 树打崩（公开作者页曾因此白屏）。
   * 所以这里把 minHeight 换算成 minRows，高度交给组件自己算。
   */
  const {minHeight,...restStyle}=style||{};
  const heightRows=minHeight?Math.max(1,Math.round(Number.parseFloat(String(minHeight))/22)):undefined;
  return <Textarea {...(props as unknown as TextAreaProps)} ref={ref} size="sm" radius="md" variant="bordered" minRows={minRows??heightRows??rows??3} maxRows={12} isDisabled={disabled} isReadOnly={readOnly} isRequired={required} isInvalid={invalid} aria-label={props['aria-label']||props.placeholder||'输入内容'} className={`blog-ui-field ${className}`} classNames={{inputWrapper:'shadow-none',input:'text-sm'}} style={restStyle}/>;
});
BlogTextarea.displayName='BlogTextarea';
function optionsFrom(children:ReactNode):{value:string;label:ReactNode;disabled:boolean}[]{
 return Children.toArray(children).flatMap(child=>{
  if(!isValidElement<any>(child))return [];
  if(child.type==='optgroup')return optionsFrom(child.props.children);
  return [{value:String(child.props.value??child.props.children??''),label:child.props.children,disabled:!!child.props.disabled}];
 });
}
export function blogControlText(children:ReactNode):string{
 return Children.toArray(children).map(child=>typeof child==='string'||typeof child==='number'?String(child):isValidElement<any>(child)?blogControlText(child.props.children):'').join(' ').trim();
}
export const BlogSelect=forwardRef<HTMLSelectElement,NativeSelectProps>(({children,className='',disabled,required,value,defaultValue,onChange,size,multiple,...props},ref)=>{
 const items=optionsFrom(children), keyOf=(value:string)=>value;
 const selection=value!==undefined?new Set([keyOf(String(value))]):undefined;
 return <Select {...(props as unknown as SelectProps<object>)} ref={ref} aria-label={props['aria-label']||'选择选项'} size="sm" radius="md" variant="bordered" isDisabled={disabled} isRequired={required} selectedKeys={selection} defaultSelectedKeys={defaultValue!==undefined?[keyOf(String(defaultValue))]:undefined} disabledKeys={items.filter(i=>i.disabled).map(i=>keyOf(i.value))} className={`blog-ui-field blog-ui-select ${className}`} classNames={{trigger:'shadow-none',value:'text-sm'}} popoverProps={{className:`blog-hero-surface ${readBlogTheme()}`,offset:6}} onChange={onChange}>
 {items.map(item=><SelectItem key={keyOf(item.value)} textValue={blogControlText(item.label)}>{item.label}</SelectItem>)}
 </Select>;
});
BlogSelect.displayName='BlogSelect';
export const BlogCheckbox=forwardRef<HTMLInputElement,InputHTMLAttributes<HTMLInputElement>&{toggle?:boolean}>(({toggle,className='',disabled,checked,defaultChecked,readOnly,required,type,size,color,...props},ref)=>{
 const Component=toggle?Switch:Checkbox;
 /*
  * HeroUI 的 Switch 会把没解构的 props 透传到 DOM 元素上，
  * isReadOnly / isRequired 落到 <span> 上 React 会报未知属性警告 —— 只给 Checkbox 传。
  */
 const extra=toggle?{}:{isReadOnly:readOnly,isRequired:required};
 return <Component {...(props as unknown as CheckboxProps & SwitchProps)} {...extra} ref={ref} as="span" size="sm" color="primary" isDisabled={disabled} isSelected={checked} defaultSelected={defaultChecked} aria-label={props['aria-label']||'选择'} className={`blog-ui-check ${className}`}/>;
});
BlogCheckbox.displayName='BlogCheckbox';
/** 状态/标签徽标：统一用 HeroUI Chip，不再各写一套圆角药丸。 */
export function BlogChip({children,color='default',variant='flat',size='sm',className='',...props}:HTMLAttributes<HTMLDivElement>&{color?:'default'|'primary'|'secondary'|'success'|'warning'|'danger';variant?:'flat'|'solid'|'bordered'|'dot'|'shadow'|'faded'|'light';size?:'sm'|'md'|'lg'}){
 return <Chip size={size} variant={variant} color={color} className={`blog-ui-chip ${className}`} {...props}>{children}</Chip>;
}
/** 可点选的筛选条：时间范围、视图切换这类「选一个」的场景。 */
export function BlogChipGroup({value,onChange,label,items,className=''}:{value:string;onChange:(key:string)=>void;label:string;items:{key:string;label:string;count?:number}[];className?:string}){
 return <div role="group" aria-label={label} className={`blog-ui-chip-group ${className}`}>
  {items.map(item=>{
   const active=item.key===value;
   return <Chip key={item.key} size="sm" variant={active?'solid':'flat'} color={active?'primary':'default'} role="button" tabIndex={0} aria-pressed={active}
    onClick={()=>onChange(item.key)}
    onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onChange(item.key);}}}
    className={`blog-ui-chip blog-ui-chip-selectable${active?' blog-ui-chip-active':''}`}>
    {item.label}{item.count!==undefined&&<span className="blog-ui-chip-count">{item.count}</span>}
   </Chip>;
  })}
 </div>;
}
export function BlogTabs({value,onChange,label,items}:{value:string;onChange:(key:string)=>void;label:string;items:{key:string;label:string;count?:number;description?:string}[]}){
 return <Tabs aria-label={label} selectedKey={value} onSelectionChange={key=>onChange(String(key))} color="primary" variant="underlined" size="sm" className="blog-ui-tabs" classNames={{base:'w-full',tabList:'gap-5 p-0 border-b border-divider w-full',tab:'w-auto h-11 px-1',cursor:'h-0.5 rounded-full',panel:'p-0'}}>{items.map(item=><Tab key={item.key} title={<span className="blog-ui-tab-title"><span className="blog-ui-tab-label">{item.label}{item.count!==undefined&&<span className="blog-ui-tab-count">{item.count}</span>}</span>{item.description&&<span className="blog-ui-tab-desc">{item.description}</span>}</span>}/>)}</Tabs>;
}

/**
 * 设置项开关：左侧标签（可带一行说明），右侧 HeroUI Switch。
 * 与「统计接入」页的「排除管理者访问」同一版式，全站设置统一用它，
 * 不再各写一套 BlogCheckbox / 原生 checkbox。
 */
export function BlogToggle({label,hint,checked,onChange,disabled}:{label:ReactNode;hint?:ReactNode;checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean}){
 return <div className="flex items-center justify-between gap-4">
  <div className="min-w-0">
   <span className="text-sm">{label}</span>
   {hint&&<p className="text-xs text-default-500">{hint}</p>}
  </div>
  <Switch size="sm" color="primary" isSelected={checked} isDisabled={disabled} onValueChange={onChange} aria-label={typeof label==='string'?label:'设置开关'}/>
 </div>;
}

/** 折叠面板统一的价值样式，和「统计接入」页保持一致。 */
export const blogAccordionItemClasses={
 base:'px-0',
 trigger:'py-1.5 px-0',
 title:'text-sm text-default-600',
 content:'pt-1 pb-2 px-0',
 indicator:'text-default-400 text-small',
};

/**
 * 单项折叠面板：替代原生 <details>/<summary>。
 * 原生 details 自带浏览器小三角、排版不受主题控制，这里统一换成 HeroUI Accordion。
 */
export function BlogDisclosure({title,children,defaultOpen=false,open,onOpenChange,titleClass}:{title:ReactNode;children:ReactNode;defaultOpen?:boolean;open?:boolean;onOpenChange?:(open:boolean)=>void;titleClass?:string}){
 return <Accordion selectionMode="single" className="px-0"
  defaultExpandedKeys={defaultOpen?new Set(['disclosure']):undefined}
  expandedKeys={open===undefined?undefined:(open?new Set(['disclosure']):new Set())}
  onExpandedChange={onOpenChange?(keys)=>onOpenChange(keys instanceof Set&&keys.has('disclosure')):undefined}
  itemClasses={{...blogAccordionItemClasses,...(titleClass?{title:`text-sm ${titleClass}`}:{})}}>
  <AccordionItem key="disclosure" aria-label={typeof title==='string'?title:'展开更多'} title={title}>{children}</AccordionItem>
 </Accordion>;
}
