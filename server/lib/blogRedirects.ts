import { joinBasePath, normalizeBasePath } from "../../shared/lib/blogSeo";

/**
 * 旧公开地址 → 新公开地址的永久跳转映射。
 *
 * 只做「同一篇内容换地址」的映射：旧首页对应新首页、旧文章对应同一篇文章的新地址、
 * 旧专题对应同一专题的新地址。分页与查询参数原样带走。
 *
 * 安全约束：
 * - 目标主机来自服务端配置，不是请求参数，不存在开放重定向。
 * - 映射后的地址与当前地址相同就放弃跳转，避免循环。
 * - 只处理公开路径前缀，工作区路径不迁移。
 */

export type LegacyRedirectConfig = {
  /** 是否启用 */
  enabled: boolean;
  /** 旧公开路径前缀，例如 /blog */
  legacyBasePath: string;
  /** 新公开基础路径，例如 / */
  publicBasePath: string;
  /** 目标站点地址 */
  targetOrigin: string;
  /** 当前请求的主机名；与目标同域时不跳转，避免死循环。 */
  currentHost?: string;
};

export function legacyRedirectTarget(
  pathname: string,
  search: string,
  config: LegacyRedirectConfig,
): string | null {
  if (!config.enabled) return null;
  const legacy = normalizeBasePath(config.legacyBasePath);
  if (!legacy || legacy === "/") return null;
  const target = normalizeBasePath(config.publicBasePath) || "/";
  let targetOrigin = "";
  let targetHost = "";
  try {
    const url = new URL(config.targetOrigin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return null;
    targetOrigin = url.origin;
    targetHost = url.host;
  } catch {
    return null;
  }
  if (!targetOrigin) return null;
  // 目标与当前同域：网关会把新路径再映射回内部路径，服务端再跳一次就成了死循环。
  // 这种「同域换路径」交给网关 / 反代处理，服务端不插手。
  if (config.currentHost && config.currentHost === targetHost) return null;

  const path = pathname || "/";
  if (path !== legacy && !path.startsWith(legacy + "/")) return null;
  const rest = path.slice(legacy.length) || "/";
  const nextPath = joinBasePath(target, rest === "/" ? "/" : rest);
  const query = search && search !== "?" ? search : "";
  const next = targetOrigin + nextPath + query;

  // 与当前地址完全一致时不跳，避免自己跳自己。
  let current = "";
  try {
    current = new URL(path + query, targetOrigin).href;
  } catch {
    current = "";
  }
  if (current && current === next) return null;
  return next;
}

/** 旧地址 → 新地址的映射示例，用于管理端预览。 */
export function legacyRedirectPreview(
  legacyBasePath: string,
  publicBasePath: string,
  targetOrigin: string,
  samples: { label: string; path: string }[],
) {
  const legacy = normalizeBasePath(legacyBasePath);
  const target = normalizeBasePath(publicBasePath) || "/";
  let origin = "";
  try {
    const url = new URL(targetOrigin);
    origin = url.origin;
  } catch {
    origin = "";
  }
  return samples.map((sample) => {
    const rest = legacy && sample.path.startsWith(legacy)
      ? sample.path.slice(legacy.length) || "/"
      : sample.path;
    return {
      label: sample.label,
      from: origin ? origin + sample.path : sample.path,
      to: origin ? origin + joinBasePath(target, rest) : joinBasePath(target, rest),
    };
  });
}
