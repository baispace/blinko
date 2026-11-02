import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 后台「域名与部署」面板。
 *
 * 这块面板被误删过一次：bc6b5bb3 删掉了 BlogDeploymentSettings.tsx，
 * 但同一次提交又把导航文案写成「基础信息、域名与部署、统计接入」——
 * 导航承诺了一个不存在的面板，部署手册也照着那个入口写，
 * 结果上线时没人找得到该在哪儿填公开基础路径。
 *
 * 这里把「导航承诺了什么，面板就必须提供什么」钉成断言。
 */

const ROOT = join(import.meta.dir, '../..');
const PANEL = join(ROOT, 'app/src/components/BlinkoBlog/BlogSiteSettingsPanel.tsx');
const DEPLOYMENT = join(ROOT, 'app/src/components/BlinkoBlog/BlogDeploymentSettings.tsx');
const NAV = join(ROOT, 'app/src/components/BlinkoBlog/studioNav.ts');
const ROUTER = join(ROOT, 'server/routerTrpc/blog.ts');
const SCHEMA = join(ROOT, 'shared/lib/blogSiteSettings.ts');
const SERVER_INDEX = join(ROOT, 'server/index.ts');
const PUBLIC_BLOG = join(ROOT, 'server/lib/publicBlog.ts');
const RESOLVER = join(ROOT, 'shared/lib/blogDeployment.ts');

const panel = readFileSync(PANEL, 'utf8');
const deployment = readFileSync(DEPLOYMENT, 'utf8');
const nav = readFileSync(NAV, 'utf8');
const router = readFileSync(ROUTER, 'utf8');
const schema = readFileSync(SCHEMA, 'utf8');
const serverIndex = readFileSync(SERVER_INDEX, 'utf8');
const publicBlog = readFileSync(PUBLIC_BLOG, 'utf8');
const resolver = readFileSync(RESOLVER, 'utf8');

/**
 * 导航里承诺了「域名与部署」，站点设置面板就必须真的有这个分区。
 *
 * 写成「有承诺就要有入口」而不是「必须有这个分区」，
 * 这样将来真要撤掉这个分区时，改一处提示即可，测试会提示同步。
 */
test('the site settings panel provides the deployment section the navigation advertises', () => {
  expect(nav).toContain('域名与部署');
  expect(panel).toContain('["deployment", "域名与部署"]');
  expect(panel).toContain('<BlogDeploymentSettings');
  expect(panel).toContain('deployment:');
});

/**
 * 迁移域名要改的四个字段，后台都得能改。
 *
 * publicBasePath 决定对外路径，targetOrigin 是目标域名，
 * legacyBasePath + legacyRedirectEnabled 负责旧地址 301。
 * 少一个就有一步做不了 —— 只能退回改数据库。
 */
test('the deployment section can edit every field a domain migration needs', () => {
  for (const field of [
    'targetOrigin',
    'publicBasePath',
    'legacyBasePath',
    'legacyRedirectEnabled',
  ]) {
    expect(deployment).toContain(field);
    expect(deployment).toContain(`patch({ ${field}:`);
  }
  // 生效地址仍然单独显示（只读），但它现在是「服务端算出来的结果」，
  // 而不是另一个需要你单独维护的真相来源。
  expect(deployment).toContain('deployedOrigin');
  expect(deployment).toContain('BLOG_PUBLIC_URL');
});

/**
 * 面板里给的反向代理模板必须带着两个已知修正。
 *
 * 坑 1：根路径不用精确匹配会无限重定向。
 * 坑 2：公开 API 只写 blog.public 前缀会漏掉三个不以 public 开头的路由，
 *       阅读统计和读者回应会静默失败。
 */
test('the bundled reverse proxy template keeps both known fixes', () => {
  expect(deployment).toContain('location = / {');
  expect(deployment).toContain('proxy_pass http://127.0.0.1:1111/blog;');
  expect(deployment).toContain(
    'location ~ ^/api/trpc/blog\\\\.(public[A-Za-z]+|trackView|recommendationEvent|reportTrackingState)$',
  );
});

/**
 * 模板里的公开 API 规则必须覆盖真实存在的每一个公开路由。
 *
 * 路由名从服务端源码里读，不写死 —— 以后加了公开路由而忘了放行，
 * 这里会直接报出来，而不是等到线上统计静默失效才发现。
 */
test('the reverse proxy template allows every public blog route', () => {
  const line = deployment.split('\n').find((l) => l.includes('location ~ ^'));
  expect(line).toBeTruthy();
  const rule = line!.split('location ~ ^')[1].split('$ {')[0].trim();
  // 模板字符串里的 \\ 是转义，运行时只剩一个反斜杠。
  const pattern = new RegExp(`^${rule.replace(/\\\\/g, '\\')}$`);

  const routes = [...router.matchAll(/^\s+([a-zA-Z]+):\s*publicProcedure/gm)].map(
    (m) => m[1],
  );
  expect(routes.length).toBeGreaterThan(0);
  // 这三个不以 public 开头，最容易被漏掉。
  for (const route of ['trackView', 'recommendationEvent', 'reportTrackingState']) {
    expect(routes).toContain(route);
  }
  for (const route of routes) {
    expect(pattern.test('/api/trpc/blog.' + route)).toBe(true);
  }
});

/**
 * 服务端仍然认这四个字段。
 *
 * 面板只是入口，真正生效的是服务端读配置的地方；
 * 面板和读取端必须一起存在，否则会出现「填了但没人用」。
 */
test('the server still reads the deployment fields the panel writes', () => {
  expect(schema).toContain('targetOrigin: url.default("")');
  expect(schema).toContain('publicBasePath: basePath.default("/blog")');
  expect(schema).toContain('legacyBasePath: basePath.default("")');
  expect(schema).toContain('legacyRedirectEnabled: z.boolean().default(false)');

  // 服务端不再各自读一遍原始字段，而是统一走 resolveBlogDeployment ——
  // 否则 canonical、站点地图、301 各自算一遍，漏改一处地址就一半带前缀一半不带。
  expect(serverIndex).toContain('resolveBlogDeployment(data)');
  expect(resolver).toContain('settings?.publicBasePath');
  expect(resolver).toContain('settings?.legacyBasePath');
  expect(resolver).toContain('settings?.legacyRedirectEnabled');
  expect(resolver).toContain('settings?.targetOrigin');
});

/**
 * 面板不能因为环境变量就把字段锁成只读。
 *
 * 曾经是「环境变量优先 + 后台只读」，结果是每次换域名都要去服务器改
 * compose、重建容器，后台面板看着能改却改不动。现在环境变量只是兜底，
 * 后台永远是主人 —— 面板必须保持可编辑。
 */
test('the deployment panel never locks a field because of an environment variable', () => {
  expect(deployment).not.toContain('envOwned');
  // 兜底变量只出现在提示文案里，不参与禁用输入框。
  expect(deployment).not.toContain('disabled={owned');
  expect(deployment).not.toContain('readOnly={owned');
  expect(deployment).toContain('envFallback');
});

/**
 * 面板必须告诉用户「保存就生效」。
 *
 * 这是这次改造的核心承诺：不用改服务器环境变量、不用重启容器。
 * 文案没了，用户就会跑去改 compose。
 */
test('the deployment panel states that saving takes effect without a restart', () => {
  expect(deployment).toContain('30 秒内生效');
  expect(deployment).toContain('不用重启容器');
});

/**
 * 后台填的地址必须真的驱动线上输出。
 *
 * canonical、站点地图、RSS 都以服务端算出的生效地址为准 ——
 * 如果这里退回直接读环境变量，后台改地址就等于没改。
 */
test('the panel value drives the origin the server actually renders', () => {
  expect(serverIndex).toContain(
    "publicOrigin(`${req.protocol}://${req.get('host')}`, runtime.targetOrigin)",
  );
  // siteSettings 接口回给面板的生效地址，也必须是解析后的结果。
  expect(router).toContain('deployedOrigin: deployment.targetOrigin');
  expect(router).not.toContain("deployedOrigin: process.env.BLOG_PUBLIC_URL");
});

/**
 * 反馈邮件里的公开链接也要跟着后台的地址走。
 *
 * 否则后台换了域名，读者收到的回复通知里还是旧地址。
 */
test('feedback links follow the effective public origin', () => {
  const interaction = readFileSync(
    join(ROOT, 'server/lib/blogInteraction.ts'),
    'utf8',
  );
  const moment = readFileSync(
    join(ROOT, 'server/lib/blogMomentFeedback.ts'),
    'utf8',
  );
  for (const text of [interaction, moment]) {
    expect(text).toContain('effectivePublicOrigin(db)');
    expect(text).not.toContain('process.env.BLOG_PUBLIC_URL ||');
  }
});
