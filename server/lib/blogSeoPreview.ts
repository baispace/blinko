import type { PrismaClient } from "@prisma/client";
import { readArticleSeo } from "../../shared/lib/blogSiteSettings";
import {
  absoluteSeoImage,
  resolveSeoFields,
  type ResolvedSeoFields,
} from "../../shared/lib/blogSeo";
import { siteSeoRules, resolveBlogSEO, fixedPageFacts } from "./publicBlogSEO";
import { readPageSeo, readTopicSeo } from "./blogSiteSettings";
import { publicationTitle, publicationSummary } from "./publication";
import { publicIndex, publicTopics } from "./publicBlog";

export type SeoPreviewSide = {
  /** 覆盖值（内容显式填写的字段），留空即继承。 */
  override: ReturnType<typeof readArticleSeo>;
  /** 解析后的最终值：标题 / 描述 / 图片 / 图片说明 + 每项来自哪一级。 */
  resolved: ResolvedSeoFields;
};

export type SeoPreviewPayload = {
  kind: "article" | "topic" | "page";
  /** 文章 / 专题 / 固定页面在管理端的稳定标识 */
  id: string;
  /** 公开路径 */
  path: string;
  /** 只读 canonical；未发布且还没有发布标识时为空 */
  canonical: string;
  /** 列表里展示用的标题 */
  label: string;
  /** 公开状态说明 */
  status: { isPublished: boolean; version: number; updatedAt?: Date };
  /** 待发布（草稿）解析结果 */
  draft: SeoPreviewSide;
  /** 当前公开解析结果；内容尚未公开时为空 */
  published: SeoPreviewSide | null;
  /** 公开页面当前的真实输出（与公开站逐字一致） */
  live: { title: string; description: string; image: string; imageAlt: string; canonical: string; robots: string } | null;
  /** 待发布侧的内容事实（公开标题 / 概要 / 封面），管理端用它算「清空覆盖会继承什么」。 */
  content: { title: string; summary: string; coverUrl: string };
  /** 当前公开侧的内容事实 */
  publishedContent: { title: string; summary: string; coverUrl: string } | null;
  /** 保存用的乐观锁版本号（专题 / 固定页面用）。 */
  revision: string;
  /** 清空覆盖后的继承值：管理端用它显示「继承时实际会展示什么」。 */
  inherited: ResolvedSeoFields;
  /** 当前公开侧的继承值。 */
  publishedInherited: ResolvedSeoFields | null;
};

/** 正文兜底摘要：和公开站一样剥掉标签后截断。 */
function contentExcerpt(content: string, limit = 180) {
  const text = (content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, limit);
}

/** 正文兜底标题：取第一行或第一个标题。 */
function contentTitle(content: string) {
  const raw = (content || "").trim();
  if (!raw) return "";
  const heading = raw.match(/^#{1,6}\s+(.+)$/m);
  if (heading) return heading[1].trim().slice(0, 200);
  const line = raw.split("\n").find((l) => l.trim());
  return (line || "").replace(/<[^>]+>/g, "").trim().slice(0, 200);
}

function absolutize(fields: ResolvedSeoFields, origin: string): ResolvedSeoFields {
  return {
    ...fields,
    image: absoluteSeoImage(fields.image, origin),
  };
}

/**
 * 文章 SEO 预览。
 *
 * 「当前公开」直接复用公开站的解析结果（resolveBlogSEO），保证预览与线上逐字一致；
 * 「待发布」用草稿侧的标题 / 摘要 / 封面 + 草稿覆盖值，走同一套继承规则。
 */
export async function previewArticleSeo(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  origin: string,
): Promise<SeoPreviewPayload | null> {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    include: {
      publication: {
        include: {
          coverAttachment: { select: { path: true } },
          draftCoverAttachment: { select: { path: true } },
        },
      },
    },
  });
  if (!note) return null;
  const { rules } = await siteSeoRules(db, accountId);
  const publication = note.publication;
  const draftTitle =
    publicationTitle(note.metadata) || contentTitle(note.content) || "无标题";
  const draftSummary = publicationSummary(note.metadata);
  const draftCover =
    publication?.draftCoverAttachment?.path ??
    publication?.coverAttachment?.path ??
    null;

  const draftInherited = absolutize(
    resolveSeoFields({
      override: null,
      content: {
        title: draftTitle,
        summary: draftSummary || null,
        coverUrl: draftCover,
      },
      site: rules,
      fallbackTitle: draftTitle,
      fallbackDescription: draftSummary || contentExcerpt(note.content),
      defaultImage: origin + "/icons/Square310x310Logo.png",
    }),
    origin,
  );
  const draft = absolutize(
    resolveSeoFields({
      override: readArticleSeo(note.metadata),
      content: {
        title: draftTitle,
        summary: draftSummary || null,
        coverUrl: draftCover,
      },
      site: rules,
      fallbackTitle: draftTitle,
      fallbackDescription: draftSummary || contentExcerpt(note.content),
      defaultImage: origin + "/icons/Square310x310Logo.png",
    }),
    origin,
  );

  const publishId = note.publishId ?? null;
  const path = publishId ? "/blog/" + publishId : "/blog";
  let live: SeoPreviewPayload["live"] = null;
  let published: SeoPreviewSide | null = null;
  let publishedInherited: ResolvedSeoFields | null = null;
  if (note.isPublished && publishId) {
    const seo = await resolveBlogSEO(db, path, origin, accountId);
    if (seo.status === 200) {
      live = {
        title: seo.title,
        description: seo.description,
        image: seo.image,
        imageAlt: seo.imageAlt,
        canonical: seo.canonical,
        robots: seo.robots,
      };
      publishedInherited = absolutize(
        resolveSeoFields({
          override: null,
          content: {
            title: publication?.title || draftTitle,
            summary: publication?.summary || null,
            coverUrl: publication?.coverAttachment?.path ?? null,
          },
          site: rules,
          fallbackTitle: publication?.title || draftTitle,
          fallbackDescription:
            publication?.summary || contentExcerpt(note.content),
          defaultImage: origin + "/icons/Square310x310Logo.png",
        }),
        origin,
      );
      published = {
        override: readArticleSeo(note.metadata, true),
        resolved: absolutize(
          resolveSeoFields({
            override: readArticleSeo(note.metadata, true),
            content: {
              title: publication?.title || draftTitle,
              summary: publication?.summary || null,
              coverUrl: publication?.coverAttachment?.path ?? null,
            },
            site: rules,
            fallbackTitle: publication?.title || draftTitle,
            fallbackDescription:
              publication?.summary || contentExcerpt(note.content),
            defaultImage: origin + "/icons/Square310x310Logo.png",
          }),
          origin,
        ),
      };
    }
  }

  return {
    kind: "article",
    id: String(note.id),
    path,
    canonical: publishId ? origin + path : "",
    label: draftTitle,
    status: {
      isPublished: note.isPublished,
      version: publication?.revision ?? 0,
      updatedAt: note.updatedAt,
    },
    draft: { override: readArticleSeo(note.metadata), resolved: draft },
    published,
    live,
    revision: "",
    inherited: draftInherited,
    publishedInherited,
    content: {
      title: draftTitle,
      summary: draftSummary,
      coverUrl: draftCover ?? "",
    },
    publishedContent: publication
      ? {
          title: publication.title,
          summary: publication.summary ?? "",
          coverUrl: publication.coverAttachment?.path ?? "",
        }
      : null,
  };
}

/**
 * 专题 SEO 预览。
 *
 * 专题 SEO 保存后立即生效，没有草稿 / 公开之分，
 * 所以「当前」就是公开站此刻会输出的内容。
 */
export async function previewTopicSeo(
  db: PrismaClient,
  accountId: number,
  topicId: number,
  origin: string,
): Promise<SeoPreviewPayload | null> {
  const topic = await db.blogTopic.findFirst({
    where: { id: topicId, accountId },
    include: { cover: { select: { path: true } } },
  });
  if (!topic) return null;
  const { rules } = await siteSeoRules(db, accountId);
  const path = "/blog/t/" + topic.slug;
  // 专题封面可能来自成员文章推导，公开站用的是推导后的那张，预览要一致。
  const publicList = await publicTopics(db, accountId);
  const coverUrl =
    publicList.find((t) => t.slug === topic.slug)?.coverUrl ??
    topic.cover?.path ??
    null;
  const override = readArticleSeo(
    (
      await db.config.findFirst({
        where: { key: "blogTopicSeo:" + topic.id, userId: accountId },
        orderBy: { id: "asc" },
        select: { config: true },
      })
    )?.config ?? {},
  );
  const inherited = absolutize(
    resolveSeoFields({
      override: null,
      content: {
        title: topic.name,
        summary: null,
        coverUrl,
      },
      site: rules,
      fallbackTitle: topic.name,
      fallbackDescription: topic.desc || topic.name + "专题文章",
      defaultImage: origin + "/icons/Square310x310Logo.png",
    }),
    origin,
  );
  const resolved = absolutize(
    resolveSeoFields({
      override,
      content: {
        title: topic.name,
        summary: null,
        coverUrl,
      },
      site: rules,
      fallbackTitle: topic.name,
      fallbackDescription: topic.desc || topic.name + "专题文章",
      defaultImage: origin + "/icons/Square310x310Logo.png",
    }),
    origin,
  );
  let live: SeoPreviewPayload["live"] = null;
  if (topic.isPublished) {
    const seo = await resolveBlogSEO(db, path, origin, accountId);
    if (seo.status === 200)
      live = {
        title: seo.title,
        description: seo.description,
        image: seo.image,
        imageAlt: seo.imageAlt,
        canonical: seo.canonical,
        robots: seo.robots,
      };
  }
  return {
    kind: "topic",
    id: String(topic.id),
    path,
    canonical: origin + path,
    label: topic.name,
    status: { isPublished: topic.isPublished, version: 0 },
    draft: { override, resolved },
    published: topic.isPublished ? { override, resolved } : null,
    live,
    revision: (await readTopicSeo(db, accountId, topic.id)).revision,
    inherited,
    publishedInherited: inherited,
    content: {
      title: topic.name,
      summary: topic.desc || "",
      coverUrl: coverUrl ?? "",
    },
    publishedContent: topic.isPublished
      ? { title: topic.name, summary: topic.desc || "", coverUrl: coverUrl ?? "" }
      : null,
  };
}

/**
 * 固定页面（首页 / 专题索引 / 关于页）的 SEO 预览。
 *
 * 固定页面不是伪文章，只在内容选择栏里作为独立类型出现。
 * 它们没有草稿 / 公开之分，「当前」就是公开站此刻的输出。
 */
export async function previewPageSeo(
  db: PrismaClient,
  accountId: number,
  key: "home" | "topics" | "about" | "friends" | "moments" | "subscribe",
  origin: string,
): Promise<SeoPreviewPayload | null> {
  const site = await publicIndex(db, { accountId });
  const facts = fixedPageFacts(site, key);
  const { rules } = await siteSeoRules(db, accountId);
  const storedPage = await readPageSeo(db, accountId);
  const override = storedPage.data[key] ?? readArticleSeo({});
  const pageDefaultImage = facts.fallbackImage
    ? absoluteSeoImage(facts.fallbackImage, origin)
    : origin + "/icons/Square310x310Logo.png";
  const inherited = absolutize(
    resolveSeoFields({
      override: null,
      content: { title: null, summary: null, coverUrl: null },
      site: rules,
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      defaultImage: pageDefaultImage,
    }),
    origin,
  );
  const resolved = absolutize(
    resolveSeoFields({
      override,
      content: { title: null, summary: null, coverUrl: null },
      site: rules,
      fallbackTitle: facts.fallbackTitle,
      fallbackDescription: facts.fallbackDescription,
      defaultImage: pageDefaultImage,
    }),
    origin,
  );
  let live: SeoPreviewPayload["live"] = null;
  const seo = await resolveBlogSEO(db, facts.path, origin, accountId);
  if (seo.status === 200)
    live = {
      title: seo.title,
      description: seo.description,
      image: seo.image,
      imageAlt: seo.imageAlt,
      canonical: seo.canonical,
      robots: seo.robots,
    };
  return {
    kind: "page",
    id: key,
    path: facts.path,
    canonical: origin + facts.path,
    label: facts.label,
    status: { isPublished: seo.status === 200, version: 0 },
    draft: { override, resolved },
    published: live ? { override, resolved } : null,
    live,
    revision: storedPage.revision,
    inherited,
    publishedInherited: inherited,
    content: { title: "", summary: "", coverUrl: "" },
    publishedContent: live ? { title: "", summary: "", coverUrl: "" } : null,
  };
}
