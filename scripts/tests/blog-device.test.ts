import { test, expect } from "bun:test";
import { blogDeviceId } from "../../app/src/lib/blogDevice";
test("visitor identity survives losing either storage and preserves existing IDs", () => {
  const originals = new Map(
    ["localStorage", "document"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const data = new Map<string, string>();
  let cookie = "";
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => data.get(k) || null,
        setItem: (k: string, v: string) => data.set(k, v),
      },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        get cookie() {
          return cookie;
        },
        set cookie(value: string) {
          cookie = value.split(";")[0];
        },
      },
    });
    data.set("ink-blog-device", "a".repeat(32));
    expect(blogDeviceId()).toBe("a".repeat(32));
    data.clear();
    expect(blogDeviceId()).toBe("a".repeat(32));
    cookie = "";
    expect(blogDeviceId()).toBe("a".repeat(32));
    cookie = "ink_blog_visitor=" + "b".repeat(32);
    expect(blogDeviceId()).toBe("b".repeat(32));
    expect(data.get("ink-blog-device")).toBe("b".repeat(32));
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("本地测试默认不计数，管理者跨标签页排除且遵循配置", async () => {
  const {
    blogStatsEnabled,
    configureBlogStatistics,
    markBlogManager,
    isLocalBlogHost,
  } = await import("../../app/src/lib/blogDevice");
  const names = ["localStorage", "sessionStorage", "location"];
  const originals = new Map(
    names.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  const local = new Map<string, string>(),
    session = new Map<string, string>();
  const storage = (map: Map<string, string>) => ({
    getItem: (k: string) => map.get(k) || null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage(local),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: storage(session),
    });
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hostname: "127.0.0.1" },
    });
    expect(blogStatsEnabled()).toBe(false);
    local.set("ink-blog-statistics", "on");
    expect(blogStatsEnabled()).toBe(true);
    markBlogManager();
    session.clear();
    configureBlogStatistics({ excludeOwner: true });
    expect(blogStatsEnabled()).toBe(false);
    configureBlogStatistics({ excludeOwner: false });
    expect(blogStatsEnabled()).toBe(true);
    local.set("ink-blog-statistics", "off");
    expect(blogStatsEnabled()).toBe(false);
    expect(isLocalBlogHost("preview.localhost")).toBe(true);
    expect(isLocalBlogHost("blog.baispace.cn")).toBe(false);
  } finally {
    configureBlogStatistics({ excludeOwner: true });
    for (const [key, d] of originals) {
      if (d) Object.defineProperty(globalThis, key, d);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
