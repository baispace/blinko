import { describe, test, expect } from "bun:test";
import {
  DEFAULT_TOPIC_DISPLAY_MODE,
  TOPIC_DISPLAY_MODES,
  isDocTopicMode,
  normalizeTopicDisplayMode,
} from "../../shared/lib/blogTopicMode";
import {
  buildArticleHeadings,
  headingNumbers,
  headingSlug,
} from "../../app/src/components/BlinkoBlog/public/articleHeadings";

describe("专题展示方式", () => {
  test("默认值是专题模式", () => {
    expect(DEFAULT_TOPIC_DISPLAY_MODE).toBe("topic");
    expect(TOPIC_DISPLAY_MODES).toEqual(["topic", "doc"]);
  });

  test("只认 doc，其余一律退回专题模式", () => {
    expect(normalizeTopicDisplayMode("doc")).toBe("doc");
    expect(isDocTopicMode("doc")).toBe(true);
    // 老数据、老接口、脏值都不能把专题页弄挂。
    for (const value of [
      undefined,
      null,
      "",
      "topic",
      "TOPIC",
      "Doc",
      "document",
      0,
      1,
      {},
      [],
    ]) {
      expect(normalizeTopicDisplayMode(value)).toBe("topic");
      expect(isDocTopicMode(value)).toBe(false);
    }
  });
});

describe("正文标题锚点", () => {
  test("中文标题保留原样，英文转小写短横线", () => {
    expect(headingSlug("先明确这次任务要交付什么")).toBe(
      "先明确这次任务要交付什么",
    );
    expect(headingSlug("Hello World")).toBe("hello-world");
    expect(headingSlug("  多  空格  ")).toBe("多-空格");
  });

  test("标点被去掉，空标题有兜底", () => {
    expect(headingSlug("A，B。C！")).toBe("abc");
    expect(headingSlug("!!!")).toBe("section");
    expect(headingSlug("   ")).toBe("section");
  });

  test("正文里的重复标题各自唯一，且写回 DOM", () => {
    // 最小 DOM 替身：只需要 tagName / textContent / id 与 querySelectorAll。
    const nodes = [
      { tagName: "H2", textContent: "重复标题", id: "" },
      { tagName: "H2", textContent: "重复标题", id: "" },
      { tagName: "H3", textContent: "重复标题", id: "" },
      { tagName: "H2", textContent: "  ", id: "" },
      { tagName: "H4", textContent: "小结", id: "" },
    ];
    const root = {
      querySelectorAll: () => nodes,
    } as unknown as HTMLElement;
    const list = buildArticleHeadings(root);
    // 空标题被跳过。
    expect(list.length).toBe(4);
    // 同一篇文章里 id 不重复。
    expect(new Set(list.map((h) => h.id)).size).toBe(list.length);
    expect(list.map((h) => h.id)).toEqual([
      "重复标题",
      "重复标题-2",
      "重复标题-3",
      "小结",
    ]);
    // 锚点写回了 DOM，跳转和目录用的是同一个 id。
    expect(nodes[0].id).toBe("重复标题");
    expect(nodes[1].id).toBe("重复标题-2");
    expect(nodes[2].id).toBe("重复标题-3");
    expect(nodes[4].id).toBe("小结");
    // 级别原样保留。
    expect(list.map((h) => h.level)).toEqual([2, 2, 3, 4]);
  });

  test("目录序号按级别各自计数，缩进跟着级别走", () => {
    const items = headingNumbers([
      { id: "a", text: "A", level: 2 },
      { id: "b", text: "B", level: 3 },
      { id: "c", text: "C", level: 3 },
      { id: "d", text: "D", level: 2 },
      { id: "e", text: "E", level: 4 },
    ]);
    expect(items.map((i) => i.number)).toEqual(["01", "01", "02", "02", "01"]);
    // h2 最浅，h3 / h4 依次缩进。
    expect(items.map((i) => i.depth)).toEqual([0, 1, 1, 0, 2]);
  });
});
