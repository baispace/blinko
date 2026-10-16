import { invoke } from '@tauri-apps/api/core';
import { platform } from '@tauri-apps/plugin-os';
import { RootStore } from '@/store';
import { UserStore } from '@/store/user';
import { getSavedEndpoint } from './blinkoEndpoint';
import { decodeDesktopBookmarks, desktopBookmarkKey, type DesktopBookmark } from './desktopBookmarkData';
export { bookmarkTitle, type DesktopBookmark } from './desktopBookmarkData';
export function supportsDesktopBookmarks() {
  try { return !!(window as any).__TAURI__ && platform() === 'macos'; } catch { return false; }
}
function storageKey() { return desktopBookmarkKey(getSavedEndpoint(), String(RootStore.Get(UserStore).id)); }
export function readDesktopBookmarks(): DesktopBookmark[] {
  try {
    return decodeDesktopBookmarks(localStorage.getItem(storageKey()));
  } catch { return []; }
}
export async function openDesktopBookmark(note: DesktopBookmark) {
  if (!Number.isSafeInteger(note.id) || note.id <= 0 || note.id > 4294967295) throw new Error('闪念地址无效');
  await invoke('open_pinned_note',{noteId:note.id,title:note.title});
  const rows = readDesktopBookmarks();
  localStorage.setItem(storageKey(),JSON.stringify([note,...rows.filter(row=>row.id!==note.id)].slice(0,100)));
  window.dispatchEvent(new Event('ink-bookmarks-changed'));
}
export function removeDesktopBookmark(id: number) {
  localStorage.setItem(storageKey(),JSON.stringify(readDesktopBookmarks().filter(row=>row.id!==id)));
  window.dispatchEvent(new Event('ink-bookmarks-changed'));
}
