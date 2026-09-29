import path from 'path';

const BASE_DIR = process.cwd();

export const UPLOAD_FILE_PATH = path.join(BASE_DIR, '.blinko/files')
export const DBBAKUP_PATH = path.join(BASE_DIR, '.blinko/pgdump')
export const ROOT_PATH = path.join(BASE_DIR, '.blinko')
export const EXPORT_BAKUP_PATH = path.join(BASE_DIR, 'backup')
export const TEMP_PATH = path.join(BASE_DIR, '.blinko/files/temp')
export const VECTOR_PATH = path.join(BASE_DIR, '.blinko/vector')

/**
 * Build the browser-facing CDN base URL for static assets.
 * `cdnBaseUrl` is the CDN domain (e.g. https://cdn.example.com),
 * `cdnPath` is the OSS key prefix (e.g. blinko). The two are combined so the
 * browser references and the uploaded OSS keys stay in lock-step.
 */
export function buildStaticCdnBase(cdnBaseUrl?: string | null, cdnPath?: string | null): string {
  const domain = (cdnBaseUrl || '').replace(/\/+$/, '');
  if (!domain) return '';
  const pathPrefix = (cdnPath || '').replace(/^\/+|\/+$/g, '');
  return pathPrefix ? `${domain}/${pathPrefix}` : domain;
}

/** Build the OSS key prefix for a static-asset CDN push (trailing slash, or empty). */
export function buildStaticCdnKeyPrefix(cdnPath?: string | null): string {
  const pathPrefix = (cdnPath || '').replace(/^\/+|\/+$/g, '');
  return pathPrefix ? pathPrefix + '/' : '';
}
