import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { publishSnapshot } from "../../server/lib/publication";
import { applyCoverToDraft } from "../../server/lib/blogCoverGeneration";
import { ensureShareImage, SHARE_SIZE } from "../../server/lib/blogCoverShare";
import { publicCard } from "../../server/lib/publicBlog";
import { isPublicBlogAsset } from "../../server/lib/blog";
import { FileService } from "../../server/lib/files";
import { coverHasTextLayer } from "../../shared/lib/blogCoverText";

/**
 * 一张底图 + 独立文字层：草稿隔离、公开快照、派生分享图。
 *
 * 真库测试，按仓库约定用 RUN_PUBLISH_DB_TESTS=1 打开。
 */
const suite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("封面文字层：草稿、公开快照与分享图", () => {
  const db = new PrismaClient();
  let owner = 0;
  let noteId = 0;
  let basePath = "";

  const uploadBase = async () => {
    const buffer = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: "#4930e8",
      },
    })
      .webp()
      .toBuffer();
    const uploaded = await FileService.uploadFile({
      buffer,
      originalName: `cover-base-${crypto.randomUUID()}.webp`,
      type: "image/webp",
      accountId: owner,
    });
    basePath = uploaded.filePath;
    const attachment = await db.attachments.findFirstOrThrow({
      where: { path: uploaded.filePath },
    });
    await db.attachments.update({
      where: { id: attachment.id },
      data: { noteId },
    });
    return attachment.id;
  };

  const publicCoverConfig = async () => {
    const row = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { coverConfig: true, coverAttachmentId: true },
    });
    return row;
  };

  beforeAll(async () => {
    owner = (
      await db.accounts.create({ data: { name: "cover-text-" + crypto.randomUUID() } })
    ).id;
    noteId = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "<h2>封面测试</h2><p>正文。</p>",
          type: 1,
          metadata: { title: "封面测试" },
        },
      })
    ).id;
    await publishSnapshot(db, owner, { id: noteId });
  });

  afterAll(async () => {
    if (owner) {
      const files = await db.attachments.findMany({
        where: { accountId: owner },
        select: { path: true },
      });
      for (const file of files) {
        try {
          await FileService.deleteFile(file.path);
        } catch {
          // 文件已经被清掉了就算了。
        }
      }
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.attachments.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("老封面没有文字配置：公开页只显示图片，不叠字", async () => {
    const note = await db.notes.findUniqueOrThrow({
      where: { id: noteId },
      select: { id: true, publishId: true, publication: true, blogTopics: true },
    });
    const card = publicCard(note as never);
    expect(card.coverConfig).toBeNull();
    // 没有配置就没有文字层 —— 旧封面不会被再叠一次字。
    expect(coverHasTextLayer(card.coverConfig)).toBe(false);
  });

  test("应用封面只动草稿：公开快照还是原来的样子", async () => {
    const attachmentId = await uploadBase();
    await applyCoverToDraft(db, owner, {
      noteId,
      attachmentId,
      config: {
        mode: "overlay",
        templateVersion: "v1",
        title: "召回三段式改造",
        subtitle: "先校准分数再融合",
        align: "left",
        sizeScale: 1,
        palette: "violet",
      },
    });
    const publicRow = await publicCoverConfig();
    // 公开快照还没动：底图与文字都还是空的。
    expect(publicRow.coverAttachmentId).toBeNull();
    expect(publicRow.coverConfig).toBeNull();
    // 草稿那边已经写好了。
    const draft = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { draftCoverAttachmentId: true },
    });
    expect(draft.draftCoverAttachmentId).toBe(attachmentId);
    const note = await db.notes.findUniqueOrThrow({
      where: { id: noteId },
      select: { metadata: true },
    });
    expect((note.metadata as any)?.blogCover?.title).toBe("召回三段式改造");
  });

  test("发布后底图与文字配置一起进公开快照与历史", async () => {
    await publishSnapshot(db, owner, { id: noteId });
    const publicRow = await publicCoverConfig();
    expect(publicRow.coverAttachmentId).not.toBeNull();
    expect((publicRow.coverConfig as any)?.title).toBe("召回三段式改造");
    expect((publicRow.coverConfig as any)?.subtitle).toBe("先校准分数再融合");
    const history = await db.blogPublicationHistory.findMany({
      where: { noteId },
      orderBy: { revision: "asc" },
    });
    const last = history[history.length - 1];
    expect((last.coverConfig as any)?.title).toBe("召回三段式改造");
  });

  test("公开接口带出文字配置，页面才能画文字层", async () => {
    const note = await db.notes.findUniqueOrThrow({
      where: { id: noteId },
      select: { id: true, publishId: true, publication: true, blogTopics: true },
    });
    const card = publicCard(note as never);
    expect(card.coverConfig?.title).toBe("召回三段式改造");
    expect(coverHasTextLayer(card.coverConfig)).toBe(true);
  });

  test("分享图由公开版本的底图与文字派生，尺寸 1200×630，且匿名可取", async () => {
    const path = await ensureShareImage(db, noteId);
    expect(path).toBeTruthy();
    const attachment = await db.attachments.findFirstOrThrow({
      where: { path: path! },
    });
    const meta = await sharp(await FileService.getFileBuffer(path!)).metadata();
    expect([meta.width, meta.height]).toEqual([SHARE_SIZE.width, SHARE_SIZE.height]);
    // 分享图属于公开版本的一部分：匿名也要能取到。
    expect(await isPublicBlogAsset(db, path!)).toBe(true);
    // 指纹记着是哪一版生成的。
    expect((attachment.metadata as any)?.blogShareImage?.revision).toBe(
      (await db.notePublication.findUniqueOrThrow({ where: { noteId } })).revision,
    );
  });

  test("分享图跟着公开版本走：草稿里未发布的文案不会泄露进分享图", async () => {
    const before = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { revision: true, shareCoverAttachmentId: true },
    });
    // 草稿改成另一个标题，但不发布。
    const note = await db.notes.findUniqueOrThrow({
      where: { id: noteId },
      select: { metadata: true },
    });
    await db.notes.update({
      where: { id: noteId },
      data: {
        metadata: {
          ...(note.metadata as Record<string, unknown>),
          blogCover: {
            ...((note.metadata as any)?.blogCover ?? {}),
            title: "未发布的秘密标题",
          },
        } as never,
      },
    });
    // 分享图仍然按公开版本那一份配置，不受草稿影响。
    const path = await ensureShareImage(db, noteId);
    expect(path).toBeTruthy();
    const after = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { revision: true, shareCoverAttachmentId: true },
    });
    expect(after.revision).toBe(before.revision);
    expect(after.shareCoverAttachmentId).toBe(before.shareCoverAttachmentId);
  });

  test("重复应用同一张底图不会产生第二份底图", async () => {
    const row = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { draftCoverAttachmentId: true },
    });
    const attachmentId = row.draftCoverAttachmentId!;
    const before = await db.attachments.count({ where: { accountId: owner } });
    await applyCoverToDraft(db, owner, {
      noteId,
      attachmentId,
      config: {
        mode: "overlay",
        templateVersion: "v1",
        title: "召回三段式改造",
        subtitle: "先校准分数再融合",
        align: "left",
        sizeScale: 1,
        palette: "violet",
      },
    });
    const after = await db.attachments.count({ where: { accountId: owner } });
    expect(after).toBe(before);
  });
});
