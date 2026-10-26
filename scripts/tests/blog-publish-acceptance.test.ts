/**
 * 「检查更新」的验收场景：把规格里能自动验的条目逐条钉住。
 *
 * 真库部分按仓库约定门控：RUN_PUBLISH_DB_TESTS=1 才跑，
 * 用完会把自己建的账号与笔记删掉，不碰别人的数据。
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { buildPublishCheck } from "../../server/lib/blogPublishCheck";
import { publishSnapshot } from "../../server/lib/publication";
import { saveNoteCopy } from "../../server/lib/blog";

const suite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("检查更新：验收场景", () => {
  const db = new PrismaClient();
  let owner = 0;
  let id = 0;
  const V1 = `<h2>验收标题</h2><p>第一版正文。</p>`;
  const V2 = `<h2>验收标题</h2><p>第二版正文。</p>`;

  const readPublication = () =>
    db.notePublication.findUnique({
      where: { noteId: id },
      select: { content: true, title: true, revision: true },
    });
  const readMetadata = async () => {
    const note = await db.notes.findUnique({
      where: { id },
      select: { metadata: true },
    });
    return (note?.metadata ?? {}) as Record<string, any>;
  };

  beforeAll(async () => {
    const name = "publish-accept-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    id = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: V1,
          type: 1,
          metadata: {
            title: "人工整理的标题",
            summary: "人工整理的概要",
            blogPublicTags: ["产品方法"],
            blogSeo: {
              title: "SEO 标题",
              description: "SEO 描述",
              image: "",
              imageAlt: "",
            },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("首次发布：走发布检查，不伪造当前公开版本", async () => {
    const check = await buildPublishCheck(db, owner, id);
    expect(check.lifecycle).toBe("first-publish");
    expect(check.public.hasSnapshot).toBe(false);
    expect(check.public.revision).toBe(0);
  });

  test("原笔记修改后，公开页面保持不变", async () => {
    await publishSnapshot(db, owner, { id });
    await db.notes.update({ where: { id }, data: { content: V2 } });
    const published = await readPublication();
    expect(published?.content).toBe(V1);
  });

  test("检查更新能区分来源更新与草稿修改", async () => {
    const sourceOnly = await buildPublishCheck(db, owner, id);
    expect(sourceOnly.mode).toBe("source-changed");
    expect(sourceOnly.source.changed).toBe(true);

    await saveNoteCopy(db, owner, { noteId: id, title: "人工整理的标题（改过）" });
    const both = await buildPublishCheck(db, owner, id);
    expect(both.changes.title.changed).toBe(true);
    expect(both.mode).not.toBe("up-to-date");
  });

  test("保存发布草稿后，公开页面保持不变", async () => {
    const published = await readPublication();
    expect(published?.content).toBe(V1);
    expect(published?.title).toBe("人工整理的标题");
  });

  test("原笔记更新不会覆盖人工整理过的公开信息", async () => {
    const metadata = await readMetadata();
    expect(metadata.title).toBe("人工整理的标题（改过）");
    expect(metadata.summary).toBe("人工整理的概要");
  });

  test("确认发布：发布的是草稿正文，不是未应用的 AI 候选", async () => {
    const before = await buildPublishCheck(db, owner, id);
    await publishSnapshot(db, owner, {
      id,
      expectedSourceVersion: before.versions.source,
      expectedDraftVersion: before.versions.draft,
      expectedPublicVersion: before.versions.public,
    });
    const published = await readPublication();
    expect(published?.revision).toBe(2);
    expect(published?.content).toBe(V2);
  });

  test("更新成功后地址稳定，SEO 同步冻结", async () => {
    const note = await db.notes.findUnique({
      where: { id },
      select: { publishId: true, metadata: true },
    });
    expect(note?.publishId).toBeTruthy();
    const metadata = note?.metadata as Record<string, any>;
    expect(metadata?.blogSeoPublished?.title).toBe("SEO 标题");
  });

  test("检查后发生并发编辑，旧页面无法覆盖新版本", async () => {
    const stale = await buildPublishCheck(db, owner, id);
    await saveNoteCopy(db, owner, { noteId: id, summary: "并发改的概要" });
    await expect(
      publishSnapshot(db, owner, {
        id,
        expectedSourceVersion: stale.versions.source,
        expectedDraftVersion: stale.versions.draft,
        expectedPublicVersion: stale.versions.public,
      }),
    ).rejects.toThrow(/草稿已发生变化/);
    // 草稿没丢
    const metadata = await readMetadata();
    expect(metadata.summary).toBe("并发改的概要");
  });

  test("重复提交不会创建重复发布记录", async () => {
    // 先把待发布的改动发出去
    await publishSnapshot(db, owner, { id });
    const revision = (await readPublication())?.revision;
    const history = await db.blogPublicationHistory.count({ where: { noteId: id } });
    // 同样的内容再连点两次
    await publishSnapshot(db, owner, { id });
    await publishSnapshot(db, owner, { id });
    expect((await readPublication())?.revision).toBe(revision);
    expect(await db.blogPublicationHistory.count({ where: { noteId: id } })).toBe(
      history,
    );
  });

  test("已撤回：保留历史公开快照供对比", async () => {
    await db.notes.update({ where: { id }, data: { isPublished: false } });
    const check = await buildPublishCheck(db, owner, id);
    expect(check.lifecycle).toBe("withdrawn");
    expect(check.public.hasSnapshot).toBe(true);
    expect(check.changes.content.before).toBe(V2);
  });
});
