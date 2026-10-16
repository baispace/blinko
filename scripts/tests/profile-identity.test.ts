import { expect,test } from 'bun:test';
import { getAvatarUrl,mergeProfileIdentity,rememberHomeUrl } from '../../app/src/lib/profileIdentity';
test('refreshing a real profile updates nickname/avatar while preserving authentication and 2FA state',()=>{
  const session={token:'unchanged-session-token',expires:'future',requiresTwoFactor:false,user:{id:'7',name:'old',nickname:'old display',image:'old.png',role:'user',email:'kept@example.com'}};
  const result=mergeProfileIdentity(session,{id:7,name:'new',nickName:'真实昵称',image:'/api/file/new.png',role:'user'});
  expect(result?.user?.nickname).toBe('真实昵称'); expect(result?.user?.name).toBe('new'); expect(result?.user?.image).toBe('/api/file/new.png');
  expect(result?.token).toBe(session.token); expect(result?.expires).toBe(session.expires);expect(result?.requiresTwoFactor).toBe(false);expect(result?.user?.email).toBe(session.user.email);
  expect(session.user.name).toBe('old');
});
test('late responses for another account cannot replace the current identity',()=>{
  const session={token:'current-token',user:{id:'8',name:'current'}};
  expect(mergeProfileIdentity(session,{id:7,name:'other',nickName:'other',image:null,role:'superadmin'})).toBe(session);
  expect(mergeProfileIdentity(null,{id:7,name:'other',nickName:'other',image:null,role:'user'})).toBeNull();
});
test('home destination retains the content filter when visiting chat or settings',()=>{
  let home=rememberHomeUrl({pathname:'/',search:'?path=notes&tagId=9'});
  home=rememberHomeUrl({pathname:'/ai',search:''},home);
  home=rememberHomeUrl({pathname:'/settings',search:'?section=site'},home);
  expect(home).toBe('/?path=notes&tagId=9');
  expect(rememberHomeUrl({pathname:'/detail/12',search:''},home)).toBe(home);
  expect(rememberHomeUrl({pathname:'/',search:'?path=todo'},home)).toBe('/?path=todo');
});
test('avatar credentials are limited to local file URLs and preserve existing query parameters',()=>{
  const local=new URL(getAvatarUrl('/api/file/avatar.png?thumbnail=true','local-token','http://127.0.0.1:1111/'));
  expect(local.searchParams.get('token')).toBe('local-token');expect(local.searchParams.get('thumbnail')).toBe('true');
  expect(getAvatarUrl('https://example.com/avatar.png','local-token','http://127.0.0.1:1111/')).toBe('https://example.com/avatar.png');
  expect(getAvatarUrl('javascript:alert(1)','local-token','http://127.0.0.1:1111/')).toBe('');
});
