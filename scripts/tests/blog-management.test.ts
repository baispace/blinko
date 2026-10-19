import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import {
  normalizeSlug, slugOrFallback, assertHexColor, sanitizeLinks,
  getBlogProfile, upsertBlogProfile, listBlogTopics, createBlogTopic, updateBlogTopic,
  deleteBlogTopic, reorderBlogTopics, assignTopicNotes, setPublicationCover, listPublishedForManage,
} from '../../server/lib/blog';
import { publishSnapshot, publicationStatus } from '../../server/lib/publication';

describe('博客管理输入校验', () => {
  test('slug 归一化', () => {
    expect(normalizeSlug('Hello World')).toBe('hello-world');
    expect(normalizeSlug('  --A--B--  ')).toBe('a-b');
    // 中文没有 ascii 片段，硬转只会得到空串
    expect(() => normalizeSlug('产品思考')).toThrow();
    expect(() => normalizeSlug('!!!')).toThrow();
  });

  test('显式 slug 必须合法，中文名回退随机后缀', () => {
    expect(slugOrFallback('任意名字', 'my-topic')).toBe('my-topic');
    expect(() => slugOrFallback('任意名字', 'Bad Slug')).toThrow();
    expect(() => slugOrFallback('任意名字', 'trailing-')).toThrow();
    // 中文名回退随机后缀，中文名同时给出显式 slug 时以显式为准
    expect(slugOrFallback('产品思考')).toMatch(/^topic-[0-9a-f]{6}$/);
    expect(slugOrFallback('产品思考', 'product')).toBe('product');
  });

  test('颜色必须是 #RRGGBB', () => {
    expect(() => assertHexColor('')).not.toThrow();
    expect(() => assertHexColor('#7055f8')).not.toThrow();
    expect(() => assertHexColor('red')).toThrow();
    expect(() => assertHexColor('#fff')).toThrow();
  });

  test('公开链接只放行 http(s)，拦住 javascript: 与 data:', () => {
    expect(sanitizeLinks([{ label: 'GitHub', url: 'https://github.com' }])).toEqual([{ label: 'GitHub', url: 'https://github.com' }]);
    expect(() => sanitizeLinks([{ label: '', url: 'javascript:alert(1)' }])).toThrow();
    expect(() => sanitizeLinks([{ label: '', url: 'data:text/html,<script>' }])).toThrow();
    expect(() => sanitizeLinks([{ label: '', url: '' }])).toThrow();
    expect(sanitizeLinks(undefined)).toEqual([]);
    expect(() => sanitizeLinks(new Array(13).fill({ label: '', url: 'https://a.test' }))).toThrow();
  });
});

// 仅在显式选中的本地开发库上运行。
const suite = process.env.RUN_PUBLISH_DB_TESTS === '1' ? describe : describe.skip;
suite('博客管理数据库生命周期', () => {
  const db = new PrismaClient();
  let owner: number, other: number, noteId: number, topicA: number, topicB: number;

  beforeAll(async () => {
    const name = 'blog-manage-' + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + '-other' } })).id;
    noteId = (await db.notes.create({ data: { accountId: owner, content: '# 博客测试\n正文', type: 1 } })).id;
    topicA = (await createBlogTopic(db, owner, { name: '产品思考', slug: 'product', desc: 'd1', color: '#2375ed', isPublished: true })).id;
    topicB = (await createBlogTopic(db, owner, { name: 'AI 实践', slug: 'ai', desc: 'd2', color: '#7055f8', isPublished: true })).id;
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.blogProfile.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });

  test('公开资料：默认草稿、校验、持久化', async () => {
    const blank = await getBlogProfile(db, owner);
    expect(blank.isPublished).toBe(false);
    expect(blank.links).toEqual([]);
    await expect(upsertBlogProfile(db, owner, { displayName: 'B', tagline: 't', bio: 'b', avatarUrl: '', homepage: 'javascript:x', links: [], isPublished: true })).rejects.toThrow();
    await expect(upsertBlogProfile(db, owner, { displayName: 'B', tagline: 't', bio: 'b', avatarUrl: '', homepage: '', links: [{ label: 'x', url: 'ftp://a' }], isPublished: true })).rejects.toThrow();
    const saved = await upsertBlogProfile(db, owner, { displayName: ' Brian ', tagline: '保持好奇', bio: 'bio', avatarUrl: '', homepage: 'https://baispace.cn', links: [{ label: 'GitHub', url: 'https://github.com' }], isPublished: true });
    expect(saved.displayName).toBe('Brian');
    expect(saved.links).toHaveLength(1);
    expect((await getBlogProfile(db, owner)).homepage).toBe('https://baispace.cn');
  });

  test('专题排序归一化为连续序号，不产生并列与负数', async () => {
    const before = await listBlogTopics(db, owner);
    expect(before.map(t => t.sortOrder)).toEqual([0, 1]);
    const after = await reorderBlogTopics(db, owner, [topicB, topicA]);
    expect(after.map(t => t.sortOrder)).toEqual([0, 1]);
    expect(after[0].id).toBe(topicB);
    // 别人的专题会被过滤掉，一个都排不了
    await expect(reorderBlogTopics(db, other, [topicA, topicB])).rejects.toThrow('没有可排序的专题');
    expect((await listBlogTopics(db, owner)).map(t => t.sortOrder)).toEqual([0, 1]);
  });

  test('专题标识冲突与跨账号隔离', async () => {
    await expect(createBlogTopic(db, owner, { name: '另一个', slug: 'product', desc: '', color: '', isPublished: true })).rejects.toThrow('已被占用');
    await expect(updateBlogTopic(db, other, topicA, { name: 'x' })).rejects.toThrow('不存在');
    await expect(deleteBlogTopic(db, other, topicA)).rejects.toThrow('不存在');
    expect((await listBlogTopics(db, owner)).length).toBe(2);
  });

  test('未发布的笔记不能进专题', async () => {
    await expect(assignTopicNotes(db, owner, topicA, [noteId])).rejects.toThrow('已发布');
    const draft = await publicationStatus(db, owner, noteId);
    await publishSnapshot(db, owner, { id: noteId, expectedUpdatedAt: draft.draftUpdatedAt });
    const topics = await assignTopicNotes(db, owner, topicA, [noteId]);
    expect(topics.find(t => t.id === topicA)?.noteIds).toEqual([noteId]);
  });

  test('管理列表带出封面、专题与草稿差异', async () => {
    const list = await listPublishedForManage(db, owner);
    expect(list).toHaveLength(1);
    expect(list[0].topicIds).toEqual([topicA]);
    expect(list[0].hasDraftChanges).toBe(false);
    await db.notes.update({ where: { id: noteId }, data: { content: '# 博客测试\n改过的草稿' } });
    expect((await listPublishedForManage(db, owner))[0].hasDraftChanges).toBe(true);
  });

  test('封面必须属于该笔记，且必须是图片', async () => {
    await expect(setPublicationCover(db, owner, noteId, null)).resolves.toMatchObject({ coverAttachmentId: null });
    await expect(setPublicationCover(db, other, noteId, null)).rejects.toThrow('不存在');
    const foreign = await db.attachments.create({ data: { name: 'x.png', path: '/api/file/x.png', type: 'image/png', accountId: other } });
    await expect(setPublicationCover(db, owner, noteId, foreign.id)).rejects.toThrow('必须属于');
    const doc = await db.attachments.create({ data: { name: 'd.pdf', path: '/api/file/d.pdf', type: 'application/pdf', noteId, accountId: owner } });
    await expect(setPublicationCover(db, owner, noteId, doc.id)).rejects.toThrow('图片');
    const img = await db.attachments.create({ data: { name: 'c.png', path: '/api/file/c.png', type: 'image/png', noteId, accountId: owner } });
    expect((await setPublicationCover(db, owner, noteId, img.id))?.coverAttachmentId).toBe(img.id);
  });

  test('删除专题不牵连笔记', async () => {
    await deleteBlogTopic(db, owner, topicB);
    expect((await listBlogTopics(db, owner)).map(t => t.id)).toEqual([topicA]);
    expect(await db.notes.findUnique({ where: { id: noteId } })).not.toBeNull();
  });
});
