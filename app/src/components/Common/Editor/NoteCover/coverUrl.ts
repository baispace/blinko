import { toCoverUrl } from './defaultCovers';

/** Reads the current JWT from localStorage. */
const getLocalToken = (): string | null => {
  try {
    const raw = localStorage.getItem('blinkoToken');
    if (!raw) return null;
    return JSON.parse(raw)?.token || null;
  } catch {
    return null;
  }
};

/**
 * Resolves a cover value to a renderable URL.
 *
 * Local-storage files (`/api/file/...`) require authentication, but `<img>`
 * tags cannot send the `Authorization` header. The backend already accepts a
 * `?token=` query parameter via `getTokenFromRequest`, so we append it here.
 */
export const toAuthenticatedCoverUrl = (cover?: string | null): string | undefined => {
  const url = toCoverUrl(cover);
  if (!url || !url.startsWith('/api/file/')) return url;
  const token = getLocalToken();
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
};
