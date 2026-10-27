import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  buildPublishCheck,
  deriveTitle,
  draftVersionOf,
  readDraftBody,
  readSourceBaseline,
  resolveSourceChange,
  sourceVersionOf,
  withDraftBody,
  withSourceBaseline,
} from "../../server/lib/blogPublishCheck";
import { publishSnapshot } from "../../server/lib/publication";

/* ---------------- 纯函数 ---------------- */

describe("草稿正文与来源基线", () => {
  test("没分叉时草稿正文就是原笔记正文", () => {
    const state = readDraftBody({}, "<p>正文</p>");
    expect(state.forked).toBe(false);
    expect(state.content).toBe("<p>正文</p>");
  });

  test("分叉之后草稿正文独立，原笔记再改也不影响它", () => {
    const metadata = withDraftBody({}, {
      content: "<p>草稿正文</p>",
      sourceVersion: "abc",
    });
    const state = readDraftBody(metadata, "<p>原笔记改过了</p>");
    expect(state.forked).toBe(true);
    expect(state.content).toBe("<p>草稿正文</p>");
    expect(state.sourceVersion).toBe("abc");
  });

  test("写草稿正文不会动 metadata 里的其它键", () => {
    const metadata = withDraftBody({ title: "公开标题", blogPublicTags: ["甲"] }, {
      content: "<p>x</p>",
      sourceVersion: "v1",
    });
    const m = metadata as Record<string, unknown>;
    expect(m.title).toBe("公开标题");
    expect(m.blogPublicTags).toEqual(["甲"]);
    expect(m.blogDraftBody).toBeTruthy();
  });

  test("来源基线：没有就是没有，不猜", () => {
    expect(readSourceBaseline({}).version).toBe(null);
    const withBase = withSourceBaseline({}, "v9");
    expect(readSourceBaseline(withBase).version).toBe("v9");
  });

  test("标题派生与前台口径一致", () => {
    expect(deriveTitle("<h2>背景</h2><p>正文</p>")).toBe("背景");
    expect(deriveTitle("<p>第一段</p><p>第二段</p>")).toBe("第一段");
  });

  test("草稿指纹只看公开字段，顺序变化不影响标签", () => {
    const base = {
      title: "标题",
      summary: "概要",
      body: "<p>正文</p>",
      tags: ["甲", "乙"],
      coverAttachmentId: 1,
      seo: { title: "", description: "", image: "", imageAlt: "" },
    };
    const swapped = { ...base, tags: ["乙", "甲"] };
    expect(draftVersionOf(base)).toBe(draftVersionOf(swapped));
    expect(draftVersionOf(base)).not.toBe(draftVersionOf({ ...base, body: "<p>改了</p>" }));
  });

  test("来源指纹随正文变化", () => {
    expect(sourceVersionOf("<p>a</p>", 1)).not.toBe(sourceVersionOf("<p>b</p>", 1));
  });
});

/* ---------------- 真库 ---------------- */

const suite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

suite("检查更新：来源、草稿与公开版本", () => {
  const db = new PrismaClient();
  let owner = 0;
  let id = 0;

  const setSource = async (content: string) =>
    db.notes.update({ where: { id }, data: { content } });

  const setDraft = async (metadata: Record<string, unknown>) =>
    db.notes.update({
      where: { id },
      data: { metadata: metadata as never },
    });

  const readMetadata = async () => {
    const note = await db.notes.findUnique({ where: { id }, select: { metadata: true } });
    return (note?.metadata ?? {}) as Record<string, unknown>;
  };

  beforeAll(async () => {
    const name = "publish-check-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    id = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "<h2>实验标题</h2><p>第一版正文。</p>",
          type: 1,
          metadata: { title: "人工整理的公开标题", summary: "第一版概要" },
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

  test("从未发布：走首次发布，不伪造公开版本", async () => {
    const check = await buildPublishCheck(db, owner, id);
    expect(check.lifecycle).toBe("first-publish");
    expect(check.mode).toBe("first-publish");
    expect(check.public.hasSnapshot).toBe(false);
    expect(check.public.revision).toBe(0);
  });

  test("发布后没有变化：公开内容已是最新", async () => {
    await publishSnapshot(db, owner, { id });
    const check = await buildPublishCheck(db, owner, id);
    expect(check.lifecycle).toBe("live");
    expect(check.mode).toBe("up-to-date");
    expect(check.changedFields).toEqual([]);
    expect(check.source.baselineAvailable).toBe(true);
  });

  test("原笔记修改不影响公开页面，只在检查里报出来", async () => {
    await setSource("<h2>实验标题</h2><p>第二版正文。</p>");
    const check = await buildPublishCheck(db, owner, id);
    // 公开快照没动
    const published = await db.notePublication.findUnique({ where: { noteId: id } });
    expect(published?.content).toContain("第一版正文");
    // 检查里能看出来：来源变了
    expect(check.source.changed).toBe(true);
    expect(check.mode).toBe("source-changed");
  });

  test("保留当前草稿：记下基线，草稿一个字不动", async () => {
    const before = await readMetadata();
    await resolveSourceChange(db, owner, { noteId: id, adoptBody: false });
    const after = await readMetadata();
    expect(after.title).toBe(before.title);
    expect(after.summary).toBe(before.summary);
    expect(after.blogDraftBody).toBeUndefined();
    const check = await buildPublishCheck(db, owner, id);
    expect(check.source.changed).toBe(false);
  });

  test("采用原笔记更新：只更新草稿正文，不动人工整理过的公开信息", async () => {
    await setSource("<h2>实验标题</h2><p>第三版正文。</p>");
    await resolveSourceChange(db, owner, { noteId: id, adoptBody: true });
    const metadata = await readMetadata();
    expect(metadata.title).toBe("人工整理的公开标题");
    expect(metadata.summary).toBe("第一版概要");
    const state = readDraftBody(metadata, "<p>第三版正文。</p>");
    expect(state.forked).toBe(true);
    expect(state.content).toContain("第三版正文");
  });

  test("两边都改过：标成冲突，作者来定", async () => {
    // 草稿正文已经被改成第三版，原笔记现在又变成第四版
    await setSource("<h2>实验标题</h2><p>第四版正文。</p>");
    const metadata = await readMetadata();
    const forked = withDraftBody(metadata, {
      content: "<h2>实验标题</h2><p>第三版正文（作者改过）。</p>",
      sourceVersion: sourceVersionOf("<h2>实验标题</h2><p>第三版正文。</p>", 1),
    });
    await setDraft(forked as Record<string, unknown>);
    await db.notePublication.update({
      where: { noteId: id },
      data: { content: "<h2>实验标题</h2><p>第一版正文。</p>" },
    });
    const check = await buildPublishCheck(db, owner, id);
    expect(check.mode).toBe("conflict");
    expect(check.conflicts.some((c) => c.field === "body")).toBe(true);
  });

  test("冲突处理成采用原笔记：草稿正文回到来源版本", async () => {
    await resolveSourceChange(db, owner, { noteId: id, adoptBody: true });
    const metadata = await readMetadata();
    const state = readDraftBody(metadata, "");
    expect(state.content).toContain("第四版正文");
    const check = await buildPublishCheck(db, owner, id);
    expect(check.conflicts.length).toBe(0);
  });

  test("版本对不上就挡住发布，不让旧页面覆盖新版本", async () => {
    const check = await buildPublishCheck(db, owner, id);
    await expect(
      publishSnapshot(db, owner, {
        id,
        expectedDraftVersion: "00000000000000000000000000000000",
      }),
    ).rejects.toThrow(/草稿已发生变化/);
    // 版本对得上就能发
    await publishSnapshot(db, owner, {
      id,
      expectedSourceVersion: check.versions.source,
      expectedDraftVersion: check.versions.draft,
      expectedPublicVersion: check.versions.public,
    });
  });

  test("重复提交不会写出第二个版本，历史只留一条", async () => {
    const before = await db.notePublication.findUnique({ where: { noteId: id } });
    const historyBefore = await db.blogPublicationHistory.count({ where: { noteId: id } });
    // 同样的内容再发一次
    await publishSnapshot(db, owner, { id });
    const after = await db.notePublication.findUnique({ where: { noteId: id } });
    const historyAfter = await db.blogPublicationHistory.count({ where: { noteId: id } });
    expect(after?.revision).toBe(before?.revision);
    expect(historyAfter).toBe(historyBefore);
    const rows = await db.blogPublicationHistory.findMany({ where: { noteId: id } });
    const revisions = rows.map((r) => r.revision);
    expect(new Set(revisions).size).toBe(revisions.length);
  });

  test("发布后公开地址不变，历史里留有版本", async () => {
    const note = await db.notes.findUnique({ where: { id }, select: { publishId: true } });
    expect(note?.publishId).toBeTruthy();
    const rows = await db.blogPublicationHistory.findMany({
      where: { noteId: id },
      orderBy: { revision: "asc" },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].content).toContain("正文");
  });
});
