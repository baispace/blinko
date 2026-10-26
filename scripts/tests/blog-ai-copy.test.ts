import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  COPY_LIMITS,
  cleanCopyText,
  copySourceText,
  parseBlogCopy,
} from "../../server/lib/blogAiCopy";
import { publishSnapshot, publicationStatus } from "../../server/lib/publication";
import { saveNoteCopy } from "../../server/lib/blog";

describe("AI 文案解析", () => {
  test("接受纯 JSON，并按上限截断", () => {
    const copy = parseBlogCopy(
      JSON.stringify({
        title: "推荐召回的三段式改造",
        summary: "规则负责保底，向量负责覆盖，融合层负责把两边的分数放到同一个尺度上。",
        coverTitle: "召回三段式改造",
        coverSubtitle: "规则 · 向量 · 融合",
      }),
    );
    expect(copy.title).toBe("推荐召回的三段式改造");
    expect(copy.coverTitle).toBe("召回三段式改造");
    expect(copy.coverSubtitle).toBe("规则 · 向量 · 融合");
  });

  test("容忍模型裹在 JSON 外面的解释、代码块围栏和思考块", () => {
    const copy = parseBlogCopy(
      `好的，这是结果：\n\`\`\`json\n{"title":"AB 实验的五个坑","summary":"讲实验平台最容易踩的坑。","coverTitle":"AB 实验的五个坑","coverSubtitle":"分流、指标、样本量"}\n\`\`\`\n<think>先分析主题</think>`,
    );
    expect(copy.title).toBe("AB 实验的五个坑");
    expect(copy.coverSubtitle).toBe("分流、指标、样本量");
  });

  test("兼容下划线写法的字段名", () => {
    const copy = parseBlogCopy(
      '{"title":"标题","summary":"摘要","cover_title":"封面标题","cover_subtitle":"封面副标题"}',
    );
    expect(copy.coverTitle).toBe("封面标题");
    expect(copy.coverSubtitle).toBe("封面副标题");
  });

  test("去掉模型爱加的引号、强调符号和句末标点", () => {
    expect(cleanCopyText('**加粗标题**。', 40)).toBe("加粗标题");
    expect(cleanCopyText('"引号标题"', 40)).toBe("引号标题");
    expect(cleanCopyText("  多余   空白  ", 40)).toBe("多余 空白");
  });

  test("超过上限的标题与摘要被截断到上限内", () => {
    const copy = parseBlogCopy(
      JSON.stringify({
        title: "标".repeat(80),
        summary: "摘".repeat(400),
        coverTitle: "封".repeat(60),
        coverSubtitle: "副".repeat(80),
      }),
    );
    expect([...copy.title].length).toBe(COPY_LIMITS.title);
    expect([...copy.summary].length).toBe(COPY_LIMITS.summary);
    expect([...copy.coverTitle].length).toBe(COPY_LIMITS.coverTitle);
    expect([...copy.coverSubtitle].length).toBe(COPY_LIMITS.coverSubtitle);
  });

  test("模型没有给出可解析的 JSON 时直接报错", () => {
    expect(() => parseBlogCopy("我不知道该写什么")).toThrow();
    expect(() => parseBlogCopy("{ 这不是 JSON }")).toThrow();
    expect(() => parseBlogCopy('{"coverTitle":"只有封面标题"}')).toThrow();
  });

  test("正文取草稿，草稿为空才退回已发布版本", () => {
    expect(copySourceText("# 标题\n草稿正文", "已发布正文")).toContain("草稿正文");
    expect(copySourceText("", "已发布正文")).toContain("已发布正文");
  });
});

// Only run against the explicitly selected local development database.
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("AI 文案与发布快照", () => {
  const db = new PrismaClient();
  let owner: number, other: number, id: number;
  beforeAll(async () => {
    const name = "blog-ai-copy-test-" + crypto.randomUUID();
    owner = (await db.accounts.create({ data: { name } })).id;
    other = (await db.accounts.create({ data: { name: name + "-other" } })).id;
    id = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "# 实验标题\n这一篇用来验证摘要快照的正文内容，足够长以便被发布。",
          type: 1,
          metadata: {
            title: "草稿标题",
            summary: "草稿摘要：这一段会随发布冻结成公开快照。",
            expireAt: null,
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
    if (other) await db.accounts.delete({ where: { id: other } });
    await db.$disconnect();
  });

  test("摘要随发布冻结，改草稿不影响线上，重新发布才更新", async () => {
    await publishSnapshot(db, owner, { id });
    const published = await db.notePublication.findUniqueOrThrow({
      where: { noteId: id },
    });
    expect(published.title).toBe("草稿标题");
    expect(published.summary).toBe("草稿摘要：这一段会随发布冻结成公开快照。");

    // 改草稿摘要：快照不动
    await db.notes.update({
      where: { id },
      data: {
        metadata: {
          title: "草稿标题",
          summary: "改过的草稿摘要",
          expireAt: null,
        },
      },
    });
    const stillPublished = await db.notePublication.findUniqueOrThrow({
      where: { noteId: id },
    });
    expect(stillPublished.summary).toBe("草稿摘要：这一段会随发布冻结成公开快照。");
    const status = await publicationStatus(db, owner, id);
    expect(status.hasChanges).toBe(true);

    // 重新发布：快照更新
    await publishSnapshot(db, owner, { id });
    const republished = await db.notePublication.findUniqueOrThrow({
      where: { noteId: id },
    });
    expect(republished.summary).toBe("改过的草稿摘要");
  });

  test("没有摘要的文章不算有草稿改动（空列是 NULL，不是空串）", async () => {
    const plain = (
      await db.notes.create({
        data: {
          accountId: owner,
          content: "# 没有摘要的文章\n正文内容足够长，能被正常发布出去。",
          type: 1,
          metadata: { title: "没有摘要" },
        },
      })
    ).id;
    try {
      await publishSnapshot(db, owner, { id: plain });
      const status = await publicationStatus(db, owner, plain);
      expect(status.hasChanges).toBe(false);
    } finally {
      await db.notes.deleteMany({ where: { id: plain } });
    }
  });

  test("保存文案只改草稿，并保留 metadata 里的其它字段", async () => {
    await db.notes.update({
      where: { id },
      data: { metadata: { title: "旧标题", expireAt: null, keep: "别丢" } },
    });
    const saved = await saveNoteCopy(db, owner, {
      noteId: id,
      title: "AI 生成的标题",
      summary: "AI 生成的摘要",
    });
    expect(saved.title).toBe("AI 生成的标题");
    const note = await db.notes.findUniqueOrThrow({ where: { id } });
    const meta = note.metadata as any;
    expect(meta.title).toBe("AI 生成的标题");
    expect(meta.summary).toBe("AI 生成的摘要");
    expect(meta.keep).toBe("别丢");
  });

  test("别人的文章不能被写入文案", async () => {
    await expect(
      saveNoteCopy(db, other, { noteId: id, title: "越权" }),
    ).rejects.toThrow();
  });
});
