import { createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { emptySiteInfo, siteInfoSchema, type SiteInfo } from '../../shared/lib/siteInfo';
const key = 'siteInfo';
export const siteInfoRevision = (data: SiteInfo) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
export async function readSiteInfo(db: Prisma.TransactionClient = prisma) {
  const row = await db.config.findFirst({ where: { key, userId: null }, orderBy: { id: 'asc' } });
  const data = row ? siteInfoSchema.parse((row.config as any)?.value) : emptySiteInfo;
  return { data, revision: siteInfoRevision(data) };
}
export async function saveSiteInfo(data: SiteInfo, revision: string, role: string, client = prisma) {
  if (role !== 'superadmin') throw new TRPCError({ code: 'FORBIDDEN', message: '仅管理员可以维护站点信息与版本记录' });
  const clean = siteInfoSchema.parse(data);
  return client.$transaction(async db => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(1936286821, 1)`;
    const current = await readSiteInfo(db);
    if (current.revision !== revision) throw new TRPCError({ code: 'CONFLICT', message: '站点记录已在其他窗口更新，请先重新载入后再保存。当前输入仍然保留。' });
    const row = await db.config.findFirst({ where: { key, userId: null }, orderBy: { id: 'asc' } });
    const config = { type: 'object', value: clean };
    if (row) await db.config.update({ where: { id: row.id }, data: { config } });
    else await db.config.create({ data: { key, config } });
    return { data: clean, revision: siteInfoRevision(clean) };
  });
}
