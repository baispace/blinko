import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 文档模式左侧目录的排版约定。
 *
 * 这些是「看效果才知道对不对」的地方，所以把几条约定钉成源码级测试：
 *   ① 条目是「标记栏 + 文字栏」两列，圆点与引导线在标记栏里，不压文字；
 *   ② 选中态只换颜色：不加边框、不改内边距、不改字号，也不换字重；
 *   ③ 选中态不再叠一条抢眼的粗竖线；
 *   ④ 章节行是「序号 / 名称 / 篇数 / 折叠箭头」四列对齐；
 *   ⑤ 专题概述是一个独立且稳定的地址（?view=overview）。
 */

const root = join(import.meta.dir, "../../");
const sidebarSrc = readFileSync(
  join(root, "app/src/components/BlinkoBlog/public/TopicDocSidebar.tsx"),
  "utf8",
);
const docCss = readFileSync(
  join(root, "app/src/components/BlinkoBlog/public/doc-layout.css"),
  "utf8",
);
const topicPageSrc = readFileSync(
  join(root, "app/src/pages/blog/t/[slug].tsx"),
  "utf8",
);

/** 取一段 CSS 规则（按选择器切开）。 */
function rule(selector: string) {
  const index = docCss.indexOf(selector);
  if (index < 0) return "";
  const start = docCss.indexOf("{", index);
  let depth = 0;
  for (let i = start; i < docCss.length; i++) {
    if (docCss[i] === "{") depth++;
    else if (docCss[i] === "}") {
      depth--;
      if (depth === 0) return docCss.slice(start + 1, i);
    }
  }
  return "";
}

describe("文档目录：标记栏与文字栏", () => {
  test("条目拆成标记栏 + 文字栏两列", () => {
    expect(sidebarSrc).toContain("ink-doc-nav-marker");
    expect(sidebarSrc).toContain("ink-doc-nav-text");
    const link = rule(".ink-doc-nav .ink-doc-nav-link {");
    expect(link).toContain("display: grid");
    // 文字栏起点由统一变量给出：章节名与文章标题共用同一条竖线。
    expect(link).toContain("var(--doc-nav-text-x)");
    expect(docCss).toContain("--doc-nav-text-x");
  });

  test("圆点与引导线都画在标记栏里，不压到文字上", () => {
    const marker = rule(".ink-doc-nav .ink-doc-nav-marker {");
    expect(marker).toContain("position: relative");
    expect(docCss).toContain(".ink-doc-nav .ink-doc-nav-marker::before");
    expect(docCss).toContain(".ink-doc-nav .ink-doc-nav-marker::after");
    // 标记栏里的伪元素不再直接挂在链接上 —— 挂在链接上的话，
    // 选中态一改位置就会压到文字。
    const link = rule(".ink-doc-nav .ink-doc-nav-link {");
    expect(link).not.toContain("::before");
    expect(link).not.toContain("::after");
  });

  test("行高与上下内边距统一，条目高度随文字增长", () => {
    expect(docCss).toContain("--doc-nav-pad-y");
    expect(docCss).toContain("--doc-nav-line");
    const text = rule(".ink-doc-nav .ink-doc-nav-text {");
    expect(text).toContain("padding: var(--doc-nav-pad-y)");
    // 文字用 overflow-wrap 自然换行：第二行与第一行同起点。
    expect(text).toContain("overflow-wrap: anywhere");
  });
});

describe("文档目录：选中态", () => {
  test("选中只换颜色，不动尺寸", () => {
    const active = rule('.ink-doc-nav .ink-doc-nav-link[data-active] {');
    expect(active).toContain("color: var(--doc-accent)");
    expect(active).toContain("background: color-mix");
    // 不加边框、不改内边距、不改字号、不换字重。
    expect(active).not.toContain("border");
    expect(active).not.toContain("padding");
    expect(active).not.toContain("font-size");
    expect(active).not.toContain("font-weight");
  });

  test("所有条目字重一致：选中不会因为变粗而换行", () => {
    const link = rule(".ink-doc-nav .ink-doc-nav-link {");
    expect(link).toContain("font-weight: 500");
    const active = rule('.ink-doc-nav .ink-doc-nav-link[data-active] {');
    expect(active).not.toContain("font-weight");
  });

  test("不再叠加粗竖线", () => {
    expect(docCss).not.toContain("left: 7px");
    expect(docCss).not.toContain("width: 2px");
    // 选中态只把圆点染成强调色。
    const dot = rule(
      ".ink-doc-nav .ink-doc-nav-link[data-active] .ink-doc-nav-marker::after {",
    );
    expect(dot).toContain("background: var(--doc-accent)");
  });

  test("当前文章所在章节适度强调，但整组不高亮", () => {
    expect(sidebarSrc).toContain("data-current");
    const section = rule(".ink-doc-nav-section[data-current] .ink-doc-nav-section-name {");
    expect(section).toContain("color: var(--doc-accent)");
    // 只有章节名被强调，序号与篇数不动。
    expect(section).not.toContain("font-weight");
  });
});

describe("文档目录：章节行对齐", () => {
  test("序号 / 名称 / 篇数 / 折叠箭头各占一列", () => {
    const section = rule(".ink-doc-nav-section {");
    expect(section).toContain("display: grid");
    expect(section).toContain("grid-template-columns");
    expect(section).toContain("align-items: center");
    expect(docCss).toContain(".ink-doc-nav-section-count {");
    expect(docCss).toContain(".ink-doc-nav-caret {");
  });
});

describe("文档专题：默认打开文章", () => {
  test("专题概述有独立且稳定的地址", () => {
    expect(sidebarSrc).toContain("?view=overview");
    expect(topicPageSrc).toContain('params.get("view") === "overview"');
  });

  test("专题页按优先级解析默认文章，并用 replace 跳转", () => {
    expect(topicPageSrc).toContain("defaultPublishId");
    expect(topicPageSrc).toContain("{ replace: true }");
    // 解析期间摆骨架，不闪专题概述。
    expect(topicPageSrc).toContain("DocTopicSkeleton");
  });

  test("没有默认文章配置时也有兜底：服务端已算好第一篇", () => {
    expect(sidebarSrc).toContain("defaultPublishId");
    expect(sidebarSrc).toContain("defaultConfigured");
  });
});
