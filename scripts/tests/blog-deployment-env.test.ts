import { expect, test } from 'bun:test';
import {
  BLOG_DEPLOY_ENV,
  normalizeOrigin,
  parseEnvFlag,
  resolveBlogDeployment,
} from '../../shared/lib/blogDeployment';

/**
 * 部署参数的优先级：后台 > 环境变量 > 默认值。
 *
 * 后台「域名与部署」是唯一的配置入口 —— 在那里填了就生效，
 * 不需要改容器环境变量、不需要重启容器。
 * 环境变量退成兜底：后台留空（或填坏）时才由它接手。
 *
 * 这条优先级反过来过一次：曾经是「环境变量优先」，结果每次改公开地址
 * 都得去服务器改 compose、还得重建容器，而后台面板被锁成只读。
 */

const noEnv = {} as Record<string, string | undefined>;

test("后台填了就以后台为准，环境变量不再抢方向盘", () => {
  const d = resolveBlogDeployment(
    {
      targetOrigin: "https://blog.example.com",
      publicBasePath: "/",
      legacyBasePath: "/blog",
      legacyRedirectEnabled: true,
    },
    {
      [BLOG_DEPLOY_ENV.origin]: "https://env.example.com",
      [BLOG_DEPLOY_ENV.basePath]: "/env",
      [BLOG_DEPLOY_ENV.legacyBasePath]: "/env-legacy",
      [BLOG_DEPLOY_ENV.legacyRedirect]: "0",
    },
  );
  expect(d.targetOrigin).toBe("https://blog.example.com");
  expect(d.publicBasePath).toBe("/");
  expect(d.legacyBasePath).toBe("/blog");
  expect(d.legacyRedirectEnabled).toBe(true);
  // 环境变量一个都没在生效 —— 面板不该显示「被接管」。
  expect(d.envFallback).toEqual({
    publicBasePath: false,
    legacyBasePath: false,
    legacyRedirectEnabled: false,
    targetOrigin: false,
  });
});

test("后台留空才回落到环境变量", () => {
  const d = resolveBlogDeployment(
    { targetOrigin: "", publicBasePath: "", legacyBasePath: "" },
    {
      [BLOG_DEPLOY_ENV.origin]: "https://env.example.com",
      [BLOG_DEPLOY_ENV.basePath]: "/",
      [BLOG_DEPLOY_ENV.legacyBasePath]: "/blog",
      [BLOG_DEPLOY_ENV.legacyRedirect]: "1",
    },
  );
  expect(d.targetOrigin).toBe("https://env.example.com");
  expect(d.publicBasePath).toBe("/");
  expect(d.legacyBasePath).toBe("/blog");
  expect(d.legacyRedirectEnabled).toBe(true);
  expect(d.envFallback).toEqual({
    publicBasePath: true,
    legacyBasePath: true,
    legacyRedirectEnabled: true,
    targetOrigin: true,
  });
});

test("后台和环境变量都没填，用内置默认值", () => {
  const d = resolveBlogDeployment({}, noEnv);
  expect(d.publicBasePath).toBe("/blog");
  expect(d.targetOrigin).toBe("");
  expect(d.legacyBasePath).toBe("");
  expect(d.legacyRedirectEnabled).toBe(false);
  expect(d.envFallback.publicBasePath).toBe(false);
  expect(d.envFallback.targetOrigin).toBe(false);
});

test("写坏的值不当真 —— 后台填坏就当没填，回落到环境变量", () => {
  // 路径不合法 → 当作没设。
  const d = resolveBlogDeployment(
    { publicBasePath: "https://evil.example.com/blog" },
    { [BLOG_DEPLOY_ENV.basePath]: "/" },
  );
  expect(d.publicBasePath).toBe("/");
  expect(d.envFallback.publicBasePath).toBe(true);

  // 地址带路径 / 带凭据 / 不是 http → 都不认。
  expect(normalizeOrigin("https://blog.example.com/blog")).toBe(
    "https://blog.example.com",
  );
  expect(normalizeOrigin("https://user:pass@blog.example.com")).toBe("");
  expect(normalizeOrigin("javascript:alert(1)")).toBe("");
  expect(normalizeOrigin("not a url")).toBe("");
  expect(normalizeOrigin("https://blog.example.com/")).toBe(
    "https://blog.example.com",
  );

  const d2 = resolveBlogDeployment(
    { targetOrigin: "javascript:alert(1)" },
    { [BLOG_DEPLOY_ENV.origin]: "https://env.example.com" },
  );
  expect(d2.targetOrigin).toBe("https://env.example.com");
  expect(d2.envFallback.targetOrigin).toBe(true);
});

test("后台明确写 false 时压过环境变量的 true", () => {
  // 显式关闭是用户的决定，兜底变量不该把它打开。
  const d = resolveBlogDeployment(
    { legacyRedirectEnabled: false },
    { [BLOG_DEPLOY_ENV.legacyRedirect]: "1" },
  );
  expect(d.legacyRedirectEnabled).toBe(false);
  expect(d.envFallback.legacyRedirectEnabled).toBe(false);
});

test("后台没表态时布尔环境变量说了算", () => {
  const d = resolveBlogDeployment(
    {},
    { [BLOG_DEPLOY_ENV.legacyRedirect]: "1" },
  );
  expect(d.legacyRedirectEnabled).toBe(true);
  expect(d.envFallback.legacyRedirectEnabled).toBe(true);

  // 分不出真假 → 当作没设。
  const d2 = resolveBlogDeployment(
    {},
    { [BLOG_DEPLOY_ENV.legacyRedirect]: "maybe" },
  );
  expect(d2.legacyRedirectEnabled).toBe(false);
  expect(d2.envFallback.legacyRedirectEnabled).toBe(false);
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
