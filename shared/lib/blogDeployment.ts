/**
 * 公开站的部署参数。
 *
 * 三层来源，优先级固定：
 *   1. 后台站点设置 —— 你在「域名与部署」里填的，填了就生效。
 *   2. 环境变量 —— 只在后台没填（或填坏）时兜底。
 *   3. 内置默认值。
 *
 * 为什么后台优先：域名迁移要动的东西集中在一处（后台那一个面板），
 * 而不是拆成「服务器改 compose」和「后台点几下」两半。改完存盘，
 * 30 秒内生效，不需要重启容器、不需要改环境变量。
 *
 * 环境变量保留为兜底，是为了兼容「用 compose 驱动部署」的用法：
 * 没在后台配置过的字段，仍然可以由容器 environment 段决定。
 *
 * 环境变量与后台字段的对应：
 *
 * | 环境变量 | 后台字段 | 说明 |
 * | --- | --- | --- |
 * | `BLOG_PUBLIC_URL` | 公开站点地址 | 兜底：后台留空时用它 |
 * | `BLOG_PUBLIC_BASE_PATH` | 公开前端基础路径 | 兜底 |
 * | `BLOG_LEGACY_BASE_PATH` | 旧公开路径前缀 | 兜底 |
 * | `BLOG_LEGACY_REDIRECT` | 旧地址永久跳转 | 兜底 |
 */

import { normalizeBasePath } from "./blogSeo";

/** 环境变量名。后台提示与文档都用这些名字，改名要一起改。 */
export const BLOG_DEPLOY_ENV = {
  /** 公开站点地址（兜底） */
  origin: "BLOG_PUBLIC_URL",
  /** 公开前端基础路径（兜底） */
  basePath: "BLOG_PUBLIC_BASE_PATH",
  /** 旧公开路径前缀（兜底） */
  legacyBasePath: "BLOG_LEGACY_BASE_PATH",
  /** 是否开启旧地址永久跳转（兜底） */
  legacyRedirect: "BLOG_LEGACY_REDIRECT",
} as const;

export type BlogDeploymentEnv = Partial<Record<string, string | undefined>>;

/** 后台站点设置里与部署相关的四个字段。 */
export type BlogDeploymentSettings = {
  targetOrigin?: string | null;
  domainRouting?: boolean;
  publicBasePath?: string | null;
  legacyBasePath?: string | null;
  legacyRedirectEnabled?: boolean | null;
};

export type BlogDeployment = {
  /** 公开前端基础路径，"/" 表示挂在域名根路径 */
  publicBasePath: string;
  /**
   * 公开站点地址（origin）。
   *
   * 这是**生效值**：canonical、站点地图、RSS、分享地址、旧地址 301 的目标
   * 都以它为准。留空时跟随请求地址（单域名部署的默认行为）。
   */
  targetOrigin: string;
  /** 旧公开路径前缀 */
  legacyBasePath: string;
  /** 是否开启旧地址永久跳转 */
  legacyRedirectEnabled: boolean;
  /** 哪些字段当前由环境变量兜底 —— 后台据此提示「留空时用哪个变量」 */
  envFallback: {
    publicBasePath: boolean;
    legacyBasePath: boolean;
    legacyRedirectEnabled: boolean;
    targetOrigin: boolean;
  };
};

/**
 * 归一化公开站点地址。
 *
 * 只接受 http(s)、不带用户名密码、不带路径与子路径。
 * 写坏的值返回空串 —— 当作「没填」，回落到环境变量或请求地址，
 * 不让一个手滑的输入把整站打成 503。
 */
export function normalizeOrigin(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }
  if (!/^https?:$/.test(url.protocol)) return "";
  if (url.username || url.password) return "";
  if (!url.hostname) return "";
  return url.origin;
}

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
 *
 * 规则：
 * - 后台填了就以后台为准（环境变量只是兜底）；
 * - 后台留空或填坏，才回落到环境变量；
 * - 都没有，用内置默认值。
 */
export function resolveBlogDeployment(
  settings: BlogDeploymentSettings | null | undefined,
  env: BlogDeploymentEnv = process.env,
): BlogDeployment {
  const envBasePath = normalizeBasePath(env[BLOG_DEPLOY_ENV.basePath]);
  const envLegacyBasePath = normalizeBasePath(env[BLOG_DEPLOY_ENV.legacyBasePath]);
  const envLegacyRedirect = parseEnvFlag(env[BLOG_DEPLOY_ENV.legacyRedirect]);
  const envOrigin = normalizeOrigin(env[BLOG_DEPLOY_ENV.origin]);

  const storedBasePath = normalizeBasePath(settings?.publicBasePath);
  const storedLegacyBasePath = normalizeBasePath(settings?.legacyBasePath);
  const storedOrigin = normalizeOrigin(settings?.targetOrigin);
  // 后台明确写了 true / false 就算数；没写（undefined / null）才让环境变量说话。
  const storedLegacyEnabled =
    typeof settings?.legacyRedirectEnabled === "boolean"
      ? settings.legacyRedirectEnabled
      : null;

  return {
    publicBasePath: settings?.domainRouting && (storedOrigin || envOrigin) ? "/" : storedBasePath || envBasePath || "/blog",
    targetOrigin: storedOrigin || envOrigin,
    legacyBasePath: storedLegacyBasePath || envLegacyBasePath,
    legacyRedirectEnabled:
      storedLegacyEnabled !== null
        ? storedLegacyEnabled
        : envLegacyRedirect !== null
          ? envLegacyRedirect
          : false,
    envFallback: {
      publicBasePath: !storedBasePath && !!envBasePath,
      legacyBasePath: !storedLegacyBasePath && !!envLegacyBasePath,
      legacyRedirectEnabled: storedLegacyEnabled === null && envLegacyRedirect !== null,
      targetOrigin: !storedOrigin && !!envOrigin,
    },
  };
}
