import { describe, expect, test } from "bun:test";
import {
  applyTitleTemplate,
  joinBasePath,
  normalizeBasePath,
  resolveSeoFields,
  toPublicPath,
  absoluteSeoImage,
  SEO_SOURCE_LABELS,
} from "../../shared/lib/blogSeo";
import { articleSeoSchema } from "../../shared/lib/blogSiteSettings";

describe("统一 SEO 解析规则", () => {
  const site = {
    siteName: "我的空间",
    titleTemplate: "{标题} · {站点名称}",
    description: "站点默认描述",
    shareImage: "https://cdn.example.com/share.png",
    allowIndex: true,
  };

  test("覆盖优先于内容，内容优先于站点默认", () => {
    const resolved = resolveSeoFields({
      override: { title: "自定义标题" },
      content: {
        title: "内容标题",
        summary: "内容概要",
        coverUrl: "https://cdn.example.com/cover.png",
      },
      site,
      fallbackTitle: "兜底",
      fallbackDescription: "兜底描述",
    });
    expect(resolved.title).toBe("自定义标题");
    expect(resolved.sources.title).toBe("override");
    // 没被覆盖的字段继续往下继承
    expect(resolved.description).toBe("内容概要");
    expect(resolved.sources.description).toBe("content");
    expect(resolved.image).toBe("https://cdn.example.com/cover.png");
    expect(resolved.sources.image).toBe("content");
  });

  test("没有覆盖时内容标题套站点模板，模板占位符真的替换", () => {
    const resolved = resolveSeoFields({
      content: { title: "内容标题" },
      site,
      fallbackTitle: "兜底",
    });
    expect(resolved.title).toBe("内容标题 · 我的空间");
    expect(resolved.sources.title).toBe("content");
    expect(applyTitleTemplate("{标题} · {站点名称}", "标题", "站点")).toBe(
      "标题 · 站点",
    );
    expect(applyTitleTemplate("{标题}", "标题", "站点")).toBe("标题");
    expect(applyTitleTemplate("", "标题", "站点")).toBe("标题");
  });

  test("没有内容时落到站点默认，再落到系统默认", () => {
    const resolved = resolveSeoFields({
      site: { ...site, description: "", shareImage: "" },
      fallbackTitle: "兜底标题",
      fallbackDescription: "兜底描述",
      defaultImage: "https://cdn.example.com/icon.png",
    });
    expect(resolved.title).toBe("兜底标题 · 我的空间");
    expect(resolved.sources.title).toBe("site");
    expect(resolved.description).toBe("兜底描述");
    expect(resolved.sources.description).toBe("default");
    expect(resolved.image).toBe("https://cdn.example.com/icon.png");
    expect(resolved.sources.image).toBe("default");
  });

  test("站点描述与分享图在内容没有对应信息时生效", () => {
    const resolved = resolveSeoFields({
      content: { title: "内容标题", summary: null, coverUrl: null },
      site,
      fallbackTitle: "兜底",
    });
    expect(resolved.description).toBe("站点默认描述");
    expect(resolved.sources.description).toBe("site");
    expect(resolved.image).toBe("https://cdn.example.com/share.png");
    expect(resolved.sources.image).toBe("site");
  });

  test("分享图片说明留空时用解析后的标题", () => {
    const resolved = resolveSeoFields({
      content: { title: "内容标题" },
      site,
      fallbackTitle: "兜底",
    });
    expect(resolved.imageAlt).toBe(resolved.title);
    const custom = resolveSeoFields({
      override: { imageAlt: "图片说明" },
      content: { title: "内容标题" },
      site,
      fallbackTitle: "兜底",
    });
    expect(custom.imageAlt).toBe("图片说明");
    expect(custom.sources.imageAlt).toBe("override");
  });

  test("留空的覆盖值不算覆盖（恢复默认 = 清除继承）", () => {
    const resolved = resolveSeoFields({
      override: { title: "  ", description: "", image: "" },
      content: { title: "内容标题", summary: "内容概要" },
      site,
      fallbackTitle: "兜底",
    });
    expect(resolved.title).toBe("内容标题 · 我的空间");
    expect(resolved.sources.title).toBe("content");
    expect(resolved.description).toBe("内容概要");
  });

  test("来源标签齐全，管理端能区分继承与自定义", () => {
    expect(SEO_SOURCE_LABELS.override).toBe("自定义");
    expect(SEO_SOURCE_LABELS.content).toBe("继承内容");
    expect(SEO_SOURCE_LABELS.site).toBe("继承站点");
    expect(SEO_SOURCE_LABELS.default).toBe("系统默认");
  });
});

describe("公开地址与基础路径", () => {
  test("基础路径归一化：拒绝协议、凭据与空白", () => {
    expect(normalizeBasePath("/blog")).toBe("/blog");
    expect(normalizeBasePath("/blog/")).toBe("/blog");
    expect(normalizeBasePath("/")).toBe("/");
    expect(normalizeBasePath("")).toBe("");
    expect(normalizeBasePath("https://evil.com")).toBe("");
    expect(normalizeBasePath("/a b")).toBe("");
    expect(normalizeBasePath("/a@b")).toBe("");
  });

  test("拼接基础路径不产生双斜杠", () => {
    expect(joinBasePath("/blog", "/abc")).toBe("/blog/abc");
    expect(joinBasePath("/blog", "/")).toBe("/blog");
    expect(joinBasePath("/", "/abc")).toBe("/abc");
    expect(joinBasePath("/", "/")).toBe("/");
  });

  test("应用内部路径换算成公开路径", () => {
    expect(toPublicPath("/blog", "/blog")).toBe("/blog");
    expect(toPublicPath("/blog/abc", "/blog")).toBe("/blog/abc");
    expect(toPublicPath("/blog/abc", "/")).toBe("/abc");
    expect(toPublicPath("/blog/topics", "/")).toBe("/topics");
    expect(toPublicPath("/blog/t/slug", "/")).toBe("/t/slug");
  });

  test("分享图片补成绝对地址，带凭据的地址被拒绝", () => {
    expect(absoluteSeoImage("/api/file/a.png", "https://x.dev")).toBe(
      "https://x.dev/api/file/a.png",
    );
    expect(absoluteSeoImage("https://cdn.dev/a.png", "https://x.dev")).toBe(
      "https://cdn.dev/a.png",
    );
    expect(
      absoluteSeoImage("https://user:pw@cdn.dev/a.png", "https://x.dev"),
    ).toBe("https://x.dev/icons/Square310x310Logo.png");
    expect(absoluteSeoImage("javascript:alert(1)", "https://x.dev")).toBe(
      "https://x.dev/icons/Square310x310Logo.png",
    );
    expect(absoluteSeoImage("", "https://x.dev")).toBe(
      "https://x.dev/icons/Square310x310Logo.png",
    );
  });
});

describe("SEO 覆盖字段的存储限制", () => {
  test("标题、描述与图片说明都有长度上限", () => {
    expect(
      articleSeoSchema.safeParse({ title: "x".repeat(161) }).success,
    ).toBe(false);
    expect(
      articleSeoSchema.safeParse({ description: "y".repeat(501) }).success,
    ).toBe(false);
    expect(
      articleSeoSchema.safeParse({ imageAlt: "z".repeat(201) }).success,
    ).toBe(false);
    const ok = articleSeoSchema.safeParse({
      title: "x".repeat(160),
      description: "y".repeat(500),
      imageAlt: "z".repeat(200),
    });
    expect(ok.success).toBe(true);
  });

  test("带凭据的图片地址会被拒绝", () => {
    expect(
      articleSeoSchema.safeParse({ image: "https://user:pw@cdn.dev/a.png" }).success,
    ).toBe(false);
  });
});
