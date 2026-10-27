import { describe, test, expect } from "bun:test";
import {
  hasCredentialLeak,
  isSiteFileUrl,
  publicBodyAssetPaths,
  publicBodyOf,
  rewritePublicBodyAssets,
  stripCredentialParams,
} from "../../shared/lib/blogPublicBody";
import {
  authenticatedUrl,
  safeUrl,
} from "../../app/src/components/BlinkoBlog/PublicArticleBody";

describe("公开正文的素材处理", () => {
  test("凭据参数被剥掉，其余查询参数原样保留", () => {
    expect(stripCredentialParams("/api/file/a.png?token=abc")).toBe(
      "/api/file/a.png",
    );
    expect(stripCredentialParams("/api/file/a.png?token=abc&v=2")).toBe(
      "/api/file/a.png?v=2",
    );
    expect(stripCredentialParams("/api/file/a.png?v=2&token=abc")).toBe(
      "/api/file/a.png?v=2",
    );
    expect(
      stripCredentialParams("/api/file/a.png?token=abc&authorization=xyz&v=2"),
    ).toBe("/api/file/a.png?v=2");
    // HTML 实体分隔符也要认。
    expect(
      stripCredentialParams("/api/file/a.png?a=1&amp;token=abc&amp;b=2"),
    ).toBe("/api/file/a.png?a=1&amp;b=2");
    // 没有查询串就原样返回。
    expect(stripCredentialParams("/api/file/a.png")).toBe("/api/file/a.png");
    // 外链同样处理：公开页上的地址一律不带凭据。
    expect(stripCredentialParams("https://x.test/p?token=abc")).toBe(
      "https://x.test/p",
    );
  });

  test("正文里的站内地址会被改写，外链不动", () => {
    expect(rewritePublicBodyAssets("![a](/api/file/a.png?token=1)")).toBe(
      "![a](/api/file/a.png)",
    );
    expect(
      rewritePublicBodyAssets('<img src="/api/s3file/b.png?token=1" />'),
    ).toBe('<img src="/api/s3file/b.png" />');
    // 外链带凭据不在改写范围内 —— 那是发布时要挡的，不是要偷偷改的。
    expect(rewritePublicBodyAssets("[x](https://x.test?token=1)")).toBe(
      "[x](https://x.test?token=1)",
    );
  });

  test("改写是幂等的：比对口径才能稳定", () => {
    const body = "![a](/api/file/a.png?token=1)\n\n![b](/api/file/b.png)";
    const once = publicBodyOf(body);
    expect(publicBodyOf(once)).toBe(once);
    expect(once).toBe("![a](/api/file/a.png)\n\n![b](/api/file/b.png)");
  });

  test("站内地址带凭据不算泄露，外链带凭据算", () => {
    expect(hasCredentialLeak("![a](/api/file/a.png?token=1)")).toBe(false);
    expect(hasCredentialLeak("![a](/api/s3file/a.png?token=1)")).toBe(false);
    expect(hasCredentialLeak("[x](https://x.test?token=1)")).toBe(true);
    expect(hasCredentialLeak("[x](https://x.test?a=1&amp;token=1)")).toBe(true);
    expect(hasCredentialLeak("[x](https://x.test?authorization=Bearer)")).toBe(
      true,
    );
    // 伪装成百分号编码也要认出来。
    expect(hasCredentialLeak("[x](https://x.test?%74oken=1)")).toBe(true);
    expect(hasCredentialLeak("# 普通正文，没有链接")).toBe(false);
  });

  test("正文里引用到的站内地址清单", () => {
    expect(
      publicBodyAssetPaths("![a](/api/file/a.png?token=1) ![b](/api/s3file/b.png)"),
    ).toEqual(["/api/file/a.png", "/api/s3file/b.png"]);
    expect(publicBodyAssetPaths("没有图片")).toEqual([]);
  });

  test("站内地址判定", () => {
    expect(isSiteFileUrl("/api/file/a.png")).toBe(true);
    expect(isSiteFileUrl("/api/s3file/a.png")).toBe(true);
    expect(isSiteFileUrl("/blog/a")).toBe(false);
    expect(isSiteFileUrl("https://x.test/a.png")).toBe(false);
  });
});

describe("公开正文渲染的地址白名单", () => {
  test("站内文件两种地址都放行，凭据被剥掉", () => {
    expect(safeUrl("/api/file/a.png")).toBe("/api/file/a.png");
    expect(safeUrl("/api/s3file/a.png")).toBe("/api/s3file/a.png");
    expect(safeUrl("/api/file/a.png?token=abc")).toBe("/api/file/a.png");
    expect(safeUrl("/api/s3file/a.png?token=abc")).toBe("/api/s3file/a.png");
  });

  test("外链上的凭据也不带出去", () => {
    expect(safeUrl("https://x.test/a?token=abc")).toBe("https://x.test/a");
  });

  test("后台预览的站内地址补上凭据，不带别人的凭据", () => {
    const url = authenticatedUrl("/api/file/a.png?token=stale");
    expect(url.startsWith("/api/file/a.png")).toBe(true);
    expect(url).not.toContain("stale");
  });
});
