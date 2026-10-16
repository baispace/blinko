import { expect, test } from 'bun:test';
import { siteInfoSchema, emptySiteInfo } from '../../shared/lib/siteInfo';
import { readSiteInfo, saveSiteInfo, siteInfoRevision } from '../../server/lib/siteInfo';
import { tabler } from '../../app/src/components/Common/Iconify/icons';
const release = { id: '32e701f0-8424-4a4a-9c1c-ce0d8df6d691', version: 'local-1', date: '2026-10-16', title: '设置调整', changes: '分组与搜索', conclusion: '常用项更容易找到，继续观察使用反馈。' };
test('version records validate calendar dates, unique ids and meaningful conclusions', () => {
  expect(siteInfoSchema.safeParse({ description: '', releases: [release] }).success).toBe(true);
  expect(siteInfoSchema.safeParse({ description: '', releases: [{ ...release, date: '2026-02-30' }] }).success).toBe(false);
  expect(siteInfoSchema.safeParse({ description: '', releases: [{ ...release, conclusion: '   ' }] }).success).toBe(false);
  expect(siteInfoSchema.safeParse({ description: '', releases: [release, release] }).success).toBe(false);
});
test('site records persist, reject non-admin writes and protect concurrent edits', async () => {
  let row: any = null;
  const db: any = { $executeRaw: async () => 0, config: { findFirst: async () => row, create: async ({data}:any) => row = { id: 1, ...data }, update: async ({data}:any) => row = { ...row, ...data } } };
  db.$transaction = async (fn:any) => fn(db);
  const initial = await readSiteInfo(db);
  expect(initial.data).toEqual(emptySiteInfo);
  const data = { description: '我的工作记录', releases: [release] };
  await expect(saveSiteInfo(data, initial.revision, 'user', db)).rejects.toThrow(); expect(row).toBeNull();
  const saved = await saveSiteInfo(data, initial.revision, 'superadmin', db);
  expect((await readSiteInfo(db)).data).toEqual(data);
  expect(saved.revision).toBe(siteInfoRevision(data));
  await expect(saveSiteInfo({ ...data, description: 'stale change' }, initial.revision, 'superadmin', db)).rejects.toThrow();
  expect((await readSiteInfo(db)).data.description).toBe('我的工作记录');
});
test('every settings navigation icon is available offline', async () => {
  const source = await Bun.file(new URL('../../app/src/components/BlinkoSettings/settingsRegistry.tsx', import.meta.url)).text();
  const icons = await import('../../app/src/components/Common/Iconify/icons');
  for (const [, prefix, name] of source.matchAll(/icon: '([\w-]+):([\w-]+)'/g)) expect((icons as any)[prefix.replaceAll('-','_')]?.icons?.[name]).toBeDefined();
  for (const name of ['search','loader-2','dots','history','notes']) expect(tabler.icons[name]).toBeDefined();
});
const integration = process.env.RUN_SITE_DB_TESTS === '1' ? test : test.skip;
integration('site record SQL persists inside a real transaction and rolls back fixtures', async () => {
  const { prisma } = await import('../../server/prisma');
  const rollback = new Error('ROLLBACK_SITE_TEST');
  try {
    await prisma.$transaction(async db => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(1936286821, 1)`;
      const row = await db.config.findFirst({ where: { key: 'siteInfo', userId: null } });
      if (!row) await db.config.create({ data: { id: -Math.floor(Date.now()/1000), key: 'siteInfo', config: { type: 'object', value: emptySiteInfo } } });
      const initial = await readSiteInfo(db);
      const client = { $transaction: (fn: any) => fn(db) } as any;
      const saved = await saveSiteInfo({ description: 'Temporary rollback test', releases: [release] }, initial.revision, 'superadmin', client);
      expect((await readSiteInfo(db)).revision).toBe(saved.revision);
      expect((await readSiteInfo(db)).data.releases[0].conclusion).toBe(release.conclusion);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
});

test("all AI workflow icons are available offline", async () => {
  const source = await Bun.file(new URL("../../shared/lib/aiWorkflows.ts", import.meta.url)).text();
  for (const [, name] of source.matchAll(/icon: 'tabler:([\w-]+)'/g)) expect(tabler.icons[name]).toBeDefined();
});
