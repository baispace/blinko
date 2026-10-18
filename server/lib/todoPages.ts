import { todoQuerySchema } from '@shared/lib/todoViews';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { prisma } from '../prisma';
import { summarySelect, summarizeNotes } from './noteSummaries';
export const todoPageInput = z.object({
  view: todoQuerySchema.optional(),
  bucket: z.enum(['today','upcoming','done']).default('today'), size: z.number().int().min(1).max(100).default(30),
  cursor: z.string().max(1000).optional(), withCounts: z.boolean().default(true), timezone: z.string().max(100).default('Asia/Shanghai'),
  searchText: z.string().max(1000).default(''), tagId: z.number().int().positive().nullable().default(null),
  withoutTag: z.boolean().default(false), withFile: z.boolean().default(false), withLink: z.boolean().default(false), hasTodo: z.boolean().default(false),
  isShare: z.boolean().nullable().default(null), startDate: z.coerce.date().nullable().optional(), endDate: z.coerce.date().nullable().optional(),
});
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
export const priorityRankSql = Prisma.sql`CASE
  WHEN n.metadata->>'priorityUrgent' IS NOT NULL OR n.metadata->>'priorityImportant' IS NOT NULL THEN
    CASE WHEN n.metadata->>'priorityImportant' IN ('true','1') THEN CASE WHEN n.metadata->>'priorityUrgent' IN ('true','1') THEN 0 ELSE 1 END
         WHEN n.metadata->>'priorityUrgent' IN ('true','1') THEN 2 ELSE 3 END
  WHEN n.metadata->>'priority' IN ('1','high') THEN 0 WHEN n.metadata->>'priority' IN ('2','medium') THEN 1 ELSE 3 END`;
export function decodeTodoCursor(cursor: string | undefined, bucket: string): number[] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (parsed.bucket !== bucket || !Array.isArray(parsed.keys) || parsed.keys.length !== 5 || parsed.keys.some((key: any) => typeof key !== 'number' || !Number.isFinite(key))) throw new Error();
    return parsed.keys;
  } catch { throw new TRPCError({ code: 'BAD_REQUEST', message: '分页位置无效，请刷新列表' }); }
}
export async function getTodoPage(input: z.infer<typeof todoPageInput>, accountId: number, db: Prisma.TransactionClient = prisma) {
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new TRPCError({ code: 'BAD_REQUEST', message: '时区无效' }); }
  const filters: Prisma.Sql[] = [Prisma.sql`n.type = 2 AND NOT n."isRecycle"`, Prisma.sql`(n."accountId" = ${accountId} OR n.id IN (SELECT "noteId" FROM "noteInternalShare" WHERE "accountId" = ${accountId}))`];
  if (input.searchText.trim()) {
    const pattern = `%${escapeLike(input.searchText.trim())}%`;
    filters.push(Prisma.sql`(n.content ILIKE ${pattern} OR (n.metadata #>> '{title}') ILIKE ${pattern}
      OR EXISTS (SELECT 1 FROM attachments a WHERE a."noteId" = n.id AND a.path ILIKE ${pattern})
      OR EXISTS (SELECT 1 FROM "tagsToNote" nt JOIN tag t ON t.id = nt."tagId" WHERE nt."noteId" = n.id AND t.name ILIKE ${pattern}))`);
  }
  if (input.view?.tagIds.length) {
    const ids = [...new Set(input.view.tagIds)];
    filters.push(input.view.tagMatch === 'all'
      ? Prisma.sql`(SELECT count(DISTINCT nt."tagId") FROM "tagsToNote" nt WHERE nt."noteId" = n.id AND nt."tagId" IN (${Prisma.join(ids)})) = ${ids.length}`
      : Prisma.sql`EXISTS (SELECT 1 FROM "tagsToNote" nt WHERE nt."noteId" = n.id AND nt."tagId" IN (${Prisma.join(ids)}))`);
  }
  if (input.view?.attachment === 'yes') filters.push(Prisma.sql`EXISTS (SELECT 1 FROM attachments a WHERE a."noteId" = n.id)`);
  if (input.view?.attachment === 'no') filters.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM attachments a WHERE a."noteId" = n.id)`);
  if (input.view?.tagId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "tagsToNote" nt WHERE nt."noteId" = n.id AND nt."tagId" = ${input.view.tagId})`);
  if (input.tagId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM "tagsToNote" nt WHERE nt."noteId" = n.id AND nt."tagId" = ${input.tagId})`);
  if (input.withoutTag) filters.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "tagsToNote" nt WHERE nt."noteId" = n.id)`);
  if (input.withFile) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM attachments a WHERE a."noteId" = n.id)`);
  if (input.withLink) filters.push(Prisma.sql`(n.content ILIKE '%http://%' OR n.content ILIKE '%https://%')`);
  if (input.hasTodo) filters.push(Prisma.sql`n.content ~ '[-*] \\[[ xX]\\]'`);
  if (input.isShare !== null) filters.push(Prisma.sql`n."isShare" = ${input.isShare}`);
  if (input.startDate && input.endDate) filters.push(Prisma.sql`n."createdAt" BETWEEN ${input.startDate} AND ${input.endDate}`);
  const base = Prisma.sql`WITH bounds AS (
      SELECT (date_trunc('day', now() AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}) AS start,
      ((date_trunc('day', now() AT TIME ZONE ${input.timezone}) + interval '1 day') AT TIME ZONE ${input.timezone}) AS finish
    ), normalized AS (
      SELECT n.id,n."isArchived",n."createdAt",n."updatedAt",blinko_iso_timestamp(n.metadata->>'startAt') AS started,
        CASE WHEN n."isArchived" THEN 'done' WHEN COALESCE(n.metadata->>'taskStatus','done') != 'done' THEN n.metadata->>'taskStatus' WHEN COALESCE(n.metadata->>'snoozeCount','0') ~ '^[1-9][0-9]*$' THEN 'delayed' ELSE 'todo' END AS state,blinko_iso_timestamp(n.metadata->>'expireAt') AS due,
        COALESCE(blinko_iso_timestamp(n.metadata->>'completedAt'),n."updatedAt") AS completed, ${priorityRankSql} AS rank
      FROM notes n WHERE ${Prisma.join(filters, ' AND ')}
    ), classified AS (
      SELECT normalized.*,CASE WHEN "isArchived" AND NOT (completed >= bounds.start AND completed < bounds.finish) THEN 'done'
        WHEN due >= bounds.finish THEN 'upcoming' ELSE 'today' END AS bucket FROM normalized CROSS JOIN bounds
    )`;
  const view = input.view;
  const period = (unit:'day'|'week'|'month', offset:number) => {
    const start=Prisma.sql`((date_trunc(${unit}, now() AT TIME ZONE ${input.timezone}) + (${offset}::int * ${'1 '+unit}::interval)) AT TIME ZONE ${input.timezone})`;
    const finish=Prisma.sql`((date_trunc(${unit}, now() AT TIME ZONE ${input.timezone}) + (${offset+1}::int * ${'1 '+unit}::interval)) AT TIME ZONE ${input.timezone})`;
    return Prisma.sql`due >= ${start} AND due < ${finish}`;
  };
  const relative:Record<string,Prisma.Sql>={today:period('day',0),tomorrow:period('day',1),yesterday:period('day',-1),week:period('week',0),lastWeek:period('week',-1),nextWeek:period('week',1),month:period('month',0),lastMonth:period('month',-1),nextMonth:period('month',1)};
  const viewWhere = view ? Prisma.join([
    view.statusIds.length ? Prisma.sql`state IN (${Prisma.join(view.statusIds)})` : Prisma.sql`TRUE`,
    view.priorities.length ? Prisma.sql`rank IN (${Prisma.join(view.priorities.map(p=>({ui:0,in:1,un:2,nn:3})[p]))})` : Prisma.sql`TRUE`,
    relative[view.dueMode] || (view.dueMode === 'overdue' ? Prisma.sql`NOT "isArchived" AND due < (SELECT start FROM bounds)`
    : view.dueMode === 'none' ? Prisma.sql`due IS NULL`
    : view.dueMode === 'range' ? Prisma.join([
      view.dueFrom ? Prisma.sql`due >= (${view.dueFrom}::date::timestamp AT TIME ZONE ${input.timezone})` : Prisma.sql`TRUE`,
      view.dueTo ? Prisma.sql`due < ((${view.dueTo}::date + interval '1 day') AT TIME ZONE ${input.timezone})` : Prisma.sql`TRUE`
    ], ' AND ') : Prisma.sql`TRUE`),
    view.status === 'pending'  ? Prisma.sql`NOT "isArchived"` : view.status === 'done' ? Prisma.sql`"isArchived"` : Prisma.sql`TRUE`,
    view.scope === 'today' ? Prisma.sql`(due < (SELECT finish FROM bounds) OR due IS NULL)`
    : view.scope === 'week' ? Prisma.sql`due >= (date_trunc('week', now() AT TIME ZONE ${input.timezone}) AT TIME ZONE ${input.timezone}) AND due < ((date_trunc('week', now() AT TIME ZONE ${input.timezone}) + interval '7 days') AT TIME ZONE ${input.timezone})`
    : view.scope === 'important' ? Prisma.sql`rank <= 1`
    : view.scope === 'done' ? Prisma.sql`"isArchived"` : Prisma.sql`TRUE`
  ], ' AND ') : Prisma.sql`bucket = ${input.bucket}`;
  const cursorScope = view ? createHash('sha256').update(JSON.stringify([view,input.searchText,input.tagId,input.withoutTag,input.withFile,input.withLink,input.hasTodo,input.isShare,input.startDate,input.endDate,input.timezone])).digest('hex') : input.bucket;
  const sortField = view?.sort==='start'?Prisma.sql`started`:view?.sort==='created'?Prisma.sql`"createdAt"`:view?.sort==='updated'?Prisma.sql`"updatedAt"`:view?.sort==='completed'?Prisma.sql`CASE WHEN "isArchived" THEN completed END`:Prisma.sql`due`;
  const factor=view?.direction==='desc'?-1:1;
  const keys = view ? Prisma.sql`${view.sort==='priority'?Prisma.sql`0::double precision`:Prisma.sql`(${sortField} IS NULL)::int::double precision`} AS s1,${view.sort==='priority'?Prisma.sql`rank::double precision * ${factor}`:Prisma.sql`COALESCE(extract(epoch FROM ${sortField})::double precision * ${factor},253402300799)`} AS s2,${view.sort==='priority'?Prisma.sql`COALESCE(extract(epoch FROM due)::double precision,253402300799)`:Prisma.sql`rank::double precision`} AS s3,-extract(epoch FROM "updatedAt")::double precision AS s4,-id::double precision AS s5`
    : input.bucket === 'today'
    ? Prisma.sql`"isArchived"::int::double precision AS s1,rank::double precision AS s2,COALESCE(extract(epoch FROM due)::double precision,253402300799) AS s3,-extract(epoch FROM "updatedAt")::double precision AS s4,-id::double precision AS s5`
    : input.bucket === 'upcoming'
    ? Prisma.sql`COALESCE(extract(epoch FROM due)::double precision,253402300799) AS s1,"isArchived"::int::double precision AS s2,rank::double precision AS s3,-extract(epoch FROM "updatedAt")::double precision AS s4,-id::double precision AS s5`
    : Prisma.sql`-extract(epoch FROM completed)::double precision AS s1,0::double precision AS s2,0::double precision AS s3,0::double precision AS s4,-id::double precision AS s5`;
  const cursor = decodeTodoCursor(input.cursor, cursorScope);
  const after = cursor ? Prisma.sql`WHERE (s1,s2,s3,s4,s5) > (${Prisma.join(cursor)})` : Prisma.empty;
  const [counts, rows] = await Promise.all([
    input.withCounts ? db.$queryRaw<{ bucket: string; count: number }[]>(Prisma.sql`${base} SELECT bucket,count(*)::int AS count FROM classified GROUP BY bucket`) : Promise.resolve(null),
    db.$queryRaw<{ id: number; s1: number; s2: number; s3: number; s4: number; s5: number }[]>(Prisma.sql`${base}, ordered AS (SELECT id,${keys} FROM classified WHERE ${viewWhere}) SELECT * FROM ordered ${after} ORDER BY s1,s2,s3,s4,s5 LIMIT ${input.size + 1}`),
  ]);
  const page = rows.slice(0,input.size); const last = page.at(-1);
  const records = page.length ? await db.notes.findMany({ where: { id: { in: page.map(row => row.id) } }, select: summarySelect }) : [];
  const summaries = await summarizeNotes(records, db); const map = new Map(summaries.map(note => [note.id,note]));
  return { items: page.map(row => map.get(row.id)!).filter(Boolean), counts: counts ? { today: counts.find(row => row.bucket === 'today')?.count || 0, upcoming: counts.find(row => row.bucket === 'upcoming')?.count || 0, done: counts.find(row => row.bucket === 'done')?.count || 0 } : null,
    nextCursor: rows.length > input.size && last ? Buffer.from(JSON.stringify({ bucket: cursorScope, keys: [last.s1,last.s2,last.s3,last.s4,last.s5] })).toString('base64url') : null };
}
