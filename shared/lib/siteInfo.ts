import { z } from 'zod';
export const siteReleaseSchema = z.object({
  id: z.string().uuid(),
  version: z.string().trim().max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(value + 'T12:00:00Z'); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value; }, '日期无效'),
  title: z.string().trim().min(1).max(100),
  changes: z.string().trim().max(4000),
  conclusion: z.string().trim().min(1).max(2000),
});
export const siteInfoSchema = z.object({
  description: z.string().trim().max(500),
  releases: z.array(siteReleaseSchema).max(100).refine(rows => new Set(rows.map(row => row.id)).size === rows.length, '记录编号重复'),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;
export type SiteRelease = z.infer<typeof siteReleaseSchema>;
export const emptySiteInfo: SiteInfo = { description: '', releases: [] };
