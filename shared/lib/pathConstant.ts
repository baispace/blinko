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
/**
 * Static assets already live under these top-level directories in the built
 * output (e.g. `assets/`, `fonts/`, `icons/`, `locales/`). They MUST NOT be
 * reused as the OSS key prefix — doing so would produce a doubled path like
 * `assets/assets/...` on both the upload key and the rewritten browser URL.
 */
const STATIC_CDN_RESERVED_DIRS = ['assets', 'fonts', 'icons', 'locales'];

function isReservedCdnPath(cdnPath?: string | null): boolean {
  const p = (cdnPath || '').replace(/^\/+|\/+$/g, '').toLowerCase();
  return STATIC_CDN_RESERVED_DIRS.includes(p);
}

export function buildStaticCdnBase(cdnBaseUrl?: string | null, cdnPath?: string | null): string {
  const domain = (cdnBaseUrl || '').replace(/\/+$/, '');
  if (!domain) return '';
  const pathPrefix = (cdnPath || '').replace(/^\/+|\/+$/g, '');
  // A reserved dir (assets/fonts/...) is already part of every asset's relative
  // path, so it must not be prepended again — that would double the segment.
  if (!pathPrefix || isReservedCdnPath(pathPrefix)) return domain;
  return `${domain}/${pathPrefix}`;
}

/** Build the OSS key prefix for a static-asset CDN push (trailing slash, or empty). */
export function buildStaticCdnKeyPrefix(cdnPath?: string | null): string {
  const pathPrefix = (cdnPath || '').replace(/^\/+|\/+$/g, '');
  // Same guard as buildStaticCdnBase: never prepend a reserved directory name,
  // otherwise uploaded keys would become `assets/assets/...`.
  if (!pathPrefix || isReservedCdnPath(pathPrefix)) return '';
  return pathPrefix + '/';
}
