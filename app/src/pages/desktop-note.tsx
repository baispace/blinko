import { Card, CardHeader, CardBody, CardFooter } from '@heroui/react';
import './desktop-note.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';
import { BlinkoEditor } from '@/components/BlinkoEditor';
import { Icon } from '@/components/Common/Iconify/icons';
import { api } from '@/lib/trpc';
import { bookmarkTitle } from '@/lib/desktopBookmarks';
import { ToastPlugin } from '@/store/module/Toast/Toast';
import { NoteType } from '@shared/lib/types';

export default observer(function DesktopNotePage() {
  const [params] = useSearchParams();
  const id=Number(params.get('id') || getCurrentWebviewWindow().label.replace('pinned-note-','')), blinko=RootStore.Get(BlinkoStore);
  const [loaded,setLoaded]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [collapsed,setCollapsed]=useState(false),[pinned,setPinned]=useState(true),[busy,setBusy]=useState(false);
  const saveRef=useRef<(()=>Promise<boolean>)|null>(null), allowClose=useRef(false);
  const onSaveReady=useCallback((save:(()=>Promise<boolean>)|null)=>{saveRef.current=save;},[]);
  useEffect(()=>{
    let cancelled=false; setLoaded(false); setError('');
    if (!Number.isSafeInteger(id)||id<=0) {setError('闪念地址无效');return;}
    void api.notes.detail.mutate({id}).then(note=>{
      if(cancelled)return;
      if(!note || note.isRecycle || note.type!==NoteType.BLINKO) throw new Error('闪念不存在、已移入回收站或类型已变更');
      blinko.curSelectedNote=note as any; blinko.isCreateMode=false; setLoaded(true);
    }).catch(error=>{if(!cancelled)setError(error instanceof Error?error.message:'读取闪念失败');});
    return ()=>{cancelled=true;};
  },[id,retry,blinko]);
  const close=useCallback(async()=>{
    if(saveRef.current && !await saveRef.current()) return;
    allowClose.current=true; await getCurrentWebviewWindow().close();
  },[]);
  useEffect(()=>{
    let disposed=false; let unlisten:(()=>void)|undefined;
    void getCurrentWebviewWindow().onCloseRequested(event=>{
      if(allowClose.current)return;
      event.preventDefault(); void close();
    }).then(off=>{if(disposed)off();else unlisten=off;});
    return ()=>{disposed=true;unlisten?.();};
  },[close]);
  const changeWindow=async(action:()=>Promise<unknown>)=>{
    if(busy)return; setBusy(true);
    try{await action();}catch{RootStore.Get(ToastPlugin).error('窗口调整失败，请重试');}finally{setBusy(false);}
  };
  useEffect(() => {
    if (loaded && blinko.autosaveStatus === 'saved') {
      localStorage.setItem('ink.desktop-note-saved', JSON.stringify({id,at:Date.now()}));
    }
  }, [loaded, id, blinko.autosaveStatus]);
  useEffect(() => {
    const initialIdentity = localStorage.getItem('blinkoToken');
    const onAccountChange = (event:StorageEvent) => {
      if (event.key === 'blinkoToken' && event.newValue !== initialIdentity) {
        try {
          const before=JSON.parse(initialIdentity||'null'), after=JSON.parse(event.newValue||'null');
          if (before?.user?.id === after?.user?.id && after?.token) return;
        } catch { /* fail closed when the stored session is invalid */ }
        setLoaded(false); setError('账户已退出或切换，请关闭此浮窗后重新打开');
      }
    };
    window.addEventListener('storage',onAccountChange);
    return ()=>window.removeEventListener('storage',onAccountChange);
  }, []);
  useEffect(() => {
    document.documentElement.classList.add('desktop-note-window');
    return () => document.documentElement.classList.remove('desktop-note-window');
  }, []);
  useEffect(() => {
    // 增强的窗口状态监控：在挂载、失去焦点、获取焦点时都确认置顶状态
    const apply = () => { 
      void invoke('set_pinned_note_top',{pinned}).catch(()=>
        RootStore.Get(ToastPlugin).error('置顶设置失败，请点击图钉重试')
      ); 
    };
    
    // 初始应用
    apply();
    
    // 添加更频繁的状态检查
    const events = ['blur', 'focus', 'visibilitychange'];
    const handlers = {
      onBlur: () => { 
        if (pinned) {
          // 失去焦点后稍微延迟检查，确保其他窗口已完全获得焦点
          setTimeout(apply, 100);
        }
      },
      onFocus: () => {
        if (pinned) {
          // 重新获得焦点时也确认置顶状态
          apply();
        }
      },
      onVisibilityChange: () => {
        if (pinned && document.visibilityState === 'visible') {
          // 页面变为可见时（如从其他应用切换回来）
          apply();
        }
      }
    };
    
    // 注册事件监听器
    window.addEventListener('blur', handlers.onBlur);
    window.addEventListener('focus', handlers.onFocus);
    document.addEventListener('visibilitychange', handlers.onVisibilityChange);
    
    // 可选：定期检查窗口状态（每30秒）
    const intervalId = pinned ? setInterval(() => {
      apply();
    }, 30000) : null;
    
    return () => {
      window.removeEventListener('blur', handlers.onBlur);
      window.removeEventListener('focus', handlers.onFocus);
      document.removeEventListener('visibilitychange', handlers.onVisibilityChange);
      if (intervalId) clearInterval(intervalId);
    };
  }, [pinned]);
  const status={idle:'自动保存',saving:'正在保存…',saved:'已保存',error:'保存失败 · ⌘S 重试'}[blinko.autosaveStatus];
  const title=loaded?bookmarkTitle(blinko.curSelectedNote?.content||''):'桌面闪念';
  return <div className="desktop-note-shell"><Card radius="lg" shadow="lg" className={`desktop-note-card ${collapsed?'is-collapsed':''}`} aria-label="桌面闪念">
    <CardHeader data-tauri-drag-region className="desktop-note-header">
      <button type="button" aria-label={collapsed?'展开闪念':'收起为书签'} title={collapsed?'展开闪念':'收起为书签'} disabled={busy} className="rounded-md p-1.5 text-default-500 hover:bg-default-100" onClick={()=>void changeWindow(async()=>{await invoke('resize_pinned_note',{collapsed:!collapsed});setCollapsed(!collapsed);})}><Icon icon={collapsed?'tabler:chevron-down':'tabler:chevron-up'} width={16}/></button>
      <span data-tauri-drag-region className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
      <button type="button" aria-label={pinned?'取消窗口置顶':'窗口置顶'} title={pinned?'已置顶 · 点击取消':'置顶窗口'} aria-pressed={pinned} disabled={busy} className={`rounded-md p-1.5 hover:bg-default-100 ${pinned?'text-primary':'text-default-400'}`} onClick={()=>void changeWindow(async()=>{await invoke('set_pinned_note_top',{pinned:!pinned});setPinned(!pinned);})}><Icon icon={pinned?'solar:pin-bold':'solar:pin-linear'} width={17}/></button>
      <button type="button" aria-label="保存并关闭浮窗" title="保存并关闭（保留书签）" className="rounded-md p-1.5 text-default-400 hover:bg-default-100 hover:text-foreground" onClick={()=>void close()}><Icon icon="tabler:x" width={17}/></button>
    </CardHeader>
    <CardBody className={`desktop-note-body ${collapsed?'hidden':''}`}>
      {error?<div role="alert" className="space-y-3 p-4 text-sm"><p>{error}</p><button type="button" className="text-primary" onClick={()=>setRetry(value=>value+1)}>重新读取</button></div>:!loaded?<p role="status" className="p-5 text-sm text-default-400">正在读取闪念…</p>:<BlinkoEditor key={id} mode="edit" hideDoneButton hideFullscreenButton hideNoteTypeButton fixedNoteType={NoteType.BLINKO} composerVariant="flash" onSaveReady={onSaveReady} focusOnMount={false} />}
    </CardBody>
    {!collapsed&&loaded&&<CardFooter className={`desktop-note-footer ${blinko.autosaveStatus==='error'?'text-danger':'text-default-400'}`} role="status">{status}<span className="float-right">⌘S 保存</span></CardFooter>}
  </Card></div>;
});
