import { describe, test, expect } from "bun:test";
import { publicTopicDoc } from "../../server/lib/publicBlog";
import { updateBlogTopic } from "../../server/lib/blog";
import {
  normalizeTopicDefaultNoteId,
  TOPIC_DEFAULT_ARTICLE_AUTO,
} from "../../shared/lib/blogTopicMode";

/**
 * 文档专题的「默认打开文章」。
 *
 * 三条口径：
 * 1. 默认文章必须仍然属于当前专题、且公开可访问；
 * 2. 不指定或指定失效时，回落到编排中的第一篇公开文章（按编排顺序，不按发布时间）；
 * 3. 失效不许让专题页报错，更不许造成跳转循环 —— 永远有地方可去。
 */

type AnyDb = any;

function topicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 69,
    name: "产品思考",
    slug: "product-thinking",
    desc: "从需求到上线",
    color: "#7055ff",
    displayMode: "doc",
    defaultNoteId: null,
    cover: null,
    ...overrides,
  };
}

function memberRow(
  noteId: number,
  sectionId: number | null,
  title: string,
  publishId = `pub-${noteId}`,
) {
  return {
    noteId,
    sectionId,
    note: { id: noteId, publishId, publication: { title } },
  };
}

function docDb(
  options: {
    topic?: Record<string, unknown>;
    sections?: { id: number; name: string; desc?: string; showTitle: boolean }[];
    members?: any[];
  } = {},
) {
  return {
    accounts: { findFirst: async () => ({ id: 1 }) },
    blogTopic: { findFirst: async () => topicRow(options.topic) },
    blogTopicSection: {
      findMany: async () => options.sections ?? [],
    },
    blogTopicNote: {
      findMany: async () => options.members ?? [],
    },
  } as AnyDb;
}

describe("公开读：默认打开文章", () => {
  const members = [
    memberRow(11, 1, "章节一第一篇"),
    memberRow(12, 1, "章节一第二篇"),
    memberRow(13, 2, "章节二第一篇"),
    memberRow(14, null, "未分章节文章"),
  ];
  const sections = [
    { id: 1, name: "章节一", desc: "", showTitle: true },
    { id: 2, name: "章节二", desc: "", showTitle: true },
  ];

  test("指定了默认文章 → 就打开那一篇", async () => {
    const db = docDb({ topic: { defaultNoteId: 13 }, sections, members });
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result!.defaultPublishId).toBe("pub-13");
    // 作者确实指定过 —— 前台知道这不是兜底结果。
    expect(result!.defaultConfigured).toBe(true);
  });

  test("没指定 → 自动打开编排中的第一篇", async () => {
    const db = docDb({ sections, members });
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result!.defaultPublishId).toBe("pub-11");
    expect(result!.defaultConfigured).toBe(false);
  });

  test("指定的文章已撤回／移出专题／删除 → 回落到第一篇，不报错", async () => {
    // defaultNoteId 指向的笔记已经不在编排里（公开过滤把它筛掉了）。
    const db = docDb({
      topic: { defaultNoteId: 99 },
      sections,
      members,
    });
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result!.defaultPublishId).toBe("pub-11");
    expect(result!.defaultConfigured).toBe(false);
  });

  test("「第一篇」按编排顺序，不按发布时间：章节顺序 → 章内顺序 → 未分章节", async () => {
    // sortOrder 小的在前：编排里第一篇是 noteId=11。
    const db = docDb({
      sections,
      members: [
        memberRow(14, null, "未分章节文章"),
        memberRow(12, 1, "章节一第二篇"),
        memberRow(11, 1, "章节一第一篇"),
        memberRow(13, 2, "章节二第一篇"),
      ],
    });
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result!.defaultPublishId).toBe("pub-12");
    expect(result!.firstPublishId).toBe("pub-12");
  });

  test("一篇公开文章都没有 → 没有默认文章（前台展示概述 + 空状态）", async () => {
    const db = docDb({ topic: { defaultNoteId: 11 }, sections, members: [] });
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result!.defaultPublishId).toBeNull();
    expect(result!.total).toBe(0);
  });

  test("默认文章解析不依赖发布时间字段", async () => {
    // 目录接口只取标题与地址：正文、发布时间都不该被 select。
    let capturedSelect: any = null;
    const db: AnyDb = {
      accounts: { findFirst: async () => ({ id: 1 }) },
      blogTopic: { findFirst: async () => topicRow() },
      blogTopicSection: { findMany: async () => [] },
      blogTopicNote: {
        findMany: async (args: any) => {
          capturedSelect = args.select;
          return [];
        },
      },
    };
    await publicTopicDoc(db, { slug: "product-thinking" });
    expect(JSON.stringify(capturedSelect)).not.toContain("publishedAt");
  });
});

describe("后台保存：默认打开文章的有效性", () => {
  function updateDb(usable: boolean) {
    const captured: any = { data: null };
    return {
      db: {
        blogTopic: {
          findFirst: async () => ({ id: 69, name: "产品思考", slug: "pt" }),
          update: async (args: any) => {
            captured.data = args.data;
            return { id: 69, ...args.data };
          },
        },
        attachments: { findFirst: async () => null },
        notes: { findFirst: async () => (usable ? { id: 11 } : null) },
      } as AnyDb,
      captured,
    };
  }

  test("有效的默认文章 → 连上那一篇", async () => {
    const { db, captured } = updateDb(true);
    await updateBlogTopic(db, 1, 69, { defaultNoteId: 11 });
    expect(captured.data.defaultNote).toEqual({ connect: { id: 11 } });
  });

  test("失效的默认文章 → 退回「自动」，不抛错", async () => {
    const { db, captured } = updateDb(false);
    await updateBlogTopic(db, 1, 69, { defaultNoteId: 11 });
    expect(captured.data.defaultNote).toEqual({ disconnect: true });
  });

  test("传 null → 退回「自动」", async () => {
    const { db, captured } = updateDb(true);
    await updateBlogTopic(db, 1, 69, { defaultNoteId: null });
    expect(captured.data.defaultNote).toEqual({ disconnect: true });
  });

  test("不传 → 保持原样，不碰这一项", async () => {
    const { db, captured } = updateDb(true);
    await updateBlogTopic(db, 1, 69, { displayMode: "doc" });
    expect(captured.data.defaultNote).toBeUndefined();
  });
});

describe("共享契约：默认文章 id 的归一化", () => {
  test("非法值一律当成「没指定」", () => {
    expect(normalizeTopicDefaultNoteId(null)).toBeNull();
    expect(normalizeTopicDefaultNoteId(undefined)).toBeNull();
    expect(normalizeTopicDefaultNoteId("")).toBeNull();
    expect(normalizeTopicDefaultNoteId(0)).toBeNull();
    expect(normalizeTopicDefaultNoteId(-3)).toBeNull();
    expect(normalizeTopicDefaultNoteId(1.5)).toBeNull();
    expect(normalizeTopicDefaultNoteId("abc")).toBeNull();
  });

  test("正常 id 原样保留", () => {
    expect(normalizeTopicDefaultNoteId(11)).toBe(11);
    expect(normalizeTopicDefaultNoteId("11")).toBe(11);
  });

  test("自动选项有稳定的名字", () => {
    expect(TOPIC_DEFAULT_ARTICLE_AUTO).toBe("auto");
  });
});
