import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  emptyAiCopyCandidates,
  mergeAiCopyCandidates,
  normalizeAiCopyCandidates,
  persistAiCopy,
  readAiCopyState,
} from "../../server/lib/blogAiCandidates";
import { saveNoteCopy } from "../../server/lib/blog";
import { publishSnapshot } from "../../server/lib/publication";
import { contentVersion } from "../../shared/lib/blogPublication";

/**
 * AI 整理候选：合并规则与持久化。
 *
 * 真库部分按仓库约定用 RUN_PUBLISH_DB_TESTS=1 打开。
 */
const dbSuite = process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;

describe("AI 整理候选：合并规则", () => {
  test("空值与脏数据一律当作没生成过", () => {
    expect(normalizeAiCopyCandidates(null)).toBeNull();
    expect(normalizeAiCopyCandidates("x")).toBeNull();
    expect(normalizeAiCopyCandidates([])).toBeNull();
    expect(normalizeAiCopyCandidates({ title: "标题" })).toBeNull();
  });

  test("能读回字段、生成时刻与正文版本", () => {
    const state = normalizeAiCopyCandidates({
      title: "标题",
      summary: "概要",
      coverTitle: "短标题",
      coverSubtitle: "副标题",
      publicTags: ["AI", "性能"],
      topicSuggestions: [{ topic: "后端", section: "数据库" }],
      issues: ["模型没有给出公开标签。"],
      fields: {
        title: { at: "2026-10-23T10:00:00.000Z", version: "v1" },
      },
      generatedAt: "2026-10-23T10:00:00.000Z",
    });
    expect(state).not.toBeNull();
    expect(state!.title).toBe("标题");
    expect(state!.fields.title).toEqual({
      at: "2026-10-23T10:00:00.000Z",
      version: "v1",
    });
    expect(state!.fields.summary).toBeUndefined();
    expect(state!.topicSuggestions).toEqual([{ topic: "后端", section: "数据库" }]);
    expect(state!.issues).toEqual(["模型没有给出公开标签。"]);
  });

  test("首次生成把字段和版本记下来", () => {
    const next = mergeAiCopyCandidates(null, {
      fields: ["title"],
      title: "  一篇文章的标题  ",
      version: "v1",
      at: "2026-10-23T10:00:00.000Z",
    });
    expect(next.title).toBe("一篇文章的标题");
    expect(next.fields.title?.version).toBe("v1");
    expect(next.fields.summary).toBeUndefined();
  });

  test("这次没产出就不覆盖上一版候选，也不算生成过", () => {
    const first = mergeAiCopyCandidates(null, {
      fields: ["title"],
      title: "第一版标题",
      version: "v1",
    });
    const second = mergeAiCopyCandidates(first, {
      fields: ["title"],
      title: "",
      version: "v2",
      issues: ["模型没有给出公开标题。"],
    });
    expect(second.title).toBe("第一版标题");
    expect(second.fields.title?.version).toBe("v1");
    expect(second.issues).toEqual(["模型没有给出公开标题。"]);
  });

  test("封面文案主副一起覆盖：副标题空串也算答案", () => {
    const first = mergeAiCopyCandidates(null, {
      fields: ["cover"],
      coverTitle: "旧短标题",
      coverSubtitle: "旧副标题",
      version: "v1",
    });
    const second = mergeAiCopyCandidates(first, {
      fields: ["cover"],
      coverTitle: "新短标题",
      coverSubtitle: "",
      version: "v2",
    });
    expect(second.coverTitle).toBe("新短标题");
    expect(second.coverSubtitle).toBe("");
    expect(second.fields.cover?.version).toBe("v2");
  });

  test("公开标签没给就不动旧的；归属建议每次都按这次的结果走", () => {
    const first = mergeAiCopyCandidates(null, {
      fields: ["tags", "topics"],
      publicTags: ["性能"],
      topicSuggestions: [{ topic: "后端", section: "" }],
      version: "v1",
    });
    const second = mergeAiCopyCandidates(first, {
      fields: ["tags", "topics"],
      publicTags: [],
      topicSuggestions: [],
      version: "v2",
    });
    expect(second.publicTags).toEqual(["性能"]);
    expect(second.topicSuggestions).toEqual([]);
    // 标签这次没产出 → 不算重新生成过；归属建议算是。
    expect(second.fields.tags?.version).toBe("v1");
    expect(second.fields.topics?.version).toBe("v2");
  });

  test("空候选对象本身就是干净的起点", () => {
    const base = emptyAiCopyCandidates();
    expect(base.fields).toEqual({});
    expect(base.publicTags).toEqual([]);
  });
});

dbSuite("AI 整理候选：落库与过期判断", () => {
  const db = new PrismaClient();
  let owner = 0;
  let noteId = 0;

  beforeAll(async () => {
    owner = (
      await db.accounts.create({ data: { name: "ai-copy-" + crypto.randomUUID() } })
    ).id;
    noteId = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "<h2>候选测试</h2><p>这是一段足够长的正文，用来生成标题与概要。</p>",
          type: 1,
          metadata: { title: "候选测试" },
        },
      })
    ).id;
    await publishSnapshot(db, owner, { id: noteId });
  });

  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.accounts.deleteMany({ where: { id: owner } });
    }
    await db.$disconnect();
  });

  test("生成结果存进公开侧那张表，刷新后还在", async () => {
    const saved = await persistAiCopy(db, owner, noteId, {
      fields: ["title", "summary"],
      title: "候选标题",
      summary: "候选概要",
      version: "v1",
    });
    expect(saved?.fields.title?.version).toBe("v1");

    const row = await db.notePublication.findUniqueOrThrow({
      where: { noteId },
      select: { aiCopy: true },
    });
    expect((row.aiCopy as any).title).toBe("候选标题");

    const state = await readAiCopyState(db, owner, noteId);
    expect(state.candidates?.title).toBe("候选标题");
    expect(state.candidates?.summary).toBe("候选概要");
  });

  test("正文变了：这一项就过期了", async () => {
    const before = await readAiCopyState(db, owner, noteId);
    const version = before.contentVersion;
    await persistAiCopy(db, owner, noteId, {
      fields: ["title"],
      title: "按当前正文生成的标题",
      version,
    });
    const fresh = await readAiCopyState(db, owner, noteId);
    expect(fresh.candidates?.fields.title?.version).toBe(version);

    await db.notes.update({
      where: { id: noteId },
      data: { content: "<h2>候选测试</h2><p>正文被改过了，长度仍然足够。</p>" },
    });
    const after = await readAiCopyState(db, owner, noteId);
    expect(after.contentVersion).not.toBe(version);
    // 候选还在，但版本对不上 —— 界面据此提示「正文已变」。
    expect(after.candidates?.fields.title?.version).toBe(version);
  });

  test("分叉草稿下应用候选不会再误报「正文已变化」", async () => {
    const draftBody = "<h2>分叉正文</h2><p>这是发布草稿里的正文，和原笔记已经不是一份了。</p>";
    await db.notes.update({
      where: { id: noteId },
      data: {
        metadata: {
          title: "候选测试",
          blogDraftBody: { content: draftBody, sourceVersion: "x", importedAt: "2026-10-23T10:00:00.000Z" },
        },
      },
    });
    const state = await readAiCopyState(db, owner, noteId);
    const version = state.contentVersion;
    // 原笔记正文与草稿正文不同，两者算出的指纹必然不一样 ——
    // 候选要按「将要发布的正文」那份来校验。
    expect(version).toBe(contentVersion(draftBody, 1));
    const saved = await saveNoteCopy(db, owner, {
      noteId,
      title: "分叉后写下的标题",
      expectedContentVersion: version,
    });
    expect(saved.title).toBe("分叉后写下的标题");
  });
});
