import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HeroUIProvider,Modal,ModalContent,ModalHeader,ModalBody,Button} from '@heroui/react';
import {StaticAssetUploadDialog} from '../../../../app/src/components/BlinkoSettings/StaticAssetUploadDialog';
import.meta.glob('../../../../dist/public/assets/index-*.css',{eager:true});
function Test(){
  const [open,setOpen]=useState(false);
  return <HeroUIProvider><Modal isOpen hideCloseButton disableAnimation classNames={{wrapper:'!z-[10060]',backdrop:'!z-[10059]'}}>
    <ModalContent><ModalHeader>设置窗口</ModalHeader><ModalBody><Button onPress={()=>setOpen(true)}>上传静态资源</Button></ModalBody></ModalContent>
  </Modal><StaticAssetUploadDialog isOpen={open} onClose={()=>setOpen(false)} uploading={false}>
    <ModalHeader>上传到 CDN</ModalHeader><ModalBody><p role="status">正在读取资源列表…</p><Button onPress={()=>setOpen(false)}>取消上传选择</Button></ModalBody>
  </StaticAssetUploadDialog></HeroUIProvider>;
}
createRoot(document.getElementById('root')!).render(<Test/>);
