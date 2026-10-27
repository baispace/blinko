import { Children,isValidElement,type ReactNode } from 'react';
import { Button,Dropdown,DropdownTrigger,DropdownMenu,DropdownItem } from '@heroui/react';
import { Icon } from '@/components/Common/Iconify/icons';
import { readBlogTheme } from '@/lib/blogTheme';
import { blogControlText } from './BlogUI';

/** HeroUI handles the portal, placement, focus return, keyboard and dismissal. */
export function RowMenu({label,children}:{label:string;children:ReactNode}){
 const items=Children.toArray(children).filter(isValidElement<any>);
 return <Dropdown placement="bottom-end" className={`blog-hero-surface ${readBlogTheme()}`}>
  <DropdownTrigger><Button isIconOnly size="sm" radius="md" variant="light" aria-label={label}><Icon icon="tabler:dots" width={18}/></Button></DropdownTrigger>
  <DropdownMenu aria-label={label} disabledKeys={items.flatMap((item,index)=>item.props.disabled?[String(index)]:[])} onAction={key=>{const item=items[Number(key)];void item?.props.onClick?.();}}>
   {items.map((item,index)=><DropdownItem key={String(index)} textValue={blogControlText(item.props.children)} color={item.props['data-danger']==='true'?'danger':'default'} className={item.props['data-danger']==='true'?'text-danger':''}><span className="flex items-center gap-2">{item.props.children}</span></DropdownItem>)}
  </DropdownMenu>
 </Dropdown>;
}
