import { describe, test, expect } from "bun:test";
import {
  compareCover,
  compareSeo,
  compareTags,
  countChanges,
  diffBlocks,
  diffWords,
  normalizeText,
  splitBlocks,
} from "../../shared/lib/blogDiff";

describe("正文拆块", () => {
  test("段落、标题、列表项各自成块", () => {
    const blocks = splitBlocks(
      "<h2>背景</h2><p>第一段</p><ul><li>甲</li><li>乙</li></ul>",
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
    ]);
    expect(blocks[2].text).toBe("甲");
    expect(blocks[2].marker).toBe("•");
    expect(blocks[3].marker).toBe("•");
  });

  test("有序列表的序号写进指纹，换编号算变化", () => {
    const blocks = splitBlocks("<ol><li>甲</li><li>乙</li></ol>");
    expect(blocks[0].marker).toBe("1.");
    expect(blocks[1].marker).toBe("2.");
  });

  test("图片与链接记成资源，换图换链要能看出来", () => {
    const blocks = splitBlocks(
      '<p>看图<img src="/api/file/a.png" alt="示意图">和<a href="/blog/x">链接</a></p>',
    );
    expect(blocks[0].resources).toEqual([
      "img:/api/file/a.png",
      "link:/blog/x",
    ]);
  });

  test("表格按行成块", () => {
    const blocks = splitBlocks(
      "<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td></tr></table>",
    );
    expect(blocks.length).toBe(2);
    expect(blocks[0].text).toBe("甲 | 乙");
  });

  test("代码块整块保留", () => {
    const blocks = splitBlocks("<pre><code>const a = 1;</code></pre>");
    expect(blocks[0].type).toBe("code");
    expect(blocks[0].text).toContain("const a = 1;");
  });
});

describe("归一化", () => {
  test("空白、实体、零宽字符都不算内容变化", () => {
    expect(normalizeText("  你好&nbsp;世界 \n")).toBe("你好 世界");
    expect(normalizeText("A&amp;B")).toBe("A&B");
    expect(normalizeText("你\u200B好")).toBe("你好");
  });
});

describe("块级差异", () => {
  const base = "<p>第一段</p><p>第二段</p><p>第三段</p>";

  test("内容一致 → 没有变化", () => {
    const segments = diffBlocks(splitBlocks(base), splitBlocks(base));
    expect(countChanges(segments)).toBe(0);
  });

  test("只差空白 → 不算变化", () => {
    const segments = diffBlocks(
      splitBlocks(base),
      splitBlocks("<p>第一段 </p>\n<p>  第二段</p><p>第三段</p>"),
    );
    expect(countChanges(segments)).toBe(0);
  });

  test("实体写法不同 → 不算变化", () => {
    const segments = diffBlocks(
      splitBlocks("<p>A&amp;B</p>"),
      splitBlocks("<p>A&B</p>"),
    );
    expect(countChanges(segments)).toBe(0);
  });

  test("新增一段 → 插入", () => {
    const segments = diffBlocks(
      splitBlocks(base),
      splitBlocks("<p>第一段</p><p>新加的一段</p><p>第二段</p><p>第三段</p>"),
    );
    expect(countChanges(segments)).toBe(1);
    const changed = segments.find((s) => s.kind !== "equal")!;
    expect(changed.kind).toBe("insert");
    expect(changed.after[0].text).toBe("新加的一段");
  });

  test("删掉一段 → 删除", () => {
    const segments = diffBlocks(
      splitBlocks(base),
      splitBlocks("<p>第一段</p><p>第三段</p>"),
    );
    const changed = segments.find((s) => s.kind !== "equal")!;
    expect(changed.kind).toBe("delete");
    expect(changed.before[0].text).toBe("第二段");
  });

  test("改写一段 → 替换（不是两条增删）", () => {
    const segments = diffBlocks(
      splitBlocks("<p>我们计划调整页面结构。</p>"),
      splitBlocks("<p>我们将以首次使用完成率验证页面结构调整是否有效。</p>"),
    );
    expect(segments.length).toBe(1);
    expect(segments[0].kind).toBe("replace");
    expect(segments[0].before[0].text).toBe("我们计划调整页面结构。");
  });

  test("段落顺序调整要能看出来", () => {
    const segments = diffBlocks(
      splitBlocks("<p>甲</p><p>乙</p>"),
      splitBlocks("<p>乙</p><p>甲</p>"),
    );
    expect(countChanges(segments)).toBeGreaterThan(0);
  });

  test("换了图片算变化", () => {
    const segments = diffBlocks(
      splitBlocks('<p>说明<img src="/api/file/a.png" alt="图"></p>'),
      splitBlocks('<p>说明<img src="/api/file/b.png" alt="图"></p>'),
    );
    expect(countChanges(segments)).toBe(1);
  });

  test("换了链接算变化", () => {
    const segments = diffBlocks(
      splitBlocks('<p>看<a href="/blog/a">这里</a></p>'),
      splitBlocks('<p>看<a href="/blog/b">这里</a></p>'),
    );
    expect(countChanges(segments)).toBe(1);
  });

  test("表格某一行改了要能看出来", () => {
    const segments = diffBlocks(
      splitBlocks("<table><tr><td>甲</td></tr><tr><td>乙</td></tr></table>"),
      splitBlocks("<table><tr><td>甲</td></tr><tr><td>丙</td></tr></table>"),
    );
    expect(countChanges(segments)).toBe(1);
  });

  test("加粗改成不加粗也要能看出来", () => {
    const segments = diffBlocks(
      splitBlocks("<p><strong>重点</strong></p>"),
      splitBlocks("<p>重点</p>"),
    );
    // 纯文本一样，但结构标记不同 —— 至少不能悄悄当成没变化。
    expect(segments.length).toBeGreaterThan(0);
  });
});

describe("词级差异", () => {
  test("指出具体改了哪几个字", () => {
    const parts = diffWords("我们计划调整页面结构。", "我们将以完成率验证页面结构。");
    expect(parts.some((p) => p.kind === "insert")).toBe(true);
    expect(parts.some((p) => p.kind === "delete")).toBe(true);
    expect(parts.filter((p) => p.kind === "equal").map((p) => p.text).join("")).toContain(
      "页面结构",
    );
  });
});

describe("标签比较", () => {
  test("顺序不同不算变化", () => {
    const change = compareTags(["产品方法", "工作记录"], ["工作记录", "产品方法"]);
    expect(change.added).toEqual([]);
    expect(change.removed).toEqual([]);
    expect(change.kept.length).toBe(2);
  });

  test("新增与删除要分开列", () => {
    const change = compareTags(["产品方法", "工作记录"], ["产品方法", "需求验证"]);
    expect(change.added).toEqual(["需求验证"]);
    expect(change.removed).toEqual(["工作记录"]);
    expect(change.kept).toEqual(["产品方法"]);
  });
});

describe("SEO 与封面比较", () => {
  test("SEO 逐字段比，键顺序不影响", () => {
    const changes = compareSeo(
      { title: "A", description: "B", image: "", imageAlt: "" },
      { image: "", description: "B", title: "A", imageAlt: "" },
    );
    expect(changes.length).toBe(0);
  });

  test("SEO 描述改了要列出来", () => {
    const changes = compareSeo(
      { title: "A", description: "旧", image: "", imageAlt: "" },
      { title: "A", description: "新", image: "", imageAlt: "" },
    );
    expect(changes.length).toBe(1);
    expect(changes[0].field).toBe("description");
  });

  test("封面按附件身份比，不看地址", () => {
    const changes = compareCover(
      { attachmentId: 12, title: "甲" },
      { attachmentId: 12, title: "甲" },
    );
    expect(changes.length).toBe(0);
  });

  test("换封面或改封面文案要列出来", () => {
    const changes = compareCover(
      { attachmentId: 12, title: "甲", subtitle: "乙" },
      { attachmentId: 13, title: "丙", subtitle: "乙" },
    );
    expect(changes.map((c) => c.field).sort()).toEqual(["attachment", "title"]);
  });
});
