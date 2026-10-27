import { describe, test, expect } from "bun:test";
import { publicTopicDoc, publicArticle } from "../../server/lib/publicBlog";
import { publicPublicationWhere } from "../../server/lib/publication";

/**
 * 文档模式的公开读。
 *
 * 这里只测「公开边界」：目录里不能出现私有、未发布、撤回、删除的内容，
 * 以及「有没有专题上下文」这件事不能被猜出来。
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

describe("公开读：文档模式目录", () => {
  test("目录查询带上公开过滤：私有/未发布/撤回/删除一律不进目录", async () => {
    let capturedWhere: any = null;
    const db: AnyDb = {
      accounts: { findFirst: async () => ({ id: 1 }) },
      blogTopic: { findFirst: async () => topicRow() },
      blogTopicSection: { findMany: async () => [] },
      blogTopicNote: {
        findMany: async (args: any) => {
          capturedWhere = args.where;
          return [];
        },
      },
    };
    await publicTopicDoc(db, { slug: "product-thinking" });
    expect(capturedWhere).toBeTruthy();
    expect(capturedWhere.note).toEqual(publicPublicationWhere);
    // 只查这一个专题，不越界到别的专题的成员。
    expect(capturedWhere.topicId).toBe(69);
  });

  test("没有文章的章节不返回，编排顺序原样保留", async () => {
    const db: AnyDb = {
      accounts: { findFirst: async () => ({ id: 1 }) },
      blogTopic: { findFirst: async () => topicRow() },
      blogTopicSection: {
        findMany: async () => [
          { id: 1, name: "有文章", desc: "", showTitle: true },
          { id: 2, name: "空章节", desc: "", showTitle: true },
          { id: 3, name: "隐藏标题", desc: "", showTitle: false },
        ],
      },
      blogTopicNote: {
        findMany: async () => [
          memberRow(1, 1, "第一篇"),
          memberRow(2, 3, "第二篇"),
          memberRow(3, null, "未分章节"),
        ],
      },
    };
    const result = await publicTopicDoc(db, { slug: "product-thinking" });
    expect(result).toBeTruthy();
    // 空章节被过滤，隐藏标题的章节保留（文章一篇都不能少）。
    expect(result!.sections.map((s) => s.id)).toEqual([1, 3]);
    expect(result!.sections[0].posts.map((p) => p.title)).toEqual(["第一篇"]);
    expect(result!.sections[1].showTitle).toBe(false);
    expect(result!.unassigned.posts.map((p) => p.title)).toEqual(["未分章节"]);
    // 篇数：章节 + 未分章节，一篇只算一次。
    expect(result!.total).toBe(3);
    expect(result!.sectionCount).toBe(2);
    // 「开始阅读」= 编排中的第一篇。
    expect(result!.firstPublishId).toBe("pub-1");
    // 展示方式归一化。
    expect(result!.topic.displayMode).toBe("doc");
  });

  test("专题不存在或未公开时返回 null", async () => {
    const db: AnyDb = {
      accounts: { findFirst: async () => ({ id: 1 }) },
      blogTopic: { findFirst: async () => null },
      blogTopicSection: { findMany: async () => [] },
      blogTopicNote: { findMany: async () => [] },
    };
    expect(await publicTopicDoc(db, { slug: "nope" })).toBeNull();
  });

  test("目录不带正文 —— 只回标题与地址", async () => {
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
    expect(capturedSelect.note.select).toEqual({
      id: true,
      publishId: true,
      publication: { select: { title: true } },
    });
    // 正文根本没有被 select。
    expect(JSON.stringify(capturedSelect)).not.toContain('"content"');
  });
});

describe("公开读：文章页的专题上下文", () => {
  const noteRow = (topicMode: string, slug = "product-thinking") => ({
    id: 100,
    publishId: "pub-100",
    isPublished: true,
    isRecycle: false,
    publication: {
      title: "一篇文章",
      content: "<p>正文</p>",
      type: 0,
      revision: 1,
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
      summary: "摘要",
      publicTags: [],
      isFeatured: false,
      coverFocus: null,
      coverConfig: null,
      coverAttachment: null,
    },
    blogTopics: [
      {
        topic: {
          id: 69,
          name: "产品思考",
          slug,
          color: "#7055ff",
          displayMode: topicMode,
        },
      },
    ],
  });

  function articleDb(topicMode: string, slug = "product-thinking") {
    return {
      accounts: { findFirst: async () => ({ id: 1 }) },
      notes: { findFirst: async () => noteRow(topicMode, slug), findMany: async () => [] },
      blogTopicNote: { findUnique: async () => null, findFirst: async () => null },
      blogPostStat: { findUnique: async () => null, findMany: async () => [] },
    } as AnyDb;
  }

  test("带着专题上下文进来、且专题是文档模式 → 用文档版式", async () => {
    const db = articleDb("doc");
    const result = await publicArticle(db, {
      publishId: "pub-100",
      topicSlug: "product-thinking",
    });
    expect(result!.topicMode).toBe("doc");
    expect(result!.primaryTopic?.slug).toBe("product-thinking");
  });

  test("专题是专题模式 → 不用文档版式", async () => {
    const db = articleDb("topic");
    const result = await publicArticle(db, {
      publishId: "pub-100",
      topicSlug: "product-thinking",
    });
    expect(result!.topicMode).toBeNull();
  });

  test("没有专题上下文（从全站列表进来）→ 不硬套某个专题", async () => {
    const db = articleDb("doc");
    const result = await publicArticle(db, { publishId: "pub-100" });
    expect(result!.topicMode).toBeNull();
  });

  test("URL 里的专题与文章实际所属的专题对不上 → 不套文档版式", async () => {
    const db = articleDb("doc");
    const result = await publicArticle(db, {
      publishId: "pub-100",
      topicSlug: "another-topic",
    });
    expect(result!.topicMode).toBeNull();
  });

  test("脏值不会让文章页挂掉", async () => {
    const db = articleDb("whatever");
    const result = await publicArticle(db, {
      publishId: "pub-100",
      topicSlug: "product-thinking",
    });
    expect(result!.topicMode).toBeNull();
  });
});
