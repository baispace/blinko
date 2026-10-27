import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { createBlogTopic, saveBlogTopic } from "../../server/lib/blog";
import {
  listTopicSections,
  saveTopicArrangement,
  deleteTopicSection,
  reorderTopicSections,
  setArticleTopicSection,
  removeArticleTopic,
} from "../../server/lib/blogSections";
import {
  normalizePublicTags,
  readDraftPublicTags,
  listPublicTagPool,
  PUBLIC_TAG_LIMIT,
} from "../../server/lib/blogPublicTags";
import {
  publicationStatus,
  publishSnapshot,
  publicationChanges,
} from "../../server/lib/publication";
import { saveNoteCopy, setPublicationBanner } from "../../server/lib/blog";
import { bannerPosts, featuredPosts } from "../../server/lib/publicBlog";
import {
  parseBlogCopyGroup,
  extractJsonObject,
} from "../../server/lib/blogAiCopy";

describe("JSON 对象提取", () => {
  test("按括号配对扫描，跳过字符串里的花括号", () => {
    expect(extractJsonObject('前缀 {"a":"含有 } 的字符串"} 后缀')).toBe(
      '{"a":"含有 } 的字符串"}',
    );
  });

  test("转义引号不会打断扫描", () => {
    expect(extractJsonObject('{"a":"\\" 与 }"}')).toBe('{"a":"\\" 与 }"}');
  });

  test("没有完整对象时返回 null", () => {
    expect(extractJsonObject("没有 JSON")).toBe(null);
    expect(extractJsonObject('{"a":1')).toBe(null);
  });
});

describe("AI 整组结果解析", () => {
  const context = {
    publicTags: ["产品方法", "需求分析"],
    topics: [
      { name: "产品思考", sections: [{ name: "第一章：发现问题", desc: "" }] },
      { name: "AI 实践", sections: [] },
    ],
  };

  test("缺字段不抛错，返回可用部分并说明缺了什么", () => {
    const group = parseBlogCopyGroup(
      '{"title":"从问题到方案","publicTags":["产品方法"]}',
      context,
      "v1",
    );
    expect(group.title).toBe("从问题到方案");
    expect(group.publicTags).toEqual(["产品方法"]);
    expect(group.issues.join("")).toContain("文章概要");
    expect(group.issues.join("")).toContain("封面短标题");
    expect(group.contentVersion).toBe("v1");
  });

  test("公开标签优先匹配已有标签池的写法", () => {
    const group = parseBlogCopyGroup(
      '{"title":"T","summary":"S","coverTitle":"C","publicTags":["产品方法","新标签"]}',
      context,
      "v1",
    );
    expect(group.publicTags[0]).toBe("产品方法");
    expect(group.publicTags).toContain("新标签");
  });

  test("归属建议只认已有专题与章节，不存在的被丢弃并提示", () => {
    const group = parseBlogCopyGroup(
      JSON.stringify({
        title: "T",
        summary: "S",
        coverTitle: "C",
        topicSuggestions: [
          { topic: "产品思考", section: "第一章：发现问题" },
          { topic: "不存在的专题", section: "" },
        ],
      }),
      context,
      "v1",
    );
    expect(group.topicSuggestions).toEqual([
      { topic: "产品思考", section: "第一章：发现问题" },
    ]);
    expect(group.issues.join("")).toContain("不存在的专题");
  });

  test("模型返回非 JSON 时给出可读问题，不抛异常", () => {
    const group = parseBlogCopyGroup("我不知道", context, "v1");
    expect(group.title).toBe("");
    expect(group.issues).toHaveLength(1);
    expect(group.issues[0]).toContain("JSON");
  });
});

describe("公开标签归一化", () => {
  test("去重（大小写不敏感）、去空白、限制数量", () => {
    const tags = normalizePublicTags([
      "  AI  ",
      "ai",
      "AI",
      "产品方法",
      "",
      "   ",
    ]);
    expect(tags).toEqual(["AI", "产品方法"]);
  });

  test("超过上限时截断到上限个数", () => {
    const many = Array.from({ length: 20 }, (_, i) => `标签${i}`);
    expect(normalizePublicTags(many)).toHaveLength(PUBLIC_TAG_LIMIT);
  });

  test("非字符串条目被忽略，不抛错", () => {
    expect(normalizePublicTags([1, null, undefined, "有效"])).toEqual(["有效"]);
  });

  test("草稿态从 metadata.blogPublicTags 读，其它键不受影响", () => {
    expect(readDraftPublicTags({ blogPublicTags: ["A", "a", "B"] })).toEqual([
      "A",
      "B",
    ]);
    expect(readDraftPublicTags({ expireAt: 1 })).toEqual([]);
    expect(readDraftPublicTags(null)).toEqual([]);
  });
});

// Only run against the explicitly selected local development database.
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("专题章节编排与公开标签", () => {
  const db = new PrismaClient();
  let owner: number,
    other: number,
    topicId: number,
    otherTopicId: number,
    noteA: number,
    noteB: number,
    noteC: number;

  const makeNote = async (accountId: number, title: string) => {
    const note = await db.notes.create({
      data: { accountId, content: `# ${title}\n正文内容`, type: 1 },
    });
    // 先发布，章节只收已发布文章。
    await publishSnapshot(db, accountId, { id: note.id });
    return note.id;
  };

  beforeAll(async () => {
    const name = "blog-sections-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    topicId = (
      await createBlogTopic(db, owner, {
        name: "产品思考",
        slug: "product-" + crypto.randomUUID().slice(0, 8),
        desc: "",
        color: "#7055f8",
        isPublished: true,
      })
    ).id;
    otherTopicId = (
      await createBlogTopic(db, owner, {
        name: "AI 实践",
        slug: "ai-" + crypto.randomUUID().slice(0, 8),
        desc: "",
        color: "#2375ed",
        isPublished: true,
      })
    ).id;
    noteA = await makeNote(owner, "文章 A");
    noteB = await makeNote(owner, "文章 B");
    noteC = await makeNote(owner, "文章 C");
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.blogTopic.deleteMany({ where: { accountId: owner } });
      await db.blogProfile.deleteMany({ where: { accountId: owner } });
      await db.blogPublicTag.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });

  test("旧文章默认落在未分章节", async () => {
    await db.blogTopicNote.create({
      data: { topicId, noteId: noteA, sortOrder: 0 },
    });
    const layout = await listTopicSections(db, owner, topicId);
    expect(layout.sections).toEqual([]);
    expect(layout.unassignedNoteIds).toEqual([noteA]);
  });

  test("保存编排：章节顺序 → 章内顺序 → 未分章节，全局顺序连续", async () => {
    const layout = await saveTopicArrangement(db, owner, {
      topicId,
      sections: [
        { name: "第一章：发现问题", noteIds: [noteB] },
        { name: "第二章：设计与验证", noteIds: [noteC] },
      ],
      unassignedNoteIds: [noteA],
    });
    expect(layout.sections.map((s) => s.name)).toEqual([
      "第一章：发现问题",
      "第二章：设计与验证",
    ]);
    expect(layout.sections[0].noteIds).toEqual([noteB]);
    expect(layout.unassignedNoteIds).toEqual([noteA]);
    const rows = await db.blogTopicNote.findMany({
      where: { topicId },
      orderBy: [{ sortOrder: "asc" }],
    });
    expect(rows.map((r) => r.noteId)).toEqual([noteB, noteC, noteA]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
    expect(rows[0].sectionId).toBe(layout.sections[0].id);
    expect(rows[2].sectionId).toBe(null);
  });

  test("仅保存资料不覆盖章节、文章和排序", async () => {
    const before = await listTopicSections(db, owner, topicId);
    await saveBlogTopic(db, owner, {
      id: topicId,
      name: "产品思考",
      desc: "更新简介",
      color: "#7055f8",
      isPublished: true,
    });
    const after = await listTopicSections(db, owner, topicId);
    expect(after.sections).toEqual(before.sections);
    expect(after.unassignedNoteIds).toEqual(before.unassignedNoteIds);
  });

  test("跨章节移动：文章换章后全局顺序重新归一", async () => {
    const before = await listTopicSections(db, owner, topicId);
    const first = before.sections[0];
    const second = before.sections[1];
    const layout = await saveTopicArrangement(db, owner, {
      topicId,
      sections: [
        { id: first.id, name: first.name, noteIds: [] },
        { id: second.id, name: second.name, noteIds: [noteB, noteC] },
      ],
      unassignedNoteIds: [noteA],
    });
    expect(layout.sections[0].noteIds).toEqual([]);
    expect(layout.sections[1].noteIds).toEqual([noteB, noteC]);
    const rows = await db.blogTopicNote.findMany({
      where: { topicId },
      orderBy: [{ sortOrder: "asc" }],
    });
    expect(rows.map((r) => r.noteId)).toEqual([noteB, noteC, noteA]);
    expect(rows[0].sectionId).toBe(second.id);
  });

  test("同一文章在同一专题里只落一个章节", async () => {
    const before = await listTopicSections(db, owner, topicId);
    const layout = await saveTopicArrangement(db, owner, {
      topicId,
      sections: [
        {
          id: before.sections[0].id,
          name: before.sections[0].name,
          noteIds: [noteB],
        },
        {
          id: before.sections[1].id,
          name: before.sections[1].name,
          noteIds: [noteB, noteC],
        },
      ],
      unassignedNoteIds: [],
    });
    const first = layout.sections.find((s) => s.noteIds.includes(noteB));
    expect(first?.noteIds).toEqual([noteB]);
    const rows = await db.blogTopicNote.findMany({
      where: { topicId, noteId: noteB },
    });
    expect(rows).toHaveLength(1);
  });

  test("删除章节：文章回落未分章节，文章本身不删", async () => {
    const before = await listTopicSections(db, owner, topicId);
    const target = before.sections.find((s) => s.noteIds.length > 0)!;
    const members = target.noteIds;
    const after = await deleteTopicSection(db, owner, target.id);
    expect(after.sections.some((s) => s.id === target.id)).toBe(false);
    for (const noteId of members)
      expect(after.unassignedNoteIds).toContain(noteId);
    const note = await db.notes.findUnique({ where: { id: members[0] } });
    expect(note).toBeTruthy();
  });

  test("章节排序：顺序归一为连续序号", async () => {
    const before = await listTopicSections(db, owner, topicId);
    if (before.sections.length < 2) return;
    const reversed = [...before.sections].reverse();
    const after = await reorderTopicSections(
      db,
      owner,
      topicId,
      reversed.map((s) => s.id),
    );
    expect(after.sections.map((s) => s.name)).toEqual(
      reversed.map((s) => s.name),
    );
    expect(after.sections.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  test("跨账号隔离：别人不能改我的章节编排", async () => {
    await expect(
      saveTopicArrangement(db, other, {
        topicId,
        sections: [{ name: "越权", noteIds: [] }],
        unassignedNoteIds: [],
      }),
    ).rejects.toThrow("专题不存在");
    await expect(listTopicSections(db, other, topicId)).rejects.toThrow(
      "专题不存在",
    );
  });

  test("文章可在多个专题里各自落在不同章节", async () => {
    const layout = await saveTopicArrangement(db, owner, {
      topicId,
      sections: [{ name: "主专题章节", noteIds: [noteA] }],
      unassignedNoteIds: [],
    });
    const sectionId = layout.sections[0].id;
    const otherLayout = await saveTopicArrangement(db, owner, {
      topicId: otherTopicId,
      sections: [{ name: "另一专题章节", noteIds: [noteA] }],
      unassignedNoteIds: [],
    });
    expect(otherLayout.sections[0].noteIds).toEqual([noteA]);
    const rows = await db.blogTopicNote.findMany({
      where: { noteId: noteA },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.sectionId).sort()).toEqual(
      [sectionId, otherLayout.sections[0].id].sort(),
    );
  });

  test("文章归属：可改章节、可移出专题，文章保留", async () => {
    const layout = await listTopicSections(db, owner, topicId);
    const sectionId = layout.sections[0].id;
    await setArticleTopicSection(db, owner, {
      noteId: noteB,
      topicId,
      sectionId,
    });
    const after = await listTopicSections(db, owner, topicId);
    expect(after.sections[0].noteIds).toContain(noteB);
    await removeArticleTopic(db, owner, { noteId: noteB, topicId });
    const removed = await listTopicSections(db, owner, topicId);
    expect(removed.sections[0].noteIds).not.toContain(noteB);
    expect(await db.notes.findUnique({ where: { id: noteB } })).toBeTruthy();
  });

  test("章节编排不增加公开版本号", async () => {
    const before = await publicationStatus(db, owner, noteA);
    await saveTopicArrangement(db, owner, {
      topicId,
      sections: [{ name: "改个章节名", noteIds: [noteA] }],
      unassignedNoteIds: [],
    });
    const after = await publicationStatus(db, owner, noteA);
    expect(after.revision).toBe(before.revision);
  });

  test("公开标签写进草稿，并进发布快照", async () => {
    const saved = await saveNoteCopy(db, owner, {
      noteId: noteA,
      publicTags: ["产品方法", "需求分析", "产品方法"],
    });
    expect(saved.publicTags).toEqual(["产品方法", "需求分析"]);
    const pool = await listPublicTagPool(db, owner);
    expect(pool.map((t) => t.name)).toContain("产品方法");
    const status = await publicationStatus(db, owner, noteA);
    expect(status.draft.publicTags).toEqual(["产品方法", "需求分析"]);
    // 草稿改了标签 → 与公开版本不一致
    expect(status.changes).toContain("tags");
    expect(status.hasChanges).toBe(true);
    await publishSnapshot(db, owner, { id: noteA });
    const published = await publicationStatus(db, owner, noteA);
    expect(published.changes).not.toContain("tags");
    expect(published.current?.publicTags).toEqual(["产品方法", "需求分析"]);
  });

  test("公开标签改动只影响草稿，更新发布后才对外生效", async () => {
    const revision = (await publicationStatus(db, owner, noteA)).revision;
    await saveNoteCopy(db, owner, {
      noteId: noteA,
      publicTags: ["产品方法", "需求分析", "实验记录"],
    });
    const draft = await publicationStatus(db, owner, noteA);
    expect(draft.revision).toBe(revision);
    expect(draft.current?.publicTags).toEqual(["产品方法", "需求分析"]);
    expect(draft.draft.publicTags).toHaveLength(3);
  });

  test("banner 与推荐置顶是两个独立开关", async () => {
    await db.notePublication.update({
      where: { noteId: noteA },
      data: { isFeatured: true, featuredOrder: 2 },
    });
    await setPublicationBanner(db, owner, noteA, true);
    const row = await db.notePublication.findUnique({
      where: { noteId: noteA },
    });
    expect(row?.isBanner).toBe(true);
    expect(row?.isFeatured).toBe(true);
    // 关掉 banner 不影响置顶
    await setPublicationBanner(db, owner, noteA, false);
    const after = await db.notePublication.findUnique({
      where: { noteId: noteA },
    });
    expect(after?.isBanner).toBe(false);
    expect(after?.isFeatured).toBe(true);
  });

  test("跨账号隔离：别人不能改我的 banner", async () => {
    await expect(setPublicationBanner(db, other, noteA, true)).rejects.toThrow(
      "笔记不存在",
    );
  });

  test("banner 位置与置顶位置各自独立", async () => {
    // noteA：置顶第 1 位、banner 第 3 位
    // noteB：置顶第 2 位、banner 第 1 位
    // 两个位置各走各的：置顶第 1 的那篇不该自动排到 banner 第 1。
    await db.notePublication.update({
      where: { noteId: noteA },
      data: {
        isFeatured: true,
        featuredOrder: 0,
        isBanner: true,
        bannerOrder: 2,
      },
    });
    await db.notePublication.update({
      where: { noteId: noteB },
      data: {
        isFeatured: true,
        featuredOrder: 1,
        isBanner: true,
        bannerOrder: 0,
      },
    });

    const banner = await bannerPosts(db, owner, 10);
    expect(banner.map((p) => p.id)).toEqual([noteB, noteA]);

    const featured = await featuredPosts(db, owner, 10);
    expect(featured.map((p) => p.id)).toEqual([noteA, noteB]);

    // 只改 banner 位置不该动到置顶位置。
    await setPublicationBanner(db, owner, noteA, true, 0);
    const row = await db.notePublication.findUnique({
      where: { noteId: noteA },
    });
    expect(row?.bannerOrder).toBe(0);
    expect(row?.featuredOrder).toBe(0);

    // 复位，别影响后面的用例。
    await db.notePublication.update({
      where: { noteId: noteA },
      data: { isFeatured: false, isBanner: false, bannerOrder: 0 },
    });
    await db.notePublication.update({
      where: { noteId: noteB },
      data: { isFeatured: false, isBanner: false, bannerOrder: 0 },
    });
  });

  test("公开标签变更计入字段级比较", async () => {
    const note = await db.notes.findUnique({
      where: { id: noteB },
      include: { publication: true },
    });
    const changes = publicationChanges({
      content: note!.content,
      type: note!.type,
      metadata: { blogPublicTags: ["X"] },
      publication: note!.publication
        ? { ...note!.publication, publicTags: [] }
        : null,
    });
    expect(changes).toContain("tags");
  });
});
