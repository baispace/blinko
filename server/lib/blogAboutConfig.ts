import { TRPCError } from "@trpc/server";
import {
  ABOUT_FEATURED_MAX,
  ABOUT_REASON_MAX,
  ABOUT_SPACE_INTRO_MAX,
  ABOUT_TOPIC_MAX,
} from "@shared/lib/blogAbout";

/**
 * 关于页配置的清洗规则。
 *
 * 单独成文件是为了不形成循环引用：
 * blog.ts（保存资料）要用这里的清洗函数，blogAbout.ts（读取公开内容）
 * 又要从 blog.ts 取公开博客的归属 —— 三个文件互相 import 会成环。
 *
 * 这里只做形状校验与长度兜底，不碰数据库。
 */

export {
  ABOUT_FEATURED_MAX,
  ABOUT_REASON_MAX,
  ABOUT_SPACE_INTRO_MAX,
  ABOUT_TOPIC_MAX,
};

export type AboutFeaturedInput = { noteId: number; reason: string };

/**
 * 清洗作者填的精选列表。
 *
 * 只留形状正确的项：必须是正整数 id + 字符串理由。
 * 数量超了取前 3 个 —— 超出部分直接丢掉，不报错打断整次保存。
 */
export function sanitizeFeaturedPosts(input: unknown): AboutFeaturedInput[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "精选文章格式不正确",
    });
  const seen = new Set<number>();
  const result: AboutFeaturedInput[] = [];
  for (const raw of input) {
    const item = raw as Partial<AboutFeaturedInput>;
    const noteId = Number(item?.noteId);
    if (!Number.isInteger(noteId) || noteId <= 0) continue;
    if (seen.has(noteId)) continue;
    seen.add(noteId);
    result.push({
      noteId,
      reason: String(item?.reason ?? "")
        .trim()
        .slice(0, ABOUT_REASON_MAX),
    });
    if (result.length >= ABOUT_FEATURED_MAX) break;
  }
  return result;
}

/** 清洗作者排的专题顺序：只留正整数，去重，按作者给的顺序。 */
export function sanitizeAboutTopicIds(input: unknown): number[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input))
    throw new TRPCError({ code: "BAD_REQUEST", message: "展示专题格式不正确" });
  const seen = new Set<number>();
  const result: number[] = [];
  for (const raw of input) {
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= ABOUT_TOPIC_MAX) break;
  }
  return result;
}

/** 公开资料里的站点说明：长度兜底，空的就空着。 */
export function sanitizeSpaceIntro(input: unknown): string {
  return String(input ?? "")
    .trim()
    .slice(0, ABOUT_SPACE_INTRO_MAX);
}
