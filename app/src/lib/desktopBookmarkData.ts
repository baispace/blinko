export type DesktopBookmark = { id:number; title:string };
export function desktopBookmarkKey(endpoint:string, owner:string) {
  return `ink.desktop-bookmarks:${endpoint.replaceAll('"','').replace(/\/+$/,'')}:${owner}`;
}
export function decodeDesktopBookmarks(value:string|null): DesktopBookmark[] {
  try {
    const rows:unknown=JSON.parse(value||'[]');
    if(!Array.isArray(rows))return [];
    const seen=new Set<number>();
    return rows.filter(row=>{
      if(!Number.isSafeInteger(row?.id)||row.id<=0||row.id>4294967295||typeof row.title!=='string'||seen.has(row.id))return false;
      seen.add(row.id);return true;
    }).slice(0,100).map(row=>({id:row.id,title:row.title.slice(0,60)}));
  } catch{return [];}
}
export function bookmarkTitle(content:string) {
  return content.replace(/<[^>]*>/g,' ').replace(/[#*_`]/g,'').trim().split('\n').find(line=>line.trim())?.trim().slice(0,60)||'未命名闪念';
}
