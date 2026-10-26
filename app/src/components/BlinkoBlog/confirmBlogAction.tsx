import {useState,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {HeroUIProvider,Modal,ModalContent,ModalHeader,ModalBody,ModalFooter,Button} from '@heroui/react';
import {readBlogTheme} from '@/lib/blogTheme';
import './hero-admin.css';
let pending:Promise<boolean>|null=null;
/** Shared accessible confirmation; no native browser dialogs. */
export function confirmBlogAction(message:string):Promise<boolean>{
 if(pending)return pending;
 const mount=document.createElement('div');document.body.appendChild(mount);const root=createRoot(mount);
 pending=new Promise<boolean>(resolve=>{
 function Confirmation(){
  const [open,setOpen]=useState(true);const settled=useRef(false);const danger=/删除|撤回|移除/.test(message);
  const finish=(accepted:boolean)=>{if(settled.current)return;settled.current=true;setOpen(false);resolve(accepted);pending=null;setTimeout(()=>{root.unmount();mount.remove()},220)};
  return <HeroUIProvider><Modal isOpen={open} onClose={()=>finish(false)} placement="center" size="md" backdrop="opaque" className={`blog-hero-surface ${readBlogTheme()}`}><ModalContent><ModalHeader className="text-base">{/未保存/.test(message)?'未保存的修改':'确认操作'}</ModalHeader><ModalBody><p className="text-sm leading-6 text-default-600">{message}</p></ModalBody><ModalFooter><Button size="sm" variant="light" onPress={()=>finish(false)}>取消</Button><Button size="sm" color={danger?'danger':'primary'} onPress={()=>finish(true)}>确认继续</Button></ModalFooter></ModalContent></Modal></HeroUIProvider>;
 }
 root.render(<Confirmation/>);
 });return pending;
}
