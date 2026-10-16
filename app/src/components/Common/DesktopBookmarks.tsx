import { useEffect, useState } from 'react';
import { Icon } from './Iconify/icons';
import { readDesktopBookmarks, openDesktopBookmark, removeDesktopBookmark } from '@/lib/desktopBookmarks';
import { RootStore } from '@/store';
import { ToastPlugin } from '@/store/module/Toast/Toast';
export function DesktopBookmarks() {
  const [rows,setRows] = useState(readDesktopBookmarks);
  useEffect(() => {
    const refresh=()=>setRows(readDesktopBookmarks());
    window.addEventListener('storage',refresh); window.addEventListener('ink-bookmarks-changed',refresh);
    return ()=>{window.removeEventListener('storage',refresh);window.removeEventListener('ink-bookmarks-changed',refresh);};
  },[]);
  return <div className="space-y-3"><p className="text-xs leading-relaxed text-default-400">从闪念的「⋯」选择「固定到桌面」。关闭浮窗后，仍可从这里重新打开。</p>
    {!rows.length ? <p className="py-8 text-center text-sm text-default-400">还没有桌面书签</p> : <ul className="max-h-[55dvh] space-y-1 overflow-y-auto">{rows.map(row=><li key={row.id} className="flex items-center gap-2 rounded-lg hover:bg-default-100">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left text-sm" onClick={()=>void openDesktopBookmark(row).catch(()=>RootStore.Get(ToastPlugin).error('无法打开闪念，请重试'))}><Icon icon="solar:pin-linear" width={18}/><span className="truncate">{row.title}</span></button>
      <button type="button" aria-label={`移除书签：${row.title}`} title="移除书签，不删除闪念" className="mr-2 rounded-md p-2 text-default-400 hover:text-danger" onClick={()=>removeDesktopBookmark(row.id)}><Icon icon="tabler:x" width={15}/></button>
    </li>)}</ul>}
  </div>;
}
