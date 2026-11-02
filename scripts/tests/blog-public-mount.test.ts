import { expect, test } from 'bun:test';
import { isPublicBlogRequest } from '../../app/src/lib/blogPublicBase';

/**
 * 公开博客挂在域名根路径时的「公开站 / 工作区」分流。
 *
 * 公开域名经过反向代理把 /topics 映射到应用内部的 /blog/topics，
 * 浏览器地址栏里留下的是公开路径 /topics。前端要据此决定渲染
 * 公开博客还是工作区 —— 判断错了，专题页和文章页会落回工作区界面。
 *
 * 关键点：基础路径为 "/"（根路径挂载）时，路径前缀比较必然失效
 * （"/" 的下一层前缀是 "//"，任何路径都匹配不上），
 * 必须改用「当前 origin 是不是公开站点地址」判断。
 */

const publicHost = {
  pathname: "/topics",
  origin: "https://blog.baispace.cn",
  basePath: "/",
  publicOrigin: "https://blog.baispace.cn",
  deploymentMode: "proxy",
};

test("根路径挂载：公开域名下的所有子页面都算公开站", () => {
  for (const pathname of [
    "/",
    "/topics",
    "/t/some-slug",
    "/about",
    "/moments",
    "/subscribe",
    "/stats",
    "/e26753d9fc1482401e862b2d",
  ]) {
    expect(
      isPublicBlogRequest({ ...publicHost, pathname }),
      `公开域名下的 ${pathname} 应该渲染公开博客`,
    ).toBe(true);
  }
});

test("根路径挂载：工作区域名仍然渲染工作区", () => {
  // 同一个服务、两个域名：工作区域名不能被公开站接管。
  for (const pathname of ["/", "/notes", "/blog-manage", "/settings"]) {
    expect(
      isPublicBlogRequest({
        ...publicHost,
        pathname,
        origin: "https://studio.baispace.cn",
      }),
      `工作区域名下的 ${pathname} 应该渲染工作区`,
    ).toBe(false);
  }
});

test("根路径挂载：没有公开站点地址时不认任何一个域名", () => {
  // 公开地址没配时，origin 对不上 —— 不能凭路径就把工作区渲染成公开站。
  expect(
    isPublicBlogRequest({
      pathname: "/topics",
      origin: "https://blog.baispace.cn",
      basePath: "/",
      publicOrigin: "",
      deploymentMode: "proxy",
    }),
  ).toBe(false);
});

test("同域挂载 /blog：仍然按路径前缀判断", () => {
  // 公开博客与工作区共用一个域名时的老行为不能变。
  const sameOrigin = "https://ink.example.com";
  expect(
    isPublicBlogRequest({
      pathname: "/blog",
      origin: sameOrigin,
      basePath: "/blog",
      publicOrigin: sameOrigin,
      deploymentMode: "proxy",
    }),
  ).toBe(true);
  expect(
    isPublicBlogRequest({
      pathname: "/blog/topics",
      origin: sameOrigin,
      basePath: "/blog",
      publicOrigin: sameOrigin,
      deploymentMode: "proxy",
    }),
  ).toBe(true);
  expect(
    isPublicBlogRequest({
      pathname: "/notes",
      origin: sameOrigin,
      basePath: "/blog",
      publicOrigin: sameOrigin,
      deploymentMode: "proxy",
    }),
  ).toBe(false);
  expect(
    isPublicBlogRequest({
      pathname: "/",
      origin: sameOrigin,
      basePath: "/blog",
      publicOrigin: sameOrigin,
      deploymentMode: "proxy",
    }),
  ).toBe(false);
});

test("公开站点地址的尾斜杠不影响判定", () => {
  expect(
    isPublicBlogRequest({
      ...publicHost,
      publicOrigin: "https://blog.baispace.cn/",
    }),
  ).toBe(true);
});

test("前后端分开部署：只有公开站点地址本身算公开站", () => {
  expect(
    isPublicBlogRequest({
      pathname: "/topics",
      origin: "https://blog.baispace.cn",
      basePath: "/blog",
      publicOrigin: "https://blog.baispace.cn",
      deploymentMode: "separate",
    }),
  ).toBe(true);
  expect(
    isPublicBlogRequest({
      pathname: "/topics",
      origin: "https://studio.baispace.cn",
      basePath: "/blog",
      publicOrigin: "https://blog.baispace.cn",
      deploymentMode: "separate",
    }),
  ).toBe(false);
});

test("公开站专用构建产物一律渲染公开站", () => {
  expect(
    isPublicBlogRequest({
      pathname: "/anything",
      origin: "https://cdn.example.com",
      basePath: "/blog",
      publicOnlyBuild: true,
    }),
  ).toBe(true);
});

test("前端入口用的是同一个判定函数，不允许另写一份前缀比较", () => {
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const { join } = require("node:path") as typeof import("node:path");
  const root = join(import.meta.dir, "../..");
  const source = readFileSync(join(root, "app/src/main.tsx"), "utf8");
  expect(source).toContain("isPublicBlogRequest");
  // 旧写法在根路径挂载时必然失效，不许复活。
  expect(source).not.toContain('startsWith(basePath + "/")');
});
