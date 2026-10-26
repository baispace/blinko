import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { publicBlogOwner } from "./blog";
import { publicPublicationWhere } from "./publication";
import {
  ABOUT_FEATURED_MAX,
  ABOUT_TOPIC_MAX,
  sanitizeAboutTopicIds,
  sanitizeFeaturedPosts,
  sanitizeSpaceIntro,
} from "./blogAboutConfig";

export {
  sanitizeAboutTopicIds,
  sanitizeFeaturedPosts,
  sanitizeSpaceIntro,
} from "./blogAboutConfig";
export type { AboutFeaturedInput } from "./blogAboutConfig";

/**
 * 关于页的公开内容。
 *
 * 这一页要回答访客的六个问题：我是谁、攒了什么、写了什么、先读哪篇、
 * 最近在想什么、怎么订阅。除了「我是谁」和站点数据，其余内容都是作者
 * 挑过的东西 —— 所以这里不自动推荐，只把作者选中的内容如实呈现。
 *
 * 三条口径：
 *   1. 精选文章最多 3 篇，每篇一句作者写的推荐理由；
 *   2. 已撤回、删除或转为私有的文章自动退出精选，不占位；
 *   3. 展示专题最多 4 个，按作者排的顺序；没排就按专题默认排序取前 4。
 */

export type PublicAboutTopic = {
  id: number;
  name: string;
  slug: string;
  desc: string;
  color: string;
  /** 公开文章数，让访客知道这个专题有多厚。 */
  count: number;
};

export type PublicAboutFeatured = {
  id: number;
  publishId: string;
  title: string;
  /** 所属专题（没有就空字符串，页面不占位）。 */
  topicName: string;
  /** 封面地址（没有就空字符串，页面用占位块）。 */
  coverUrl: string;
  /** 作者写的推荐理由。 */
  reason: string;
};

export type PublicAbout = {
  spaceIntro: string;
  topics: PublicAboutTopic[];
  featured: PublicAboutFeatured[];
};

/**
 * 关于页的公开内容。
 *
 * 只取公开数据：专题必须是已发布且含有公开文章的，
 * 文章必须当前公开可访问 —— 撤回或转私有后自动从精选里消失。
 */
export async function publicAbout(
  db: PrismaClient,
  input: { accountId?: number } = {},
): Promise<PublicAbout> {
  const owner = await publicBlogOwner(db, input.accountId);
  const profile = await db.blogProfile.findFirst({
    where: { accountId: owner, isPublished: true },
    select: {
      spaceIntro: true,
      featuredPosts: true,
      aboutTopicIds: true,
    },
  });

  const configuredTopics = sanitizeAboutTopicIds(profile?.aboutTopicIds ?? []);
  const configuredFeatured = sanitizeFeaturedPosts(profile?.featuredPosts ?? []);

  const noteRows = configuredFeatured.length
    ? await db.notes.findMany({
        where: {
          id: { in: configuredFeatured.map((f) => f.noteId) },
          accountId: owner,
          ...publicPublicationWhere,
        },
        select: {
          id: true,
          publishId: true,
          publication: {
            select: {
              title: true,
              coverAttachment: { select: { path: true } },
            },
          },
          blogTopics: {
            where: { topic: { isPublished: true } },
            orderBy: { topic: { sortOrder: "asc" as const } },
            take: 1,
            select: { topic: { select: { name: true } } },
          },
        },
      })
    : [];

  // 专题：只统计含有公开文章的 —— 空专题出现在关于页上没有意义。
  const allTopics = await db.blogTopic.findMany({
    where: { accountId: owner, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      desc: true,
      color: true,
      _count: { select: { notes: { where: { note: publicPublicationWhere } } } },
    },
  });
  const topicRows = allTopics.filter((t) => t._count.notes > 0);

  // 专题：作者排了顺序就按他的来，没排就取默认顺序的前 4 个。
  const topics: PublicAboutTopic[] = configuredTopics.length
    ? configuredTopics
        .map((id) => topicRows.find((t) => t.id === id))
        .filter((t): t is (typeof topicRows)[number] => !!t)
        .map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          desc: t.desc,
          color: t.color,
          count: t._count.notes,
        }))
    : topicRows.slice(0, ABOUT_TOPIC_MAX).map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        desc: t.desc,
        color: t.color,
        count: t._count.notes,
      }));

  // 精选文章：按作者排的顺序输出，查不到（已撤回/已删除）的直接跳过。
  const noteMap = new Map(noteRows.map((n) => [n.id, n]));
  const featured: PublicAboutFeatured[] = configuredFeatured
    .map((item) => {
      const note = noteMap.get(item.noteId);
      if (!note || !note.publishId) return null;
      return {
        id: note.id,
        publishId: note.publishId,
        title: note.publication?.title || "（无标题）",
        topicName: note.blogTopics[0]?.topic.name || "",
        coverUrl: note.publication?.coverAttachment?.path || "",
        reason: item.reason,
      };
    })
    .filter((f): f is PublicAboutFeatured => !!f);

  return {
    spaceIntro: profile ? sanitizeSpaceIntro(profile.spaceIntro) : "",
    topics,
    featured,
  };
}
