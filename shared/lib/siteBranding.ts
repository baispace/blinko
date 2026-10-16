import { z } from 'zod';
/** Inline raster icons work on the sign-in page without exposing attachment credentials. */
export const siteIconSchema = z.string().max(200000).refine(value => value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value), '请选择 PNG、JPG 或 WebP 图标');
