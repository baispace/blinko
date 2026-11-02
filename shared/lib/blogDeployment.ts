/**
 * 公开站的部署参数。
 *
 * 三层来源，优先级固定：
 *   1. 环境变量 —— 这台机器把博客挂在哪、指向哪个域名，是部署层面的决定。
 *   2. 后台站点设置 —— 目标配置，存数据库。
 *   3. 内置默认值。
 *
 * 为什么环境变量优先：一次域名迁移要动的东西应该集中在一处
 * （容器的 environment 段），而不是拆成「服务器配置」和「后台点几下」两半。
 * 后台仍然能填 —— 环境变量没设的字段才由后台接管；设了的字段后台会显示
 * 「由环境变量接管」，不会出现「改了没反应」却看不出原因的情况。
 *
 * 环境变量与后台字段的对应：
 *
 * | 环境变量 | 后台字段 | 说明 |
 * | --- | --- | --- |
 * | `BLOG_PUBLIC_URL` | 目标公开站点地址 | 只作回落：后台填了值就用后台的 |
 * | `BLOG_PUBLIC_BASE_PATH` | 公开前端基础路径 | 环境变量优先 |
 * | `BLOG_LEGACY_BASE_PATH` | 旧公开路径前缀 | 环境变量优先 |
 * | `BLOG_LEGACY_REDIRECT` | 旧地址永久跳转 | 环境变量优先 |
 */

import { normalizeBasePath } from "./blogSeo";

/** 环境变量名。后台提示与文档都用这些名字，改名要一起改。 */
export const BLOG_DEPLOY_ENV = {
  /** 公开站点地址（已存在，兼作目标地址的回落） */
  origin: "BLOG_PUBLIC_URL",
  /** 公开前端基础路径 */
  basePath: "BLOG_PUBLIC_BASE_PATH",
  /** 旧公开路径前缀 */
  legacyBasePath: "BLOG_LEGACY_BASE_PATH",
  /** 是否开启旧地址永久跳转 */
  legacyRedirect: "BLOG_LEGACY_REDIRECT",
} as const;

export type BlogDeploymentEnv = Partial<Record<string, string | undefined>>;

/** 后台站点设置里与部署相关的四个字段。 */
export type BlogDeploymentSettings = {
  targetOrigin?: string | null;
  publicBasePath?: string | null;
  legacyBasePath?: string | null;
  legacyRedirectEnabled?: boolean | null;
};

export type BlogDeployment = {
  /** 公开前端基础路径，"/" 表示挂在域名根路径 */
  publicBasePath: string;
  /** 目标公开站点地址 */
  targetOrigin: string;
  /** 旧公开路径前缀 */
  legacyBasePath: string;
  /** 是否开启旧地址永久跳转 */
  legacyRedirectEnabled: boolean;
  /** 哪些字段由环境变量接管 —— 后台据此把对应输入框置为只读 */
  envOwned: {
    publicBasePath: boolean;
    legacyBasePath: boolean;
    legacyRedirectEnabled: boolean;
    targetOrigin: boolean;
  };
};

/**
 * 解析布尔环境变量。
 *
 * 只有明确的真值才算开；"0"、"false"、"off"、空串都算关。
 * 分不出真假（写错了）时返回 null —— 调用方据此回落到后台的值，
 * 不让一个拼错的变量悄悄改变线上行为。
 */
export function parseEnvFlag(
  value: string | undefined,
): boolean | null {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return null;
}

/**
 * 合并部署参数。
 *
 * `env` 默认读 `process.env`；测试里可以传别的对象。
 */
export function resolveBlogDeployment(
  settings: BlogDeploymentSettings | null | undefined,
  env: BlogDeploymentEnv = process.env,
): BlogDeployment {
  const envBasePath = normalizeBasePath(env[BLOG_DEPLOY_ENV.basePath]);
  const envLegacyBasePath = normalizeBasePath(env[BLOG_DEPLOY_ENV.legacyBasePath]);
  const envLegacyRedirect = parseEnvFlag(env[BLOG_DEPLOY_ENV.legacyRedirect]);
  const envOrigin = (env[BLOG_DEPLOY_ENV.origin] || "").trim();

  const storedBasePath = normalizeBasePath(settings?.publicBasePath);
  const storedLegacyBasePath = normalizeBasePath(settings?.legacyBasePath);
  const storedOrigin = (settings?.targetOrigin || "").trim();

  return {
    // 环境变量优先：设了就由部署说了算。
    publicBasePath:
      envBasePath || storedBasePath || "/blog",
    // 目标地址反过来 —— 后台填了目标就以后台为准（那是「我还想换到哪」的意思），
    // 没填才回落到当前生效地址。
    targetOrigin: storedOrigin || envOrigin,
    legacyBasePath: envLegacyBasePath || storedLegacyBasePath,
    legacyRedirectEnabled:
      envLegacyRedirect !== null
        ? envLegacyRedirect
        : !!settings?.legacyRedirectEnabled,
    envOwned: {
      publicBasePath: !!envBasePath,
      legacyBasePath: !!envLegacyBasePath,
      legacyRedirectEnabled: envLegacyRedirect !== null,
      targetOrigin: !storedOrigin && !!envOrigin,
    },
  };
}
