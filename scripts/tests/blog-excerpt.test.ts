import { describe, test, expect } from "bun:test";
import { clipAtSentence, publicExcerpt } from "../../server/lib/publicText";

/**
 * 公开摘要的长度纪律。
 *
 * 摘要出现在卡片、首页横幅、RSS、SEO 描述和后台列表行里 ——
 * 一旦没有上限，两千字的作者手写摘要会把后台表格整列撑开，
 * 操作列被推到屏幕外，作者得横着拖才能点「发布」。
 */
describe("公开摘要的长度纪律", () => {
  test("作者写的摘要同样要守长度上限", () => {
    const long = "这是一段很长的作者手写摘要。".repeat(60);
    const excerpt = publicExcerpt("正文", long, 120);
    expect([...excerpt].length).toBeLessThanOrEqual(120);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  test("摘要在句子边界断开，不切在半句上", () => {
    const excerpt = publicExcerpt(
      "正文",
      "第一句话说清了背景。第二句给出了做法。第三句说清结论，第四句还没说完就被切断了，后面还有更多",
      40,
    );
    expect([...excerpt].length).toBeLessThanOrEqual(40);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("第三句");
  });

  test("长度够时原样保留，不加省略号", () => {
    const excerpt = publicExcerpt("正文", "短短一句概要。", 120);
    expect(excerpt).toBe("短短一句概要。");
  });

  test("没有摘要时从正文取一段，并跳过开头的标题行", () => {
    const excerpt = publicExcerpt("# 文章标题\n\n这是正文的第一段，讲清楚了要做什么。");
    expect(excerpt).toBe("这是正文的第一段，讲清楚了要做什么。");
  });

  test("正文超长时也在句子边界断开", () => {
    const excerpt = publicExcerpt(
      "第一句话讲清了背景与问题。第二句话给出了做法与取舍。第三句话说明结论。",
      "",
      30,
    );
    expect([...excerpt].length).toBeLessThanOrEqual(30);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).not.toContain("第三句");
  });

  test("clipAtSentence：没有标点时硬切也不超过上限", () => {
    const clipped = clipAtSentence("摘".repeat(400), 200);
    expect([...clipped].length).toBe(200);
    expect(clipped.endsWith("…")).toBe(true);
  });

  test("clipAtSentence：句子边界太靠前时退到逗号", () => {
    // 前 30% 就有句号，后面才是长句 —— 直接在句号断开太短，退到逗号。
    const clipped = clipAtSentence(
      "短句。后面是很长很长的一句话没有标点也没有断点只能硬切了还需要再长一些才够长才能触发截断",
      40,
    );
    expect([...clipped].length).toBeLessThanOrEqual(40);
    expect(clipped.endsWith("…")).toBe(true);
  });
});
