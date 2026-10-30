import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { contentVersion, publicationChanges, publishSnapshot, publicationReviewToken } from './publication';
import { readDraftBody, buildPublishCheck, withDraftBody, withSourceBaseline, sourceVersionOf } from './blogPublishCheck';
import { readDraftCoverConfig, readPublicCoverConfig, emptyCoverConfig, writeDraftCoverConfig, normalizeCoverConfig } from './blogCoverConfig';
import { validShortCoverTitle } from '../../shared/lib/blogPublishSettings';
import { publicBodyOf } from '../../shared/lib/blogPublicBody';

export const savePublishSettingsSchema = z.object({
  noteId: z.number().int().positive(), token: z.string().length(64),
  expectedContentVersion: z.string().max(64).optional(),
  title: z.string().trim().max(200), summary: z.string().trim().max(2000),
  coverTitle: z.string().trim().max(24), coverSubtitle: z.string().trim().max(40),
  coverMode: z.enum(['full','overlay']),
  coverPalette: z.string().regex(/^(?:violet|blue|slate|teal|#[0-9a-f]{3}|#[0-9a-f]{6})$/i).optional(),
  coverAttachmentId: z.number().int().positive().nullable(), coverPath: z.string().max(1000).optional(),
  /** 作者在面板里明确移除了封面。没有它，笔记封面会被自动复用回来。 */
  coverDetached: z.boolean().optional(),
  displayMode: z.enum(['default', 'pinned', 'featured']), displayOrder: z.number().int().min(0).max(999),
  action: z.enum(['display', 'draft', 'publish']).default('draft'),
  sourceChoice: z.enum(['keep', 'adopt']).optional(),
  topics: z.array(z.object({ topicId: z.number().int().positive(), sectionId: z.number().int().positive().nullable() })).max(20).optional(),
});
const include = { publication: true, blogTopics: { select: { topicId: true, sectionId: true } }, attachments: { select: { id: true, path: true, name: true, type: true } } } as const;
type SettingsNote = Prisma.notesGetPayload<{ include: typeof include }>;
type CoverImage = SettingsNote['attachments'][number];
/** 草稿里「作者明确不要封面」的标记。 */
const DRAFT_COVER_DETACHED_KEY = 'blogCoverDetached';

function isCoverDetached(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return (metadata as Record<string, unknown>)[DRAFT_COVER_DETACHED_KEY] === true;
}

/**
 * 笔记自己那张封面（编辑器里设的那张）。
 *
 * 笔记封面存在 notes.metadata.cover（图片路径），博客封面存在
 * notePublication.draftCoverAttachmentId（附件 id）—— 本来是两套互不相通的体系，
 * 作者在笔记里设好的封面到博客后台就「消失」了。这里把它作为回落：博客自己还没
 * 配过封面时直接复用笔记那张。
 *
 * 只认查得到附件行的路径：博客封面靠附件行做免鉴权读取与公开快照，
 * 拿不到附件就没有可复用的东西。
 */
async function resolveNoteCover(
  db: Pick<PrismaClient, 'attachments'>,
  accountId: number,
  note: SettingsNote,
): Promise<CoverImage | null> {
  const path = (note.metadata as any)?.cover;
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  const attachment = await db.attachments.findFirst({
    where: { accountId, path, OR: [{ noteId: null }, { noteId: note.id }] },
    select: { id: true, path: true, name: true, type: true },
  });
  if (!attachment || !/^image\/(png|jpeg|webp|gif|avif)$/.test(attachment.type)) return null;
  return attachment;
}

function settingsToken(note: SettingsNote) {
  const p = note.publication;
  return createHash('sha256').update(JSON.stringify([note.updatedAt.toISOString(), note.content, note.type, note.metadata, note.isPublished, note.blogTopics, p?.revision ?? 0, p?.draftCoverAttachmentId ?? null, p?.coverConfig ?? null, p?.isFeatured ?? false, p?.featuredOrder ?? 0, p?.isBanner ?? false, p?.bannerOrder ?? 0])).digest('hex');
}
function dto(note: SettingsNote, noteCover: CoverImage | null = null) {
  const p = note.publication;
  // 博客自己配过封面就用自己的；没有就复用笔记那张。
  const blogCover = note.attachments.find(image => image.id === p?.draftCoverAttachmentId) ?? null;
  const cover = blogCover ?? noteCover ?? null;
  const config = readDraftCoverConfig(note.metadata) ?? readPublicCoverConfig(p?.coverConfig) ?? { ...emptyCoverConfig(), mode: cover ? 'full' as const : 'overlay' as const };
  const metadata = (note.metadata || {}) as Record<string, unknown>;
  return {
    token: settingsToken(note), reviewToken: publicationReviewToken(note), publicCoverConfig: readPublicCoverConfig(p?.coverConfig), revision: p?.revision ?? 0,
    /*
     * 「是否已发布」按**真的公开了**来算，而不是只看 notes.isPublished 这个标记。
     *
     * 两个地方必须给同一个答案：文章页页头的状态徽章、右侧面板的状态徽章。
     * 之前这里直接用 note.isPublished，页头却用「标记为已发布 且 有公开快照 且 不在回收站」，
     * 于是一篇标记已发布但公开快照缺失的文章，左边写「草稿」、右边写「待发布更新」——
     * 同一屏两个状态，作者无从判断到底发没发。
     */
    isPublished: note.isPublished && !!p && !note.isRecycle,
    publishId: note.publishId ?? null, hasChanges: publicationChanges(note).length > 0,
    contentVersion: contentVersion(readDraftBody(note.metadata, note.content).content, note.type),
    title: typeof metadata.title === 'string' ? metadata.title : p?.title || '',
    summary: typeof metadata.summary === 'string' ? metadata.summary : p?.summary || '',
    config, cover,
    /** 封面来源：blog=博客自己配的，note=复用笔记封面。面板据此说明这张图是哪来的。 */
    coverSource: blogCover ? 'blog' as const : noteCover ? 'note' as const : null,
    images: note.attachments.filter(image => /^image\/(png|jpeg|webp|gif|avif)$/.test(image.type)),
    topics: note.blogTopics,
    // 展示方式：默认就是精选（置顶 + banner）。
    // 从没发布过的文章还没有发布记录，这时按「默认精选」给面板 —— 作者不用先点一次。
    // 已经发过的文章按它自己的记录走：作者手动改回「默认展示」就别再动它。
    displayMode: p ? (p.isBanner ? 'featured' as const : p.isFeatured ? 'pinned' as const : 'default' as const) : 'featured' as const,
    displayOrder: (p?.isBanner ? p.bannerOrder : p?.featuredOrder) ?? 0,
  };
}
export async function readPublishSettings(db: PrismaClient, accountId: number, noteId: number) {
  const note = await db.notes.findFirst({ where: { id: noteId, accountId, isRecycle: false }, include });
  if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在或无权管理' });
  const [check, availableTopics, noteCover] = await Promise.all([
    buildPublishCheck(db, accountId, noteId),
    db.blogTopic.findMany({ where: { accountId }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, sections: { orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } } } }),
    // 作者明确移除过封面就不再复用笔记那张。
    isCoverDetached(note.metadata) ? Promise.resolve(null) : resolveNoteCover(db, accountId, note),
  ]);
  return { ...dto(note, noteCover), sourceBody: note.content, check, availableTopics };
}
export async function savePublishSettings(db: PrismaClient, accountId: number, input: z.infer<typeof savePublishSettingsSchema>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM notes WHERE id = ${input.noteId} AND "accountId" = ${accountId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "noteId" FROM "notePublication" WHERE "noteId" = ${input.noteId} FOR UPDATE`;
    const note = await tx.notes.findFirst({ where: { id: input.noteId, accountId, isRecycle: false }, include });
    if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: '文章不存在或无权管理' });
    if (settingsToken(note) !== input.token) throw new TRPCError({ code: 'CONFLICT', message: '文章或展示设置已在其他位置变化，请保留当前内容并重新打开核对后保存。' });
    if (input.expectedContentVersion && input.expectedContentVersion !== contentVersion(readDraftBody(note.metadata, note.content).content, note.type)) throw new TRPCError({ code: 'CONFLICT', message: 'AI 建议对应的正文已变化，请重新生成建议。' });
    const noteCover = isCoverDetached(note.metadata) ? null : await resolveNoteCover(tx, accountId, note);
    const current = dto(note, noteCover);
    const promotion = { isFeatured: input.displayMode !== 'default', isBanner: input.displayMode === 'featured', featuredOrder: input.displayOrder, bannerOrder: input.displayOrder };
    if (input.action === 'display') {
      await tx.notePublication.upsert({ where: { noteId: note.id }, create: { noteId: note.id, content: '', type: note.type, revision: 0, sourceUpdatedAt: note.updatedAt, ...promotion }, update: promotion });
      return { noteId: note.id, published: false };
    }
    // Only a genuine body conflict needs an extra decision. Safe source-only updates are adopted automatically on publish.
    if (input.action === 'publish') {
      const check = await buildPublishCheck(tx, accountId, note.id);
      const conflict = check.conflicts.some(c => c.field === 'body');
      if (conflict && !input.sourceChoice) throw new TRPCError({ code: 'CONFLICT', message: '原笔记与发布草稿都有修改，请选择要发布的正文。' });
      const draft = readDraftBody(note.metadata, note.content);
      // 公开快照里存的是「公开正文形态」，比对要用同一形态。
      const adopt = input.sourceChoice === 'adopt' || (!conflict && check.source.changed && publicBodyOf(draft.content) === note.publication?.content);
      const version = sourceVersionOf(note.content, note.type);
      let metadata = note.metadata;
      if (adopt) metadata = withDraftBody(metadata, { content: note.content, sourceVersion: version }) as typeof metadata;
      note.metadata = withSourceBaseline(metadata, version) as typeof metadata;
    }
    if (input.coverTitle !== current.config.title && input.coverTitle && !validShortCoverTitle(input.coverTitle)) throw new TRPCError({ code: 'BAD_REQUEST', message: '封面短标题请填写 4–6 字。' });
    let imageId = input.coverAttachmentId;
    if (input.coverPath || imageId) {
      const image = await tx.attachments.findFirst({ where: { accountId, ...(input.coverPath ? { path: input.coverPath } : { id: imageId! }), OR: [{ noteId: null }, { noteId: note.id }] } });
      if (!image || !/^image\/(png|jpeg|webp|gif|avif)$/.test(image.type) || Number(image.size) > 10 * 1024 * 1024) throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择本人上传且未关联其他笔记的图片，最大 10MB。' });
      await tx.attachments.update({ where: { id: image.id }, data: { noteId: note.id } }); imageId = image.id;
    }
    if (imageId && input.coverMode === 'overlay' && !input.coverTitle) throw new TRPCError({ code: 'BAD_REQUEST', message: '底图模式需要填写封面短标题。' });
    const config = normalizeCoverConfig({ ...current.config, title: input.coverTitle, subtitle: input.coverSubtitle, mode: input.coverMode, palette: input.coverPalette ?? current.config.palette, focus: imageId !== note.publication?.draftCoverAttachmentId ? null : current.config.focus });
    const metadata = { ...writeDraftCoverConfig(note.metadata, config), title: input.title, summary: input.summary,
      // Empty overrides make search/share metadata inherit the public article.
      blogSeo: { title: '', description: '', image: '', imageAlt: '' },
      // 作者明确移除过封面就记下来，下次别把笔记封面又自动复用回来。
      [DRAFT_COVER_DETACHED_KEY]: input.coverDetached === true,
    } as Prisma.InputJsonValue;
    await tx.notes.update({ where: { id: note.id }, data: { metadata } });
    const display = { ...promotion, draftCoverAttachmentId: imageId };
    await tx.notePublication.upsert({ where: { noteId: note.id }, create: { noteId: note.id, content: '', type: note.type, revision: 0, sourceUpdatedAt: note.updatedAt, ...display }, update: display });
    if (input.topics) {
      const ids = input.topics.map(topic => topic.topicId);
      if (new Set(ids).size !== ids.length) throw new TRPCError({ code: 'BAD_REQUEST', message: '专题不能重复选择。' });
      for (const member of input.topics) {
        const topic = await tx.blogTopic.findFirst({ where: { id: member.topicId, accountId } });
        const section = member.sectionId ? await tx.blogTopicSection.findFirst({ where: { id: member.sectionId, topicId: member.topicId } }) : true;
        if (!topic || !section) throw new TRPCError({ code: 'BAD_REQUEST', message: '专题或章节已失效，请重新选择。' });
        await tx.blogTopicNote.upsert({ where: { topicId_noteId: { topicId: member.topicId, noteId: note.id } }, create: { ...member, noteId: note.id }, update: { sectionId: member.sectionId } });
      }
      await tx.blogTopicNote.deleteMany({ where: { noteId: note.id, topicId: { notIn: ids } } });
    }
    if (input.action === 'publish') await publishSnapshot(tx, accountId, { id: note.id });
    return { noteId: note.id, published: input.action === 'publish' };
  });
}
