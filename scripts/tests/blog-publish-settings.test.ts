import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { readPublishSettings, savePublishSettings, savePublishSettingsSchema } from '../../server/lib/blogPublishSettings';
import { validShortCoverTitle, shortCoverTitleLength } from '../../shared/lib/blogPublishSettings';
import { copyInstructions, groupInstructions } from '../../server/lib/blogAiCopy';
import { withDraftBody, sourceVersionOf } from '../../server/lib/blogPublishCheck';
import { publishSnapshot } from '../../server/lib/publication';

test('compact cover copy is four to six visible characters', () => {
  expect(validShortCoverTitle('产品实践')).toBe(true);
  expect(validShortCoverTitle('推荐召回优化')).toBe(true);
  expect(validShortCoverTitle('短')).toBe(false);
  expect(validShortCoverTitle('推荐召回策略优化')).toBe(false);
  expect(shortCoverTitleLength(' 产品 实践 ')).toBe(4);
  expect(copyInstructions).toContain('4–6 字');
  expect(groupInstructions({ publicTags: [], topics: [] })).toContain('4–6 字');
});
test('new cover palette is validated; old callers may omit it', () => {
  const schema = savePublishSettingsSchema.shape.coverPalette;
  expect(schema.parse(undefined)).toBeUndefined();
  expect(schema.parse('teal')).toBe('teal');
  expect(schema.parse('#087d85')).toBe('#087d85');
  expect(() => schema.parse('url(https://example.com)')).toThrow();
});
const suite = process.env.RUN_PUBLISH_DB_TESTS === '1' ? describe : describe.skip;
suite('unified settings persist atomically while keeping the public snapshot isolated', () => {
  const db = new PrismaClient(); let owner = 0, other = 0, noteId = 0, imageId = 0, foreignId = 0;
  beforeAll(async () => {
    owner = (await db.accounts.create({ data: { name: 'compact-settings-' + crypto.randomUUID() } })).id;
    other = (await db.accounts.create({ data: { name: 'compact-other-' + crypto.randomUUID() } })).id;
    const note = await db.notes.create({ data: { accountId: owner, type: 1, content: '发布设置验证\n\n这是一段用于验证草稿和公开版本隔离的独立测试内容。', metadata: { title: '当前公开标题', summary: '当前公开摘要', privateField: '保留私有信息' } } }); noteId = note.id;
    await publishSnapshot(db, owner, { id: noteId });
    imageId = (await db.attachments.create({ data: { accountId: owner, path: '/api/file/settings-' + crypto.randomUUID() + '.webp', type: 'image/webp', size: 100 } })).id;
    foreignId = (await db.attachments.create({ data: { accountId: other, path: '/api/file/foreign-' + crypto.randomUUID() + '.webp', type: 'image/webp', size: 100 } })).id;
  });
  afterAll(async () => {
    await db.noteHistory.deleteMany({ where: { accountId: { in: [owner, other] } } });
    await db.blogPublicationHistory.deleteMany({ where: { note: { accountId: { in: [owner, other] } } } });
    await db.notePublication.deleteMany({ where: { note: { accountId: { in: [owner, other] } } } });
    await db.attachments.deleteMany({ where: { accountId: { in: [owner, other] } } });
    await db.notes.deleteMany({ where: { accountId: { in: [owner, other] } } });
    await db.blogPublicTag.deleteMany({ where: { accountId: { in: [owner, other] } } });
    await db.accounts.deleteMany({ where: { id: { in: [owner, other] } } }); await db.$disconnect();
  });
  const payload = (state: Awaited<ReturnType<typeof readPublishSettings>>) => savePublishSettingsSchema.parse({ noteId, token: state.token, title: state.title, summary: state.summary, coverTitle: '产品实践', coverSubtitle: '', coverMode: 'overlay', coverAttachmentId: imageId, displayMode: state.displayMode, displayOrder: state.displayOrder });
  test('legacy cover without text-layer config remains a complete image', async () => {
    await db.notePublication.update({ where: { noteId }, data: { draftCoverAttachmentId: imageId } });
    const state = await readPublishSettings(db, owner, noteId);
    expect(state.config.mode).toBe('full');
  });
  test('没发布过的文章默认就是精选，直接发布也进精选', async () => {
    const fresh = await db.notes.create({ data: { accountId: owner, type: 1, content: '新文章还没发布过。', metadata: { title: '新文章' } } });
    // 面板里默认选中「首页精选」（置顶 + banner），作者不用先点一次。
    expect((await readPublishSettings(db, owner, fresh.id)).displayMode).toBe('featured');
    // 绕开面板直接发布也一样进精选。
    await publishSnapshot(db, owner, { id: fresh.id });
    const row = await db.notePublication.findUniqueOrThrow({ where: { noteId: fresh.id } });
    expect(row.isFeatured).toBe(true);
    expect(row.isBanner).toBe(true);
  });
  test('save draft copy, cover and unified display settings without republishing', async () => {
    const state = await readPublishSettings(db, owner, noteId);
    const before = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    await savePublishSettings(db, owner, { ...payload(state), title: '修改后的公开标题', summary: '修改后的概要', displayMode: 'pinned' });
    const after = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    expect(after.title).toBe(before.title); expect(after.content).toBe(before.content); expect(after.coverAttachmentId).toBe(before.coverAttachmentId); expect(after.revision).toBe(before.revision);
    expect(after.draftCoverAttachmentId).toBe(imageId); expect(after.isFeatured).toBe(true); expect(after.isBanner).toBe(false);
    const note = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    expect((note.metadata as any).privateField).toBe('保留私有信息'); expect((note.metadata as any).blogCover.title).toBe('产品实践'); expect((note.metadata as any).blogSeo.title).toBe('');
    await expect(savePublishSettings(db, owner, payload(state))).rejects.toThrow('已在其他位置变化');
  });
  test('foreign assets and invalid short title cannot partially change settings', async () => {
    const state = await readPublishSettings(db, owner, noteId);
    await expect(savePublishSettings(db, owner, { ...payload(state), coverAttachmentId: foreignId, title: '不应写入', displayMode: 'featured' })).rejects.toThrow('本人上传');
    expect((await readPublishSettings(db, owner, noteId)).token).toBe(state.token);
    await expect(savePublishSettings(db, owner, { ...payload(state), coverTitle: '过长的封面短标题' })).rejects.toThrow('4–6');
    await expect(readPublishSettings(db, other, noteId)).rejects.toThrow('无权管理');
  });
  test('AI candidate generation does not invalidate the settings token, featured mode implies pinning with a shared order', async () => {
    const state = await readPublishSettings(db, owner, noteId);
    await db.notePublication.update({ where: { noteId }, data: { aiCopy: { candidates: {} } } });
    expect((await readPublishSettings(db, owner, noteId)).token).toBe(state.token);
    await savePublishSettings(db, owner, { ...payload(state), displayMode: 'featured', displayOrder: 3 });
    const after = await readPublishSettings(db, owner, noteId); expect(after.displayMode).toBe('featured'); expect(after.displayOrder).toBe(3);
    const row = await db.notePublication.findUniqueOrThrow({ where: { noteId } }); expect(row.isFeatured).toBe(true); expect(row.isBanner).toBe(true); expect(row.featuredOrder).toBe(row.bannerOrder);
  });
  test('save and publish commits one snapshot and keeps private fields', async () => {
    const state = await readPublishSettings(db, owner, noteId);
    const before = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    await savePublishSettings(db, owner, { ...payload(state), title: '直接发布验证', displayMode: 'default', action: 'publish' });
    const after = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    expect(after.title).toBe('直接发布验证'); expect(after.revision).toBe(before.revision + 1);
    expect(after.isFeatured).toBe(false); expect(after.isBanner).toBe(false);
    expect((await db.notes.findUniqueOrThrow({ where: { id: noteId } })).isPublished).toBe(true);
  });
  test('failed publish rolls back metadata and display settings', async () => {
    const before = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    await db.notes.update({ where: { id: noteId }, data: { content: '' } });
    const state = await readPublishSettings(db, owner, noteId);
    await expect(savePublishSettings(db, owner, { ...payload(state), title: '不能部分保存', action: 'publish' })).rejects.toThrow();
    expect((await readPublishSettings(db, owner, noteId)).token).toBe(state.token);
    await db.notes.update({ where: { id: noteId }, data: { content: before.content } });
  });
  test('unpublished notes use the same workflow without exposing draft contents', async () => {
    const note = await db.notes.create({ data: { accountId: owner, type: 1, content: '全新文章正文' } });
    const state = await readPublishSettings(db, owner, note.id);
    expect(state.revision).toBe(0);
    await savePublishSettings(db, owner, { ...payload(state), noteId: note.id, coverAttachmentId: null, action: 'draft' });
    expect((await db.notes.findUniqueOrThrow({ where: { id: note.id } })).isPublished).toBe(false);
    const draft = await readPublishSettings(db, owner, note.id);
    await savePublishSettings(db, owner, { ...payload(draft), noteId: note.id, coverAttachmentId: null, action: 'publish' });
    expect((await db.notePublication.findUniqueOrThrow({ where: { noteId: note.id } })).revision).toBe(1);
  });
  test('source-only changes publish without a second synchronization step', async () => {
    const note = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    const publication = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    await db.notes.update({ where: { id: noteId }, data: { content: '来源单侧更新正文', metadata: withDraftBody(note.metadata, { content: publication.content, sourceVersion: sourceVersionOf(note.content, note.type) }) } });
    const state = await readPublishSettings(db, owner, noteId);
    await savePublishSettings(db, owner, { ...payload(state), action: 'publish' });
    expect((await db.notePublication.findUniqueOrThrow({ where: { noteId } })).content).toBe('来源单侧更新正文');
  });
  test('conflicting bodies require an explicit choice, then publish atomically', async () => {
    const note = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    await db.notes.update({ where: { id: noteId }, data: { content: '来源侧继续修改', metadata: withDraftBody(note.metadata, { content: '发布草稿独立修改', sourceVersion: sourceVersionOf(note.content, note.type) }) } });
    const state = await readPublishSettings(db, owner, noteId);
    await expect(savePublishSettings(db, owner, { ...payload(state), action: 'publish' })).rejects.toThrow('选择要发布的正文');
    expect((await readPublishSettings(db, owner, noteId)).token).toBe(state.token);
    await savePublishSettings(db, owner, { ...payload(state), action: 'publish', sourceChoice: 'keep' });
    expect((await db.notePublication.findUniqueOrThrow({ where: { noteId } })).content).toBe('发布草稿独立修改');
  });
  test('invalid topic ownership rolls back the whole save', async () => {
    const state = await readPublishSettings(db, owner, noteId);
    await expect(savePublishSettings(db, owner, { ...payload(state), topics: [{ topicId: 2147483647, sectionId: null }], displayMode: 'featured' })).rejects.toThrow('专题或章节');
    expect((await readPublishSettings(db, owner, noteId)).token).toBe(state.token);
  });

  test('display-only saves do not change the publishing draft or its SEO', async () => {
    const before = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    const state = await readPublishSettings(db, owner, noteId);
    const publication = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    await savePublishSettings(db, owner, { ...payload(state), title: '此字段不应被展示设置写入', displayMode: 'featured', action: 'display' });
    const after = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    expect(after.metadata).toEqual(before.metadata); expect(after.updatedAt).toEqual(before.updatedAt);
    const updated = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    expect(updated.isFeatured && updated.isBanner).toBe(true); expect(updated.revision).toBe(publication.revision); expect(updated.draftCoverAttachmentId).toBe(publication.draftCoverAttachmentId);
  });

});
