import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { blogSkeleton, blogPageKind } from "../../server/lib/publicBlogSEO";

/**
 * 服务端首屏与前端接管后的版式必须是一套。
 *
 * 服务端先渲染骨架，前端接管时整块换掉 —— 两版的盒子位置不一样，
 * 读者就会看到一次跳变（标题换位、卡片重排）。
 *
 * 这条测试盯住「骨架用的类名 = 客户端真的在用的类名」：
 * 客户端改了版式而骨架没跟上（或反过来），这里立刻红。
 */
const root = path.resolve(import.meta.dir, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const clientHome = read("app/src/pages/blog/index.tsx");
const clientArticle = read("app/src/pages/blog/[id].tsx");
const clientTopic = read("app/src/pages/blog/t/[slug].tsx");

describe("服务端首屏与前端版式一致", () => {
  test("首页骨架用真实首页的栅格类名", () => {
    const html = blogSkeleton("home");
    for (const cls of [
      "ink-home-page",
      "ink-home-grid",
      "ink-home-hero",
      "ink-home-list",
      "ink-card-grid",
      "ink-aside",
    ]) {
      expect(html).toContain(cls);
      expect(clientHome).toContain(cls);
    }
  });

  test("文章页骨架用真实文章页的类名", () => {
    const html = blogSkeleton("article");
    for (const cls of [
      "ink-article-page",
      "ink-article-hero-full",
      "ink-article-hero",
      "ink-reading",
      "ink-panel",
      "ink-reading-aside",
    ]) {
      expect(html).toContain(cls);
      expect(clientArticle).toContain(cls);
    }
  });

  test("专题页骨架用真实专题页的类名", () => {
    const html = blogSkeleton("topic");
    for (const cls of ["ink-topic-page", "ink-topic-intro", "ink-topic-directory"]) {
      expect(html).toContain(cls);
      expect(clientTopic).toContain(cls);
    }
  });

  test("按公开路径判断该给哪种骨架", () => {
    expect(blogPageKind("/blog")).toBe("home");
    expect(blogPageKind("/blog/")).toBe("home");
    expect(blogPageKind("/article/abc12345")).toBe("article");
    expect(blogPageKind("/topic/product")).toBe("topic");
    expect(blogPageKind("/t/product")).toBe("topic");
  });
});

describe("公开页统一的加载 / 空 / 错误三态", () => {
  const pages = [
    "app/src/pages/blog/index.tsx",
    "app/src/pages/blog/topics.tsx",
    "app/src/pages/blog/about.tsx",
    "app/src/pages/blog/moments.tsx",
    "app/src/pages/blog/stats.tsx",
    "app/src/pages/blog/[id].tsx",
    "app/src/pages/blog/t/[slug].tsx",
  ];
  test("每个公开页都走同一套三态组件", () => {
    for (const file of pages) {
      const source = read(file);
      expect(source).toContain("PageState");
      expect(/PageLoading|PageEmpty|PageError/.test(source)).toBe(true);
    }
  });
  test("三态组件自带样式，且页面不再各写一套", () => {
    const source = read("app/src/components/BlinkoBlog/public/PageState.tsx");
    expect(source).toContain("page-state.css");
    expect(source).toContain("role=\"status\"");
    expect(source).toContain("role=\"alert\"");
    // 出错必须能重试：没有 onRetry 的错误提示只给一句人话。
    expect(source).toContain("onRetry");
  });
});
