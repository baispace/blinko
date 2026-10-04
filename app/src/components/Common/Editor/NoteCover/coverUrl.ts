import { toCoverUrl } from './defaultCovers';
import { toAuthenticatedFileUrl } from '@/lib/fileUrl';

/**
 * Resolves a cover value to a renderable URL.
 *
 * Local-storage files (`/api/file/...`) require authentication, but `<img>`
 * tags cannot send the `Authorization` header. The backend already accepts a
 * `?token=` query parameter via `getTokenFromRequest`, so we append it here
 * (shared helper: @/lib/fileUrl).
 */
export const toAuthenticatedCoverUrl = (cover?: string | null): string | undefined => {
  return toAuthenticatedFileUrl(toCoverUrl(cover));
};
