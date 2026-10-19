import { Prisma, PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { randomBytes } from 'node:crypto';

/**
 * 博客管理的数据层。与 note.ts 的列表逻辑分开，便于直接写测试。
 *
 * 贯穿的原则和 publication.ts 一致：公开面只暴露作者显式选择公开的内容，
 * 私有标签树、附件列表、账号身份都不参与 join。
 */

export type BlogLink = { label: string; url: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** 非抛出的 slug 化：没有可用 ascii 片段时返回空串，由调用方决定兜底。 */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeSlug(input: string): string {
  const slug = slugify(input);
  if (!slug) throw new TRPCError({ code: 'BAD_REQUEST', message: '专题标识不能为空' });
  return slug;
}

/**
 * 中文名没有可用的 ascii 片段，硬转出来是空串而不是合法标识 —— 这时回退到
 * 随机后缀，而不是让用户面对一个无从下手的校验错误。
 */
export function slugOrFallback(name: string, slugInput?: string): string {
  const explicit = (slugInput ?? '').trim();
  if (explicit) {
    if (!SLUG_RE.test(explicit)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '专题标识只能包含小写字母、数字和连字符' });
    }
    return explicit;
  }
  return slugify(name) || `topic-${randomBytes(3).toString('hex')}`;
}

export function assertHexColor(color: string) {
  if (color && !HEX_COLOR_RE.test(color)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '专题颜色需为 #RRGGBB 格式' });
  }
}

export function sanitizeLinks(input: unknown): BlogLink[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new TRPCError({ code: 'BAD_REQUEST', message: '链接格式不正确' });
  if (input.length > 12) throw new TRPCError({ code: 'BAD_REQUEST', message: '公开资料最多 12 个链接' });
  return input.slice(0, 12).map(raw => {
    const link = raw as Partial<BlogLink>;
    const label = String(link?.label ?? '').trim().slice(0, 40);
    const url = String(link?.url ?? '').trim().slice(0, 300);
    if (!url) throw new TRPCError({ code: 'BAD_REQUEST', message: '链接地址不能为空' });
    // 只允许 http(s)：公开页会把这些地址交给读者，javascript: 会变成注入面。
    if (!/^https?:\/\//i.test(url)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '链接需以 http:// 或 https:// 开头' });
    }
    return { label, url };
  });
}

const profileInclude = { links: true } as const;

export async function getBlogProfile(db: PrismaClient, accountId: number) {
  const existing = await db.blogProfile.findUnique({ where: { accountId } });
  if (existing) return { ...existing, links: (existing.links as unknown as BlogLink[]) ?? [] };
  // 没有记录不等于不能填：返回一份默认草稿，让前端直接进编辑态。
  return { accountId, displayName: '', tagline: '', bio: '', avatarUrl: '', homepage: '', links: [], isPublished: false };
}

export async function upsertBlogProfile(
  db: PrismaClient,
  accountId: number,
  input: { displayName: string; tagline: string; bio: string; avatarUrl: string; homepage: string; links?: unknown; isPublished: boolean },
) {
  const links = sanitizeLinks(input.links);
  if (input.homepage && !/^https?:\/\//i.test(input.homepage.trim())) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: '个人主页需以 http:// 或 https:// 开头' });
  }
  const data = {
    displayName: input.displayName.trim().slice(0, 80),
    tagline: input.tagline.trim().slice(0, 160),
    bio: input.bio.trim().slice(0, 5000),
    avatarUrl: input.avatarUrl.trim().slice(0, 500),
    homepage: input.homepage.trim().slice(0, 300),
    links: links as unknown as Prisma.InputJsonValue,
    isPublished: input.isPublished,
  };
  const saved = await db.blogProfile.upsert({ where: { accountId }, create: { accountId, ...data }, update: data });
  return { ...saved, links };
}

export async function listBlogTopics(db: PrismaClient, accountId: number) {
  const topics = await db.blogTopic.findMany({
    where: { accountId },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: { notes: { select: { noteId: true, sortOrder: true } } },
  });
  return topics.map(topic => ({ ...topic, noteIds: topic.notes.map(n => n.noteId).sort((a, b) => a - b) }));
}

export async function createBlogTopic(db: PrismaClient, accountId: number, input: { name: string; slug?: string; desc: string; color: string; isPublished: boolean }) {
  const name = input.name.trim();
  if (!name) throw new TRPCError({ code: 'BAD_REQUEST', message: '专题名称不能为空' });
  assertHexColor(input.color);
  const slug = slugOrFallback(name, input.slug);
  const clash = await db.blogTopic.findUnique({ where: { accountId_slug: { accountId, slug } } });
  if (clash) throw new TRPCError({ code: 'CONFLICT', message: `标识「${slug}」已被占用` });
  const last = await db.blogTopic.findFirst({ where: { accountId }, orderBy: [{ sortOrder: 'desc' }, { id: 'desc' }] });
  return db.blogTopic.create({
    data: { accountId, name: name.slice(0, 60), slug, desc: input.desc.trim().slice(0, 500), color: input.color, isPublished: input.isPublished, sortOrder: (last?.sortOrder ?? -1) + 1 },
  });
}

export async function updateBlogTopic(db: PrismaClient, accountId: number, id: number, input: { name?: string; slug?: string; desc?: string; color?: string; isPublished?: boolean }) {
  const topic = await db.blogTopic.findFirst({ where: { id, accountId } });
  if (!topic) throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
  const patch: Prisma.blogTopicUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new TRPCError({ code: 'BAD_REQUEST', message: '专题名称不能为空' });
    patch.name = name.slice(0, 60);
  }
  if (input.slug !== undefined && input.slug.trim()) {
    const slug = slugOrFallback(topic.name, input.slug);
    if (slug !== topic.slug) {
      const clash = await db.blogTopic.findUnique({ where: { accountId_slug: { accountId, slug } } });
      if (clash) throw new TRPCError({ code: 'CONFLICT', message: `标识「${slug}」已被占用` });
      patch.slug = slug;
    }
  }
  if (input.desc !== undefined) patch.desc = input.desc.trim().slice(0, 500);
  if (input.color !== undefined) {
    assertHexColor(input.color);
    patch.color = input.color;
  }
  if (input.isPublished !== undefined) patch.isPublished = input.isPublished;
  return db.blogTopic.update({ where: { id }, data: patch });
}

export async function deleteBlogTopic(db: PrismaClient, accountId: number, id: number) {
  const topic = await db.blogTopic.findFirst({ where: { id, accountId } });
  if (!topic) throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
  // blogTopicNote 是 cascade，专题删除后笔记本身不受影响。
  await db.blogTopic.delete({ where: { id } });
  return true;
}

/** 归一化同级专题顺序为 0..n-1，避免像 tag 的 sortOrder 那样出现并列与负数。 */
export async function reorderBlogTopics(db: PrismaClient, accountId: number, orderedIds: number[]) {
  const owned = await db.blogTopic.findMany({ where: { accountId }, select: { id: true } });
  const ownedIds = new Set(owned.map(t => t.id));
  const unique = [...new Set(orderedIds)].filter(id => ownedIds.has(id));
  if (!unique.length) throw new TRPCError({ code: 'BAD_REQUEST', message: '没有可排序的专题' });
  await db.$transaction(unique.map((id, index) => db.blogTopic.update({ where: { id }, data: { sortOrder: index } })));
  return listBlogTopics(db, accountId);
}

/** 只允许把已发布笔记放进专题：未发布的内容不该出现在公开分组里。 */
export async function assignTopicNotes(db: PrismaClient, accountId: number, topicId: number, noteIds: number[]) {
  const topic = await db.blogTopic.findFirst({ where: { id: topicId, accountId } });
  if (!topic) throw new TRPCError({ code: 'NOT_FOUND', message: '专题不存在' });
  const wanted = [...new Set(noteIds)].filter(id => Number.isInteger(id) && id > 0);
  if (wanted.length) {
    const published = await db.notes.count({ where: { id: { in: wanted }, accountId, isRecycle: false, publication: { isNot: null } } });
    if (published !== wanted.length) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: '只能把已发布且未删除的笔记放进专题' });
    }
  }
  await db.$transaction([
    db.blogTopicNote.deleteMany({ where: { topicId, noteId: { notIn: wanted } } }),
    ...wanted.map((noteId, index) =>
      db.blogTopicNote.upsert({
        where: { topicId_noteId: { topicId, noteId } },
        create: { topicId, noteId, sortOrder: index },
        update: { sortOrder: index },
      }),
    ),
  ]);
  return listBlogTopics(db, accountId);
}

/**
 * 设置公开封面。附件必须属于该笔记 —— 否则可以把封面指向任意附件，
 * 等于用别人的图片给自己撑门面。撤回后封面随之失效。
 */
export async function setPublicationCover(db: PrismaClient, accountId: number, noteId: number, attachmentId: number | null) {
  const note = await db.notes.findFirst({ where: { id: noteId, accountId }, include: { publication: true } });
  if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: '笔记不存在' });
  if (!note.publication) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先发布这篇笔记' });
  if (attachmentId !== null) {
    const attachment = await db.attachments.findFirst({ where: { id: attachmentId, noteId } });
    if (!attachment) throw new TRPCError({ code: 'BAD_REQUEST', message: '封面附件必须属于这篇笔记' });
    if (!/^image\//.test(attachment.type)) throw new TRPCError({ code: 'BAD_REQUEST', message: '封面必须是图片附件' });
  }
  await db.notePublication.update({ where: { noteId }, data: { coverAttachmentId: attachmentId } });
  return db.notePublication.findUnique({ where: { noteId }, select: { coverAttachmentId: true, revision: true } });
}

/** 管理页用的已发布列表：带封面、专题、草稿是否领先公开版本。 */
export async function listPublishedForManage(db: PrismaClient, accountId: number) {
  const notes = await db.notes.findMany({
    where: { accountId, isRecycle: false, publication: { isNot: null } },
    orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
    include: {
      publication: { select: { content: true, type: true, revision: true, updatedAt: true, coverAttachmentId: true } },
      attachments: { select: { id: true, name: true, path: true, type: true, sortOrder: true } },
      blogTopics: { select: { topic: { select: { id: true, name: true, color: true } } } },
    },
  });
  return notes.map(note => {
    const { blogTopics, ...rest } = note;
    const p = note.publication!;
    return {
      ...rest,
      topicIds: blogTopics.map(t => t.topic.id),
      topics: blogTopics.map(t => t.topic),
      // 与 publicationStatus 的 hasChanges 同源：只比内容与类型。
      // 不能比 updatedAt —— 发布动作本身会写 notes 行，刚发布完就会误报。
      hasDraftChanges: p.content !== note.content || p.type !== note.type,
    };
  });
}
