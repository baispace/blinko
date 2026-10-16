import type { TokenData } from '@/components/Auth/auth-client';
type Profile = { id:number; name:string; nickname?:string; nickName?:string; image:string|null; role:string };
/** Profile edits must update display data without replacing authentication state. */
export function mergeProfileIdentity(session:TokenData|null, profile:Profile):TokenData|null {
  if(!session?.user?.id || String(session.user.id)!==String(profile.id)) return session;
  return {...session,user:{...session.user,name:profile.name,nickname:profile.nickName ?? profile.nickname ?? '',image:profile.image || '',role:profile.role}};
}
export function rememberHomeUrl(location:{pathname:string;search:string}, previous='/') {
  return location.pathname==='/' ? `/${location.search}` : previous;
}

/** Only attach local file credentials to the configured Blinko origin. */
export function getAvatarUrl(image:string, token:string, endpoint:string) {
  if(!image) return '';
  try {
    const url=new URL(image,endpoint),base=new URL(endpoint);
    if(!['http:','https:'].includes(url.protocol)) return '';
    if(url.origin===base.origin && url.pathname.startsWith('/api/file/') && token) url.searchParams.set('token',token);
    return url.toString();
  } catch { return ''; }
}
