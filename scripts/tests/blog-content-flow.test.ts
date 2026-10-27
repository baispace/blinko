import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  CONTENT_STATUS_FILTERS,
  CONTENT_STATUS_META,
  CHANGE_FIELD_LABELS,
  describeChanges,
  resolveContentStatus,
  contentTitle,
  type ContentStatus,
} from "../../app/src/components/BlinkoBlog/contentStatus";

const read = (p: string) =>
  readFileSync(
    new URL(`../../app/src/components/BlinkoBlog/${p}`, import.meta.url),
    "utf8",
  );

const list = read("BlogContentList.tsx");
const status = read("contentStatus.ts");
const quickPanel = read("ContentQuickPanel.tsx");
const managePage = read("BlogManagePage.tsx");
const detail = read("BlogArticleDetail.tsx");
const serverBlog = readFileSync(
  new URL("../../server/lib/blog.ts", import.meta.url),
  "utf8",
);
const serverRouter = readFileSync(
  new URL("../../server/routerTrpc/blog.ts", import.meta.url),
  "utf8",
);
const appRoutes = readFileSync(
  new URL("../../app/src/App.tsx", import.meta.url),
  "utf8",
);
const iconsSrc = readFileSync(
  new URL("../../app/src/components/Common/Iconify/icons.tsx", import.meta.url),
  "utf8",
);

describe("内容状态模型是全站唯一来源", () => {
  test("只有四种状态，且每种都有标签、说明和主动作", () => {
    const keys = Object.keys(CONTENT_STATUS_META).sort();
    expect(keys).toEqual(["changed", "draft", "published", "withdrawn"]);
    for (const key of keys) {
      const meta = CONTENT_STATUS_META[key as ContentStatus];
      expect(meta.label.trim()).toBeTruthy();
      expect(meta.desc.trim()).toBeTruthy();
      // 每种状态只给一个主动作：用户不该在一堆等价按钮里挑
      expect(meta.action.trim()).toBeTruthy();
    }
  });

  test("状态的判定规则固定，不会同一种情况算出两种状态", () => {
    // 从没公开过 → 草稿
    expect(resolveContentStatus({ isPublished: false, revision: 0 })).toBe(
      "draft",
    );
    // 公开过又下线 → 撤回
    expect(resolveContentStatus({ isPublished: false, revision: 3 })).toBe(
      "withdrawn",
    );
    // 在线且没有改动 → 已发布
    expect(
      resolveContentStatus({ isPublished: true, hasDraftChanges: false }),
    ).toBe("published");
    // 在线但草稿有改动 → 待发布更新
    expect(
      resolveContentStatus({ isPublished: true, hasDraftChanges: true }),
    ).toBe("changed");
  });

  test("筛选分段的顺序按下一步要做什么排，不按字母排", () => {
    expect(CONTENT_STATUS_FILTERS.map((f) => f.key)).toEqual([
      "all",
      "draft",
      "changed",
      "published",
      "withdrawn",
    ]);
  });

  test("变更字段的名字只有一份，各处都引用同一张表", () => {
    expect(CHANGE_FIELD_LABELS.title).toBe("标题");
    expect(CHANGE_FIELD_LABELS.summary).toBe("摘要");
    expect(CHANGE_FIELD_LABELS.content).toBe("正文");
    expect(describeChanges(["title", "content"])).toBe("标题、正文");
    expect(describeChanges([])).toBe("");
    expect(describeChanges(undefined)).toBe("");
  });

  test("标题兜底算法统一，正文第一行当标题", () => {
    expect(contentTitle("<p>你好</p>", "")).toBe("你好");
    expect(contentTitle("<h1>标题一</h1><p>正文</p>", "")).toBe("标题一");
    expect(contentTitle("", "手动标题")).toBe("手动标题");
    expect(contentTitle("", "")).toBe("无标题");
  });
});

describe("内容列表：筛选状态存在网址里", () => {
  test("搜索、状态、专题、排序、页码都走 URL query", () => {
    expect(list).toContain("useSearchParams");
    for (const key of ["status", "topic", "sort", "page", "q"]) {
      expect(list).toContain(`"${key}"`);
    }
  });

  test("不再用 sessionStorage 恢复筛选条件", () => {
    // 以前筛选、页码、滚动都存在 sessionStorage 里，返回列表就丢
    expect(list).not.toContain("sessionStorage");
    expect(managePage).not.toContain("ink-blog-manage-list");
  });

  test("状态筛选做成带计数的分段，不用点开下拉才知道有几个", () => {
    // 现在统一走 HeroUI 的 BlogTabs，计数直接跟在标签后面
    expect(list).toContain("<BlogTabs");
    expect(list).toContain('label="按发布状态筛选"');
    expect(list).toContain("counts[item.key] ?? 0");
  });

  test("列表里有批量发布和批量撤回", () => {
    expect(list).toContain("批量发布");
    expect(list).toContain("批量撤回");
    expect(list).toContain("api.blog.bulkAction.mutate");
  });

  test("两种空状态分开：没有内容 vs 筛不出结果", () => {
    expect(list).toContain("内容管理还是空的");
    expect(list).toContain("没有符合条件的内容");
    expect(list).toContain("清除筛选条件");
  });

  test("草稿箱能进能出", () => {
    expect(list).toContain("加入草稿");
    expect(list).toContain("api.blog.setDraft.mutate");
    expect(list).toContain("移出草稿箱");
  });

  test("每行都有主动作：行内统一叫「管理」，随状态变的是面板里的发布按钮", () => {
    // 行内不再直接摆发布按钮，所有动作收进右侧面板
    expect(list).not.toContain("meta.action");
    expect(quickPanel).toContain("CONTENT_STATUS_META");
    expect(CONTENT_STATUS_META.draft.action).toBe("发布");
    expect(CONTENT_STATUS_META.changed.action).toBe("更新发布");
    expect(CONTENT_STATUS_META.withdrawn.action).toBe("重新发布");
    expect(CONTENT_STATUS_META.published.action).toBe("查看公开页");
  });
});

describe("编辑入口收敛成一个工作台", () => {
  test("管理页里的内嵌编辑器已经拆走", () => {
    expect(managePage).not.toContain("function PostEditor");
    expect(managePage).toContain("<BlogContentList");
  });

  test("点文章进独立路由，不在列表里原地展开编辑器", () => {
    expect(list).toContain("/blog-manage/content/${post.id}");
    expect(list).not.toContain("function PostEditor");
  });

  test("旧的发布向导入口改为跳转，编辑入口不再有五个", () => {
    expect(appRoutes).toContain("BlogPublishRedirect");
    expect(appRoutes).not.toContain("BlogPublishWizard");
  });

  test("发布入口统一收进右侧快捷操作面板，列表和详情共用", () => {
    expect(list).toContain("ContentQuickPanel");
    expect(detail).toContain("ContentQuickPanel");
    expect(list).not.toContain("BlogPublishSettingsDialog");
    expect(detail).not.toContain("BlogPublishSettingsDialog");
    // 「查看公开页」只在面板的运营管理里，页头不再给第二份。
    expect(quickPanel).toContain("查看公开页");
    expect(detail).not.toContain("查看公开页");
  });
});

describe("状态文案在各页一致", () => {
  test("工作台引用统一的状态模型", () => {
    // 「发布前检查」已经并进文章管理页，不再是独立页面
    expect(detail).toContain("resolveContentStatus");
    expect(detail).toContain("CONTENT_STATUS_META");
  });

  test("旧的三套说法不再出现", () => {
    for (const src of [list, detail, managePage]) {
      expect(src).not.toContain("有未发布修改");
      expect(src).not.toContain("有更新待发布");
      expect(src).not.toContain("尚未发布");
    }
    // 列表里的旧说法也换成了统一的名字
    expect(status).toContain("待发布更新");
  });

  test("检查区改叫「发布前检查」，跟工作台里的入口对得上", () => {
    expect(detail).toContain("发布前检查");
  });
});

describe("服务端配合新的内容流程", () => {
  test("列表把草稿箱里的笔记也带出来", () => {
    expect(serverBlog).toContain("blogDraft");
    expect(serverBlog).toContain('path: ["blogDraft"]');
  });

  test("列表返回规范化后的标题、版本号和草稿标记", () => {
    expect(serverBlog).toContain("isDraft");
    expect(serverBlog).toContain("revision:");
  });

  test("批量操作与草稿标记都有路由", () => {
    expect(serverRouter).toContain("bulkAction");
    expect(serverRouter).toContain("setDraft");
  });
});

describe("图标不能缺失", () => {
  test("内容列表用到的图标本地都有", () => {
    const used = [...list.matchAll(/icon="tabler:([a-z0-9-]+)"/g)].map(
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    for (const name of new Set(used)) {
      expect(iconsSrc).toContain(`"${name}": {`);
    }
  });
});
