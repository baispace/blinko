import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DEV_SELF_DESTRUCT_SERVICE_WORKER, devSelfDestructingServiceWorker } from '../../server/lib/devServiceWorker';

/**
 * 开发环境的 Service Worker 兜底。
 *
 * 这不是锦上添花：本地跑过生产容器（localhost:1111）之后，浏览器会在这个源上
 * 留下一个 Service Worker。那份旧 SW 带着 NavigationRoute，会把所有导航请求直接
 * 用预缓存里的旧 index.html 应答，根本不联网 —— 开发服务器明明在跑最新源码，
 * 页面却一直停在旧界面上（侧栏还是旧的「统计 / 资源 / 归档」，插件页一直转圈）。
 *
 * 而浏览器自己修不了：SW 的更新检查会取 /sw.js，开发服务器此时返回的是 SPA 的
 * HTML 壳页，MIME 类型不对，更新被拒，旧 SW 永远换不掉。
 *
 * 所以开发服务器必须给出一份合法的 JS，让旧 SW 被替换掉并自行注销。
 */

const ROOT = join(import.meta.dir, '../..');
const SERVER_INDEX = readFileSync(join(ROOT, 'server/index.ts'), 'utf8');

/** 用假 req/res 调一次中间件，返回「是否放行」与响应内容。 */
const call = (path: string, method = 'GET', nodeEnv = 'development') => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  const result: { passedThrough: boolean; headers: Record<string, string>; body?: string } = {
    passedThrough: false,
    headers: {},
  };
  const req = { method, path } as any;
  const res = {
    set(headers: Record<string, string>) {
      Object.assign(result.headers, headers);
      return res;
    },
    send(body: string) {
      result.body = body;
      return res;
    },
  } as any;
  devSelfDestructingServiceWorker()(req, res, () => {
    result.passedThrough = true;
  });
  if (previous === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previous;
  return result;
};

test('the dev server answers /sw.js with executable JavaScript, not the SPA shell', () => {
  const res = call('/sw.js');

  expect(res.passedThrough).toBe(false);
  // MIME 类型不对的话，浏览器的 SW 更新检查会直接拒绝更新 —— 这正是旧 SW 卡死的原因。
  expect(res.headers['Content-Type']).toContain('application/javascript');
  expect(res.body).toBe(DEV_SELF_DESTRUCT_SERVICE_WORKER);
  expect(res.body).toContain('self.registration.unregister()');
  expect(res.body).toContain('caches.delete');
});

test('the self-destructing worker is never cached, so every update check re-fetches it', () => {
  const res = call('/sw.js');

  expect(res.headers['Cache-Control']).toContain('no-store');
});

test('production keeps the real service worker from the build output', () => {
  const res = call('/sw.js', 'GET', 'production');

  // 生产必须原样提供构建产物里的 sw.js，中间件一律放行。
  expect(res.passedThrough).toBe(true);
  expect(res.body).toBeUndefined();
});

test('the dev worker only intercepts the service worker script', () => {
  expect(call('/index.html').passedThrough).toBe(true);
  expect(call('/registerSW.js').passedThrough).toBe(true);
  expect(call('/sw.js', 'POST').passedThrough).toBe(true);
});

test('the dev worker is registered before the static file middleware', () => {
  const workerIndex = SERVER_INDEX.indexOf('app.use(devSelfDestructingServiceWorker())');
  const staticIndex = SERVER_INDEX.indexOf('app.use(express.static(publicPath, staticOptions))');

  expect(workerIndex).toBeGreaterThan(-1);
  // 顺序反了的话，本地 server/public 里的生产 SW 会抢先应答，把开发页面冻在旧界面。
  expect(workerIndex).toBeLessThan(staticIndex);
});
