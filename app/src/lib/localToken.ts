/**
 * 登录凭据的本地读取。
 *
 * 单独成文件：带 @/store 依赖的模块（fileUrl）不能被公开正文渲染器引进来 ——
 * store 在公开页与测试环境里都可能不可用（循环依赖会让 RootStore.init 拿不到）。
 */

/** 读取当前登录 JWT（与编辑器的 localStorage key 一致）。 */
export const getLocalToken = (): string | null => {
  try {
    const raw = localStorage.getItem('blinkoToken');
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch {
    return null;
  }
};

/**
 * 给内部文件路径补 ?token=；外部绝对地址（CDN/图床）原样返回。
 *
 * 内部文件路径（/api/file/*、/api/s3file/*）在 <img>/<a> 里无法携带
 * Authorization 头，后端 getTokenFromRequest 支持 ?token= 查询参数兜底。
 */
export const toAuthenticatedFileUrl = (
  url?: string | null,
): string | undefined => {
  if (!url) return url ?? undefined;
  const isInternal =
    url.startsWith('/api/file/') || url.startsWith('/api/s3file/');
  if (!isInternal) return url;
  const token = getLocalToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};
