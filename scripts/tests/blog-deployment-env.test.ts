import { expect, test } from 'bun:test';
import {
  BLOG_DEPLOY_ENV,
  parseEnvFlag,
  resolveBlogDeployment,
} from '../../shared/lib/blogDeployment';

/**
 * 部署参数的环境变量层。
 *
 * 一次域名迁移要动的东西应该集中在一处（容器的 environment 段），
 * 而不是拆成「服务器配置」和「后台点几下」两半。这里钉住那套优先级。
 */

const noEnv = {} as Record<string, string | undefined>;

test('没有环境变量时，后台设置照旧生效', () => {
  const d = resolveBlogDeployment(
    {
      targetOrigin: "https://blog.example.com",
      publicBasePath: "/",
      legacyBasePath: "/blog",
      legacyRedirectEnabled: true,
    },
    noEnv,
  );
  expect(d.publicBasePath).toBe("/");
  expect(d.targetOrigin).toBe("https://blog.example.com");
  expect(d.legacyBasePath).toBe("/blog");
  expect(d.legacyRedirectEnabled).toBe(true);
  expect(d.envOwned).toEqual({
    publicBasePath: false,
    legacyBasePath: false,
    legacyRedirectEnabled: false,
    targetOrigin: false,
  });
});

test('环境变量接管挂载路径与旧地址规则', () => {
  const d = resolveBlogDeployment(
    { publicBasePath: "/blog", legacyBasePath: "", legacyRedirectEnabled: false },
    {
      [BLOG_DEPLOY_ENV.basePath]: "/",
      [BLOG_DEPLOY_ENV.legacyBasePath]: "/blog",
      [BLOG_DEPLOY_ENV.legacyRedirect]: "1",
    },
  );
  // 环境变量优先：后台存的 /blog 不再说了算。
  expect(d.publicBasePath).toBe("/");
  expect(d.legacyBasePath).toBe("/blog");
  expect(d.legacyRedirectEnabled).toBe(true);
  expect(d.envOwned.publicBasePath).toBe(true);
  expect(d.envOwned.legacyBasePath).toBe(true);
  expect(d.envOwned.legacyRedirectEnabled).toBe(true);
});

test("目标地址反过来：后台填了就以后台为准", () => {
  // BLOG_PUBLIC_URL 是「当前生效的地址」；后台的 targetOrigin 是「我还想换到哪」。
  // 后台填了就该以后台为准 —— 否则后台填的目标会被生效地址盖掉。
  const d = resolveBlogDeployment(
    { targetOrigin: "https://next.example.com" },
    { [BLOG_DEPLOY_ENV.origin]: "https://blog.example.com" },
  );
  expect(d.targetOrigin).toBe("https://next.example.com");
  expect(d.envOwned.targetOrigin).toBe(false);
});

test("后台没填目标地址时回落到 BLOG_PUBLIC_URL", () => {
  const d = resolveBlogDeployment(
    { targetOrigin: "" },
    { [BLOG_DEPLOY_ENV.origin]: "https://blog.example.com" },
  );
  expect(d.targetOrigin).toBe("https://blog.example.com");
  expect(d.envOwned.targetOrigin).toBe(true);
});

test("环境变量写坏了不会悄悄改变线上行为", () => {
  // 路径不合法 → 当作没设，回落到后台的值。
  const d = resolveBlogDeployment(
    { publicBasePath: "/blog" },
    { [BLOG_DEPLOY_ENV.basePath]: "https://evil.example.com/blog" },
  );
  expect(d.publicBasePath).toBe("/blog");
  expect(d.envOwned.publicBasePath).toBe(false);

  // 布尔值分不出真假 → 回落到后台的值。
  const d2 = resolveBlogDeployment(
    { legacyRedirectEnabled: true },
    { [BLOG_DEPLOY_ENV.legacyRedirect]: "maybe" },
  );
  expect(d2.legacyRedirectEnabled).toBe(true);
  expect(d2.envOwned.legacyRedirectEnabled).toBe(false);
});

test("环境变量能显式关掉后台打开的开关", () => {
  const d = resolveBlogDeployment(
    { legacyRedirectEnabled: true },
    { [BLOG_DEPLOY_ENV.legacyRedirect]: "0" },
  );
  expect(d.legacyRedirectEnabled).toBe(false);
  expect(d.envOwned.legacyRedirectEnabled).toBe(true);
});

test("布尔环境变量只认明确的真值", () => {
  expect(parseEnvFlag("1")).toBe(true);
  expect(parseEnvFlag("true")).toBe(true);
  expect(parseEnvFlag("YES")).toBe(true);
  expect(parseEnvFlag("on")).toBe(true);
  expect(parseEnvFlag("0")).toBe(false);
  expect(parseEnvFlag("false")).toBe(false);
  expect(parseEnvFlag("off")).toBe(false);
  expect(parseEnvFlag("")).toBeNull();
  expect(parseEnvFlag(undefined)).toBeNull();
  expect(parseEnvFlag("maybe")).toBeNull();
});

test("尾斜杠会被归一，根路径保留为 /", () => {
  const d = resolveBlogDeployment(
    {},
    { [BLOG_DEPLOY_ENV.basePath]: "/" },
  );
  expect(d.publicBasePath).toBe("/");

  const d2 = resolveBlogDeployment({}, { [BLOG_DEPLOY_ENV.basePath]: "/sub/" });
  expect(d2.publicBasePath).toBe("/sub");
});

/**
 * 服务端读的是同一套解析，不允许有人只改一处。
 *
 * 这条最容易出岔子：canonical、站点地图、RSS、301 各自算一遍基础路径，
 * 只要有一处漏了改，公开地址就会一半带前缀一半不带。
 */
test("服务端各处读的都是同一套解析结果", () => {
  const source = [
    "server/index.ts",
    "server/lib/publicBlogSEO.ts",
    "server/lib/blogSiteCheck.ts",
    "server/lib/publicBlog.ts",
    "server/routerTrpc/blog.ts",
  ];
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const root = join(import.meta.dir, "../..");
  for (const file of source) {
    const text = readFileSync(join(root, file), "utf8");
    expect(text).toContain("resolveBlogDeployment");
  }
});
