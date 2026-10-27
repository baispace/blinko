import { describe, expect, test } from "bun:test";
import { isPrivateAddress, safeFetch, assertPublicTarget } from "../../server/lib/safeFetch";
import {
  legacyRedirectTarget,
  legacyRedirectPreview,
} from "../../server/lib/blogRedirects";

describe("站点检查的 SSRF 防护", () => {
  test("回环与内网地址一律拒绝", () => {
    for (const ip of [
      "127.0.0.1",
      "127.5.5.5",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
    ]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  test("只允许 http(s)，带凭据的地址直接拒绝", async () => {
    await expect(assertPublicTarget("ftp://example.com")).rejects.toThrow(
      "只允许 http(s) 协议",
    );
    await expect(
      assertPublicTarget("https://user:pw@example.com"),
    ).rejects.toThrow("用户名或密码");
    await expect(assertPublicTarget("not a url")).rejects.toThrow("地址格式");
  });

  test("指向本机的名字同样被拒绝", async () => {
    await expect(assertPublicTarget("http://localhost:1111")).rejects.toThrow(
      "本机",
    );
    await expect(assertPublicTarget("http://foo.local")).rejects.toThrow("本机");
  });

  test("请求内网地址会被挡下，不会真的发出", async () => {
    const result = await safeFetch("http://127.0.0.1:1111/blog");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(0);
    expect(result.errorCode).toBe("blocked-host");
  });

  test("请求带凭据的地址会被挡下", async () => {
    const result = await safeFetch("https://user:pw@example.com/");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("invalid-url");
  });
});

describe("旧地址永久跳转映射", () => {
  const base = {
    enabled: true,
    legacyBasePath: "/blog",
    publicBasePath: "/",
    targetOrigin: "https://blog.example.com",
    currentHost: "ink.example.com",
  };

  test("旧文章跳到同一篇的新地址，不是一律跳首页", () => {
    expect(
      legacyRedirectTarget("/blog/abc123", "", base),
    ).toBe("https://blog.example.com/abc123");
  });

  test("旧专题跳到同一个专题的新地址", () => {
    expect(
      legacyRedirectTarget("/blog/t/my-topic", "", base),
    ).toBe("https://blog.example.com/t/my-topic");
  });

  test("旧首页跳到新首页", () => {
    expect(legacyRedirectTarget("/blog", "", base)).toBe(
      "https://blog.example.com/",
    );
  });

  test("分页与查询参数原样带走", () => {
    expect(legacyRedirectTarget("/blog/abc123", "?page=3", base)).toBe(
      "https://blog.example.com/abc123?page=3",
    );
    expect(
      legacyRedirectTarget("/blog/t/my-topic", "?page=2&topic=x", base),
    ).toBe("https://blog.example.com/t/my-topic?page=2&topic=x");
  });

  test("不迁移工作区路径", () => {
    expect(legacyRedirectTarget("/notes/42", "", base)).toBe(null);
    expect(legacyRedirectTarget("/blog-manage", "", base)).toBe(null);
    expect(legacyRedirectTarget("/api/trpc/blog.publicIndex", "", base)).toBe(
      null,
    );
  });

  test("开关关闭时不跳转", () => {
    expect(
      legacyRedirectTarget("/blog/abc", "", { ...base, enabled: false }),
    ).toBe(null);
  });

  test("目标与当前同域时不跳转，避免死循环", () => {
    expect(
      legacyRedirectTarget("/blog/abc", "", {
        ...base,
        currentHost: "blog.example.com",
      }),
    ).toBe(null);
  });

  test("目标地址非法或带凭据时不跳转，也不开放重定向", () => {
    expect(
      legacyRedirectTarget("/blog/abc", "", {
        ...base,
        targetOrigin: "https://evil.com/redirect?to=",
      }),
    ).toBe("https://evil.com/abc");
    expect(
      legacyRedirectTarget("/blog/abc", "", {
        ...base,
        targetOrigin: "javascript:alert(1)",
      }),
    ).toBe(null);
    expect(
      legacyRedirectTarget("/blog/abc", "", {
        ...base,
        targetOrigin: "https://user:pw@evil.com",
      }),
    ).toBe(null);
  });

  test("映射预览能列出旧地址与新地址", () => {
    const preview = legacyRedirectPreview("/blog", "/", "https://blog.example.com", [
      { label: "旧首页", path: "/blog" },
      { label: "旧文章", path: "/blog/abc" },
    ]);
    expect(preview[0].from).toBe("https://blog.example.com/blog");
    expect(preview[0].to).toBe("https://blog.example.com/");
    expect(preview[1].to).toBe("https://blog.example.com/abc");
  });
});
