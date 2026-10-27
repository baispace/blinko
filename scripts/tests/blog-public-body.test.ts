import { describe, test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { readFileSync } from "node:fs";
import {
  PublicArticleBody,
  safeUrl,
} from "../../app/src/components/BlinkoBlog/PublicArticleBody";

const render = (content: string) =>
  renderToStaticMarkup(React.createElement(PublicArticleBody, { content }));

const blogCss = readFileSync(
  new URL("../../app/src/components/BlinkoBlog/blog.css", import.meta.url),
  "utf8",
);
const markdownCss = readFileSync(
  new URL("../../app/src/styles/github-markdown.css", import.meta.url),
  "utf8",
);

describe("公开正文链接", () => {
  test("外链原样放行", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  test("站内 /blog 路径保留成可抓取链接", () => {
    expect(safeUrl("/blog")).toBe("/blog");
    expect(safeUrl("/blog/topics")).toBe("/blog/topics");
    expect(safeUrl("/blog/abc123")).toBe("/blog/abc123");
    expect(safeUrl("/blog/t/recsys")).toBe("/blog/t/recsys");
  });

  test("协议相对地址与脚本协议一律拦掉", () => {
    expect(safeUrl("//evil.com")).toBe("");
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("JavaScript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>")).toBe("");
  });

  test("相对路径与工作区内部路径不放行", () => {
    // 正文按笔记目录语义写的相对路径，公开页上没有对应地址
    expect(safeUrl("./other-note")).toBe("");
    expect(safeUrl("other-note")).toBe("");
    expect(safeUrl("images/a.png")).toBe("");
    // 工作区内部页面（需登录）不该出现在公开正文里
    expect(safeUrl("/detail?id=1")).toBe("");
    expect(safeUrl("/dashboard")).toBe("");
  });

  test("空值安全", () => {
    expect(safeUrl(undefined)).toBe("");
    expect(safeUrl("")).toBe("");
    expect(safeUrl("   ")).toBe("");
  });
});

describe("公开正文渲染", () => {
  test("站内 /blog 链接渲染成真链接（同标签页）", () => {
    const html = render("看这篇 [召回改造](/blog/abc123) 的续篇");
    expect(html).toContain('href="/blog/abc123"');
    // 站内链接不该带 target=_blank
    expect(html).not.toContain('target="_blank"');
  });

  test("外链渲染成新标签页链接", () => {
    const html = render("参考 [文档](https://example.com/a)");
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  test("脚本协议链接不会渲染成可点击链接", () => {
    const html = render("[点我](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<span>点我</span>");
  });

  test("工作区内部路径不渲染成链接", () => {
    const html = render("[笔记](/detail?id=1)");
    expect(html).not.toContain('href="/detail');
    expect(html).toContain("<span>笔记</span>");
  });
});

/*
 * 公开正文样式隔离。
 *
 * 公开博客有自己独立的主题（.ink-blog[data-theme]），而正文复用的 .markdown-body
 * 有一批规则读的是**应用外壳**的全局 token —— 那些 token 跟着 <html class="dark"> 走。
 * 外壳暗色 + 博客亮色时，正文会拿到外壳暗色主题的值：列表项 hover 刷出一块深灰
 * （--accent = hsl(214 9% 15%)，配深色正文几乎看不清）、<hr> 分割线变成白 13% 透明
 * 在浅底上等于隐形、任务列表方框变成一个黑方块。
 *
 * 下面两组断言锁住这个隔离：token 必须映射到博客自己的色板，编辑器那套
 * 「hover 整行高亮」必须在博客作用域内被关掉。
 */
describe("公开正文样式隔离", () => {
  const shellTokens = [
    "accent", // 列表项 hover 整行背景
    "background", // 任务列表方框底色
    "secondbackground", // 表头底色 / 表格行 hover
    "foreground", // 引用块文字
    "border", // 嵌套引导线 / 方框描边
    "divider", // <hr> 分割线
    "muted-foreground", // 列表项目符号 / 有序序号
    "desc", // ::marker
  ];

  test("正文消费到的外壳 token 全部映射到博客自己的色板", () => {
    const start = blogCss.indexOf(".ink-blog .markdown-body {");
    expect(start).toBeGreaterThan(-1);
    const block = blogCss.slice(start, blogCss.indexOf("}", start));
    for (const token of shellTokens) {
      expect(block).toMatch(
        new RegExp(`--${token}:\\s*var\\(--ink-[a-z-]+\\)`),
      );
    }
  });

  test("编辑器那套列表项 hover 高亮在博客作用域内被关掉", () => {
    // 源规则还在（后台阅读态要用），所以覆盖必须由博客自己的样式表兜住
    expect(markdownCss).toContain("li:hover");
    // 博客作用域内：整行背景回到透明
    expect(blogCss).toMatch(
      /\.ink-blog \.markdown-body[^{}]*li:hover[^{}]*\{\s*background-color:\s*transparent;/,
    );
    // 覆盖必须全部带 .ink-blog 前缀 —— 后台阅读态不能被牵连
    // 先剥注释：注释里没有花括号，会被下面的规则解析当成选择器的一部分
    const cssNoComment = blogCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const scoped: string[] = [];
    for (const match of cssNoComment.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1];
      if (!selector.includes("li:hover")) continue;
      for (const part of selector.split(",")) {
        const one = part.trim();
        if (one.includes("li:hover")) scoped.push(one);
      }
    }
    expect(scoped.length).toBeGreaterThan(0);
    for (const selector of scoped) {
      expect(selector.startsWith(".ink-blog")).toBe(true);
    }
  });
});
