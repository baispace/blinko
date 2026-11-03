/**
 * 开发环境的「自杀式」Service Worker。
 *
 * 问题：开发服务器不开 PWA（vite-plugin-pwa 在 development 被关掉），
 * /sw.js 会掉进 SPA 兜底，返回一个 HTML 壳页。但浏览器可能早就在这个源上
 * 注册过 Service Worker —— 只要生产构建曾在同一个地址上跑过（比如
 * localhost:1111 上跑生产容器），那个旧 SW 就会一直控制着这个源。
 *
 * 旧 SW 带着 NavigationRoute，会把所有导航请求直接用预缓存里的旧 index.html
 * 应答，根本不联网。于是开发服务器明明已经在跑最新源码，页面却一直停在旧界面上，
 * 而且浏览器自己也修不了：SW 的更新检查会取 /sw.js，拿到 text/html 后因为
 * MIME 类型不对而拒绝更新 —— 旧 SW 永远换不掉。
 *
 * 做法：返回一份合法的 JS（正确的 Content-Type）。浏览器下次访问时会把旧 SW
 * 换成这一份，而这一份激活后立刻清掉旧缓存并注销自己，旧 SW 就彻底消失了。
 */

/** 自杀式 SW 源码：清掉旧版本留下的缓存，然后注销自己。 */
export const DEV_SELF_DESTRUCT_SERVICE_WORKER = `// 自杀式 Service Worker：清掉旧版本留下的缓存，然后注销自己。
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch (e) {}
  try { await self.clients.claim(); } catch (e) {}
  try { await self.registration.unregister(); } catch (e) {}
});
`;

/**
 * 只在开发环境接管 /sw.js。
 *
 * 生产环境必须原样提供构建产物里真正的 sw.js（express.static 会先命中它，
 * 而且生产要的就是能缓存资源的正式 SW），所以这里一律放行。
 */
export const devSelfDestructingServiceWorker = () => {
  return (req: any, res: any, next: any) => {
    if (process.env.NODE_ENV === 'production') return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path !== '/sw.js') return next();
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      // 必须 no-store：浏览器要能每次更新检查都拿到新脚本，旧 SW 才会被替换。
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Service-Worker-Allowed': '/',
    });
    res.send(DEV_SELF_DESTRUCT_SERVICE_WORKER);
  };
};
