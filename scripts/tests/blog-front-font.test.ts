import { describe, expect, test } from "bun:test";
import {
  BLOG_FONT_FALLBACK,
  blogFontFamily,
  blogFontStack,
} from "../../shared/lib/blogFont";
import { blogSiteSettingsSchema } from "../../shared/lib/blogSiteSettings";
import { injectBlogSEO, renderBlogHead } from "../../server/lib/publicBlogSEO";

/**
 * 公开博客前台的字体。
 *
 * 站点设置里选一个字体名，服务端把 @font-face 样式表和字体栈一起注入 head ——
 * 访客第一次打开就用上，不用等前端脚本跑完再换字体。
 */

const baseSeo = (over: Record<string, unknown> = {}) =>
  ({
    status: 200,
    title: "思考与实践",
    description: "简介",
    canonical: "https://example.com/blog",
    image: "https://example.com/avatar.png",
    imageAlt: "作者",
    type: "website",
    robots: "index, follow",
    siteName: "Ink",
    structured: {},
    text: "正文",
    links: [],
    runtime: {
      basePath: "/blog",
      apiOrigin: "",
      publicOrigin: "https://example.com",
      deploymentMode: "proxy",
    },
    ...over,
  }) as any;

describe("前台字体：字体栈", () => {
  test("字体名带空格要加引号，否则 CSS 会断", () => {
    expect(blogFontFamily("Noto Serif SC")).toBe('"Noto Serif SC"');
    expect(blogFontFamily("Inter")).toBe("Inter");
    expect(blogFontFamily("")).toBe("");
    expect(blogFontFamily(null)).toBe("");
  });

  test("字体名里的引号与反斜杠不能逃出去", () => {
    // 去掉危险字符后整体加引号 —— 引号本身不会把 CSS 解析带偏。
    expect(blogFontFamily('Ev"il')).toBe('"Evil"');
    expect(blogFontFamily("Ev\\il")).toBe('"Evil"');
  });

  test("没选字体时就是系统字体栈", () => {
    expect(blogFontStack("")).toBe(BLOG_FONT_FALLBACK);
    expect(blogFontStack(null)).toBe(BLOG_FONT_FALLBACK);
    expect(blogFontStack("LXGW WenKai")).toBe(
      `"LXGW WenKai", ${BLOG_FONT_FALLBACK}`,
    );
  });
});

describe("前台字体：站点设置", () => {
  test("默认不带字体 —— 不选就不加载任何东西", () => {
    expect(blogSiteSettingsSchema.parse({}).fontFamily).toBe("");
  });

  test("字体名超长会被挡下来", () => {
    const parsed = blogSiteSettingsSchema.safeParse({ fontFamily: "x".repeat(200) });
    expect(parsed.success).toBe(false);
  });
});

describe("前台字体：公开页注入", () => {
  const font = {
    name: "LXGW WenKai",
    stack: `"LXGW WenKai", ${BLOG_FONT_FALLBACK}`,
    stylesheet: "/font-assets/lxgw-wenkai/1.7.0/style-v2.css",
  };

  test("选了字体就注入样式表和字体栈变量", () => {
    const head = renderBlogHead(baseSeo({ font }), "https://example.com");
    expect(head).toContain(
      '<link data-ink-blog-font rel="stylesheet" href="/font-assets/lxgw-wenkai/1.7.0/style-v2.css">',
    );
    expect(head).toContain(`--ink-blog-font:"LXGW WenKai"`);
  });

  test("没选字体就不注入任何字体样式", () => {
    const head = renderBlogHead(baseSeo(), "https://example.com");
    expect(head).not.toContain("data-ink-blog-font");
  });

  test("字体注入落在 head 里", () => {
    const html = injectBlogSEO(
      '<html lang="en"><head><title>x</title></head><body></body></html>',
      baseSeo({ font }),
    );
    const at = html.indexOf("data-ink-blog-font");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(html.indexOf("</head>"));
  });

  test("样式表地址里的引号不会逃出属性", () => {
    const head = renderBlogHead(
      baseSeo({
        font: {
          name: "Evil",
          stack: "Evil, sans-serif",
          stylesheet: 'https://x.test/a.css" onload="alert(1)',
        },
      }),
      "https://example.com",
    );
    expect(head).not.toContain('onload="alert(1)"');
    expect(head).toContain("&quot;");
  });
});
