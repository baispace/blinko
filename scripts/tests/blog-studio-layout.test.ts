import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
/*
 * 组件跑在 app 目录下，用的是 app 里的那份 React。
 * 测试这里如果从仓库根解析 React，就会变成两份实例，
 * 渲染时 React 的 dispatcher 是 null —— 直接抛 "Invalid hook call"。
 * 所以 React 与 react-dom 都要从 app 里取，保证同一个实例。
 */
import React from "../../app/node_modules/react";
import { renderToStaticMarkup } from "../../app/node_modules/react-dom/server";
import {
  STUDIO_NAV,
  STUDIO_SECTION_KEYS,
  STUDIO_SECTION_META,
  type StudioSection,
} from "../../app/src/components/BlinkoBlog/studioNav";
import { BlogStudioNav } from "../../app/src/components/BlinkoBlog/BlogStudioNav";

const read = (p: string) =>
  readFileSync(
    new URL(`../../app/src/components/BlinkoBlog/${p}`, import.meta.url),
    "utf8",
  );

const managePage = read("BlogManagePage.tsx");
const iconsSrc = readFileSync(
  new URL(
    "../../app/src/components/Common/Iconify/icons.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("博客后台的侧边栏导航模型", () => {
  test("侧边栏覆盖全部分区，一个都不漏", () => {
    const keys = STUDIO_NAV.flatMap((g) => g.items.map((i) => i.key));
    expect([...keys].sort()).toEqual([...STUDIO_SECTION_KEYS].sort());
    // 分区不能重复，否则同一个入口会在侧边栏出现两次
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("每个分区都有标题和说明，主内容区不会开天窗", () => {
    for (const key of STUDIO_SECTION_KEYS) {
      const meta = STUDIO_SECTION_META[key];
      expect(meta?.title?.trim()).toBeTruthy();
      expect(meta?.desc?.trim()).toBeTruthy();
    }
  });

  test("分组有标题，条目都有标签和说明", () => {
    const groups = STUDIO_NAV.map((g) => g.title);
    expect(new Set(groups).size).toBe(groups.length);
    for (const group of STUDIO_NAV) {
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.label.trim()).toBeTruthy();
        expect(item.hint.trim()).toBeTruthy();
      }
    }
  });

  test("图标必须是本地图标库里有的名字，否则会渲染成空白", () => {
    for (const group of STUDIO_NAV) {
      for (const item of group.items) {
        const name = item.icon.replace(/^tabler:/, "");
        expect(iconsSrc).toContain(`"${name}": {`);
      }
    }
  });
});

describe("侧边栏渲染", () => {
  const html = renderToStaticMarkup(
    React.createElement(BlogStudioNav, {
      section: "posts" as StudioSection,
      onSelect: () => {},
      collapsed: false,
      postCount: 3,
      topicCount: 2,
      onToggleTheme: () => {},
      onBack: () => {},
    }),
  );

  test("当前分区带 aria-current，侧边栏能导航到每个分区", () => {
    expect(html).toContain('aria-current="page"');
    for (const group of STUDIO_NAV) {
      for (const item of group.items) {
        expect(html).toContain(item.label);
      }
    }
  });

  test("侧边栏底部保留返回入口", () => {
    // 主题切换不在侧栏：侧栏底部只留一个「返回工作区」。
    expect(html).toContain("返回工作区");
  });
});

describe("管理页用的是侧边栏骨架", () => {
  test("旧的横向分区导航已经下线", () => {
    expect(managePage).not.toContain('aria-label="博客管理分区"');
    expect(managePage).toContain("<BlogStudioNav");
    // 骨架已改用 Tailwind 工具类，旧的 ink-studio-* 类名整体退役
    expect(managePage).not.toContain("ink-studio-top");
  });

  test("站点设置的四个分区不再需要二级 tab", () => {
    // 二级 tab 已全部下沉到各分区自己的面板（如 BlogSiteSettingsPanel），
    // 管理页本身不再直接渲染 BlogTabs。
    expect(managePage.match(/<BlogTabs/g)?.length ?? 0).toBe(0);
    // 旧的"站点与统计 / 公开作者 / 封面资源 / 推荐分发"这行二级 tab 整行下线
    expect(managePage).not.toContain('["settings","站点与统计"]');
  });

  test("深链仍然覆盖全部分区", () => {
    expect(managePage).toContain("STUDIO_SECTION_KEYS.includes");
    for (const key of STUDIO_SECTION_KEYS) {
      expect(STUDIO_SECTION_META[key]).toBeTruthy();
    }
  });
});
