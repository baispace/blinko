import { describe, test, expect } from 'bun:test';
import { isPublicRoute } from '../../app/src/lib/publicRoutes';

// 这份名单过去在 store/user.ts 和 App.tsx 各抄了一份，两边漂移过一次：
// /blog/:id 的接口是 publicProcedure，却因为白名单漏了 /blog，
// 访客一打开公开链接就被全局登录守卫弹回 /signin。锁住完整名单。
describe('公开路由白名单', () => {
  test('免登录页面', () => {
    for (const path of ['/signin', '/signup', '/_offline']) expect(isPublicRoute(path)).toBe(true);
  });

  test('公开内容前缀（含子路径）', () => {
    for (const prefix of ['/share', '/ai-share', '/oauth-callback', '/blog']) {
      expect(isPublicRoute(prefix)).toBe(true);
      expect(isPublicRoute(`${prefix}/abc123`)).toBe(true);
      expect(isPublicRoute(`${prefix}/a/b/c`)).toBe(true);
    }
  });

  test('已发布文章链接不会被踢回登录页', () => {
    // 24 位十六进制 publishId 是发布功能实际生成的形态
    expect(isPublicRoute('/blog/400b5df9140371cf8124e924')).toBe(true);
  });

  test('内部页面仍然需要登录', () => {
    for (const path of ['/', '/ai', '/?path=notes', '/detail?id=1', '/resources', '/review', '/ai/tasks', '/editor']) {
      expect(isPublicRoute(path)).toBe(false);
    }
  });

  test('相似前缀不得被误判为公开', () => {
    // 前缀写法若退化成 includes()，这些会漏成公开
    for (const path of ['/blogger', '/shared-secret', '/blogadmin', '/blogs']) {
      expect(isPublicRoute(path)).toBe(false);
    }
  });
});
