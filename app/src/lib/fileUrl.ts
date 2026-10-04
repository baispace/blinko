import { RootStore } from '@/store';
import { BlinkoStore } from '@/store/blinkoStore';

/**
 * 内部文件路径（/api/file/*、/api/s3file/*）在 <img>/<a> 里无法携带
 * Authorization 头，后端 getTokenFromRequest 支持 ?token= 查询参数兜底。
 * 这里集中处理，避免各处重复拼 token（封面、正文内联图片都走它）。
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
 */
export const toAuthenticatedFileUrl = (url?: string | null): string | undefined => {
  if (!url) return url ?? undefined;
  const isInternal = url.startsWith('/api/file/') || url.startsWith('/api/s3file/');
  if (!isInternal) return url;
  const token = getLocalToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};

/**
 * 把存进笔记内容的文件路径转成「最终写入正文的链接」。
 * 配置了 CDN 加速域名（s3CdnDomain）时，/api/s3file/* 会重写成绝对 CDN
 * 地址（免鉴权）；否则保持内部路径。
 */
export const toContentFileUrl = (filePath: string): string => {
  try {
    const cdn = RootStore.Get(BlinkoStore).config.value?.s3CdnDomain
    if (cdn && filePath.startsWith('/api/s3file/')) {
      const base = /^https?:\/\//i.test(cdn) ? cdn.replace(/\/+$/, '') : `https://${cdn}`
      return `${base}/${filePath.replace(/^\/api\/s3file\//, '').replace(/^\/+/, '')}`
    }
  } catch { /* config not ready, fall back to the internal path */ }
  return filePath
}

/**
 * 渲染期用的最终 URL：先做 CDN 重写，再给仍然指向内部的路径补 token。
 * 渲染端（MarkdownRender / 编辑器 img）都用它，保证「内容里存原始路径、
 * 展示时再解析」，换环境或换登录都不会裂图。
 */
export const toRenderableContentUrl = (filePath?: string | null): string | undefined => {
  if (!filePath) return filePath ?? undefined
  return toAuthenticatedFileUrl(toContentFileUrl(filePath))
}
