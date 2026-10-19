/**
 * 无需登录即可访问的路由。
 *
 * 这份名单原先在 `store/user.ts`（全局登录守卫与登出监听）和
 * `App.tsx`（ProtectedRoute）里各抄了一份，两边一旦不同步就会出现
 * 「接口是公开的，但页面把访客踢回登录页」。新增公开页时只改这里。
 *
 * 语义：登录成功后跳回首页、登出后跳登录页，这些路径都必须放行。
 */
const PUBLIC_PREFIXES = ['/share', '/ai-share', '/oauth-callback', '/blog'] as const;
const PUBLIC_EXACT = ['/signin', '/signup', '/_offline'] as const;

export function isPublicRoute(pathname: string): boolean {
  return (
    PUBLIC_EXACT.includes(pathname as (typeof PUBLIC_EXACT)[number]) ||
    PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}
