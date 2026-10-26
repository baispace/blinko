import { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "node:crypto";
import {
  publicationChanges,
  publicationSummary,
  publicationTitle,
  contentVersion,
  publishSnapshot,
} from "./publication";
import { deriveTitle, readDraftBody } from "./blogPublishCheck";
import {
  sanitizeAboutTopicIds,
  sanitizeFeaturedPosts,
  sanitizeSpaceIntro,
} from "./blogAboutConfig";
import { publicText } from "./publicText";
import { publicSubscribeQrPaths } from "./blogSiteSettings";
import {
  normalizePublicTags,
  readDraftPublicTags,
  rememberPublicTags,
} from "./blogPublicTags";
import {
  normalizeCoverFocus,
  type CoverFocusValue,
} from "@shared/lib/blogCover";
import {
  normalizeTopicDefaultNoteId,
  normalizeTopicDisplayMode,
  type TopicDisplayMode,
} from "@shared/lib/blogTopicMode";

/**
 * 博客管理的数据层。与 note.ts 的列表逻辑分开，便于直接写测试。
 *
 * 贯穿的原则和 publication.ts 一致：公开面只暴露作者显式选择公开的内容，
 * 私有标签树、附件列表、账号身份都不参与 join。
 */

export type BlogLink = { label: string; url: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** 非抛出的 slug 化：没有可用 ascii 片段时返回空串，由调用方决定兜底。 */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSlug(input: string): string {
  const slug = slugify(input);
  if (!slug)
    throw new TRPCError({ code: "BAD_REQUEST", message: "专题标识不能为空" });
  return slug;
}

/**
 * 中文名没有可用的 ascii 片段，硬转出来是空串而不是合法标识 —— 这时回退到
 * 随机后缀，而不是让用户面对一个无从下手的校验错误。
 */
export function slugOrFallback(name: string, slugInput?: string): string {
  const explicit = (slugInput ?? "").trim();
  if (explicit) {
    if (!SLUG_RE.test(explicit)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "专题标识只能包含小写字母、数字和连字符",
      });
    }
    return explicit;
  }
  return slugify(name) || `topic-${randomBytes(3).toString("hex")}`;
}

export function assertHexColor(color: string) {
  if (color && !HEX_COLOR_RE.test(color)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "专题颜色需为 #RRGGBB 格式",
    });
  }
}

export function sanitizeLinks(input: unknown): BlogLink[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input))
    throw new TRPCError({ code: "BAD_REQUEST", message: "链接格式不正确" });
  if (input.length > 12)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "公开资料最多 12 个链接",
    });
  return input.slice(0, 12).map((raw) => {
    const link = raw as Partial<BlogLink>;
    const label = String(link?.label ?? "")
      .trim()
      .slice(0, 40);
    const url = String(link?.url ?? "")
      .trim()
      .slice(0, 300);
    if (!url)
      throw new TRPCError({ code: "BAD_REQUEST", message: "链接地址不能为空" });
    // 只允许 http(s)：公开页会把这些地址交给读者，javascript: 会变成注入面。
    if (!/^https?:\/\//i.test(url)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "链接需以 http:// 或 https:// 开头",
      });
    }
    return { label, url };
  });
}

export async function getBlogProfile(db: PrismaClient, accountId: number) {
  const existing = await db.blogProfile.findUnique({ where: { accountId } });
  if (existing)
    return {
      ...existing,
      links: (existing.links as unknown as BlogLink[]) ?? [],
      // Json 字段统一成数组，admin 端不用再自己判形状。
      featuredPosts: sanitizeFeaturedPosts(existing.featuredPosts),
      aboutTopicIds: sanitizeAboutTopicIds(existing.aboutTopicIds),
    };
  // 没有记录不等于不能填：返回一份默认草稿，让前端直接进编辑态。
  return {
    accountId,
    displayName: "",
    tagline: "",
    bio: "",
    avatarUrl: "",
    homepage: "",
    links: [],
    spaceIntro: "",
    signature: "",
    featuredPosts: [],
    aboutTopicIds: [],
    isPublished: false,
  };
}

export async function upsertBlogProfile(
  db: PrismaClient,
  accountId: number,
  input: {
    displayName: string;
    tagline: string;
    bio: string;
    avatarUrl: string;
    homepage: string;
    links?: unknown;
    /** 「关于这个空间」的站点说明，与个人介绍分开。 */
    spaceIntro?: string;
    /** 头像旁的简短签名。 */
    signature?: string;
    /** 作者精选：最多 3 篇公开文章 + 每篇一句推荐理由。 */
    featuredPosts?: unknown;
    /** 关于页展示的专题与顺序，最多 4 个。 */
    aboutTopicIds?: unknown;
    isPublished: boolean;
  },
) {
  const links = sanitizeLinks(input.links);
  if (input.homepage && !/^https?:\/\//i.test(input.homepage.trim())) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "个人主页需以 http:// 或 https:// 开头",
    });
  }
  const avatarUrl = input.avatarUrl.trim();
  if (avatarUrl) {
    if (/^\/api\/(?:file|s3file)\//.test(avatarUrl)) {
      const avatar = await db.attachments.findFirst({
        where: { path: avatarUrl, accountId },
      });
      if (!avatar || !/^image\//.test(avatar.type))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "头像必须是自己上传的图片",
        });
    } else {
      try {
        const url = new URL(avatarUrl);
        if (
          !["https:", "http:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.searchParams.has("token")
        )
          throw new Error();
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "头像地址需为公开图片网址或自己上传的图片",
        });
      }
    }
  }
  const data = {
    displayName: input.displayName.trim().slice(0, 80),
    tagline: input.tagline.trim().slice(0, 160),
    bio: input.bio.trim().slice(0, 5000),
    avatarUrl: input.avatarUrl.trim().slice(0, 500),
    homepage: input.homepage.trim().slice(0, 300),
    links: links as unknown as Prisma.InputJsonValue,
    // 关于页的三项配置。没传就保持原值 —— 老调用方只保存基本资料时不会误清空。
    ...(input.spaceIntro === undefined
      ? {}
      : { spaceIntro: sanitizeSpaceIntro(input.spaceIntro) }),
    ...(input.signature === undefined
      ? {}
      : { signature: String(input.signature).trim().slice(0, 80) }),
    ...(input.featuredPosts === undefined
      ? {}
      : {
          featuredPosts:
            sanitizeFeaturedPosts(input.featuredPosts) as unknown as Prisma.InputJsonValue,
        }),
    ...(input.aboutTopicIds === undefined
      ? {}
      : { aboutTopicIds: sanitizeAboutTopicIds(input.aboutTopicIds) }),
    isPublished: input.isPublished,
  };
  const saved = await db.blogProfile.upsert({
    where: { accountId },
    create: { accountId, ...data },
    update: data,
  });
  return { ...saved, links };
}

export async function listBlogTopics(db: PrismaClient, accountId: number) {
  const topics = await db.blogTopic.findMany({
    where: { accountId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: {
      notes: { select: { noteId: true, sortOrder: true } },
      cover: { select: { id: true, path: true, name: true, type: true } },
    },
  });
  return topics.map((topic) => ({
    ...topic,
    noteIds: [...topic.notes]
      .sort((a, b) => a.sortOrder - b.sortOrder || a.noteId - b.noteId)
      .map((n) => n.noteId),
  }));
}

/**
 * 专题封面必须是本人账号下的图片附件。
 * 附件可能被别的账号共用路径，这里按 accountId 再兜一次。
 */
export async function assertTopicCover(
  db: PrismaClient,
  accountId: number,
  attachmentId: number | null | undefined,
) {
  if (attachmentId === undefined || attachmentId === null) return;
  const image = await db.attachments.findFirst({
    where: { id: attachmentId, accountId },
    select: { id: true, type: true },
  });
  if (!image || !/^image\/(?:png|jpeg|webp|gif|avif)$/.test(image.type))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "专题封面必须是本人上传的图片文件",
    });
}

/**
 * 专题父子关系校验。
 *
 * 树不能成环：把专题挂到自己的子孙下面会让公开页的树渲染死循环。
 * 逐级往上找，遇到自己就报错。
 */
export async function assertTopicParent(
  db: PrismaClient,
  accountId: number,
  topicId: number | null,
  parentId: number | null | undefined,
) {
  if (parentId === undefined) return;
  if (parentId === null) return; // 移到顶级
  if (parentId === topicId)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "专题不能把自己设为上级专题",
    });
  const parent = await db.blogTopic.findFirst({
    where: { id: parentId, accountId },
    select: { id: true },
  });
  if (!parent)
    throw new TRPCError({ code: "NOT_FOUND", message: "上级专题不存在" });

  // 方向一：向上走 —— 新父级的祖先里不能有自己（把自己挂到子下面）。
  let cursor: number | null = parentId;
  const seenUp = new Set<number>();
  while (cursor) {
    if (cursor === topicId)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "不能把专题挂到它自己的下级专题下",
      });
    if (seenUp.has(cursor)) break;
    seenUp.add(cursor);
    const node: { parentId: number | null } | null =
      await db.blogTopic.findFirst({
        where: { id: cursor, accountId },
        select: { parentId: true },
      });
    cursor = node?.parentId ?? null;
  }

  // 方向二：向下走 —— 新父级不能是自己的子孙
  // （把孙专题挂到祖辈下：祖辈→子→孙→祖辈，成环）。
  if (topicId !== null) {
    const queue: number[] = [topicId];
    const seenDown = new Set<number>();
    while (queue.length) {
      const current = queue.shift()!;
      if (seenDown.has(current)) continue;
      seenDown.add(current);
      const children = await db.blogTopic.findMany({
        where: { accountId, parentId: current },
        select: { id: true },
      });
      for (const child of children) {
        if (child.id === parentId)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "不能把专题挂到它自己的上级专题下",
          });
        queue.push(child.id);
      }
    }
  }
}

/**
 * 默认打开的文章必须真的能用。
 *
 * 三件事同时成立才算数：还在这个专题的编排里、文章已发布、公开快照存在。
 * 少一条就当作「没指定」—— 前台会自动打开编排中的第一篇公开文章，
 * 不会因为一条失效的设置让专题页报错或反复跳转。
 */
async function isTopicDefaultNoteUsable(
  db: PrismaClient,
  accountId: number,
  topicId: number,
  noteId: number,
) {
  const note = await db.notes.findFirst({
    where: {
      id: noteId,
      accountId,
      isPublished: true,
      isRecycle: false,
      publication: { isNot: null },
      blogTopics: { some: { topicId } },
    },
    select: { id: true },
  });
  return !!note;
}

export async function createBlogTopic(
  db: PrismaClient,
  accountId: number,
  input: {
    name: string;
    slug?: string;
    desc: string;
    color: string;
    isPublished: boolean;
    parentId?: number | null;
    showInNav?: boolean;
    isFeatured?: boolean;
    coverTitle?: string;
    coverAttachmentId?: number | null;
    displayMode?: TopicDisplayMode;
    /** 文档模式默认打开的文章（notes.id）；新建专题还没有编排，先留空。 */
    defaultNoteId?: number | null;
  },
) {
  const name = input.name.trim();
  if (!name)
    throw new TRPCError({ code: "BAD_REQUEST", message: "专题名称不能为空" });
  assertHexColor(input.color);
  await assertTopicCover(db, accountId, input.coverAttachmentId);
  const slug = slugOrFallback(name, input.slug);
  const clash = await db.blogTopic.findUnique({
    where: { accountId_slug: { accountId, slug } },
  });
  if (clash)
    throw new TRPCError({
      code: "CONFLICT",
      message: `标识「${slug}」已被占用`,
    });
  await assertTopicParent(db, accountId, null, input.parentId);
  const last = await db.blogTopic.findFirst({
    where: { accountId, parentId: input.parentId ?? null },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
  });
  return db.blogTopic.create({
    data: {
      accountId,
      name: name.slice(0, 60),
      slug,
      desc: input.desc.trim().slice(0, 500),
      color: input.color,
      isPublished: input.isPublished,
      parentId: input.parentId ?? null,
      showInNav: input.showInNav ?? true,
      isFeatured: input.isFeatured ?? false,
      coverTitle: (input.coverTitle ?? "").trim().slice(0, 24),
      coverAttachmentId: input.coverAttachmentId ?? null,
      // 新建专题默认专题模式；作者当场选了文档模式就用作者选的。
      displayMode: normalizeTopicDisplayMode(input.displayMode),
      // 新建专题还没有章节编排，默认文章无处可选 —— 先留空。
      defaultNoteId: null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateBlogTopic(
  db: PrismaClient,
  accountId: number,
  id: number,
  input: {
    name?: string;
    slug?: string;
    desc?: string;
    color?: string;
    isPublished?: boolean;
    parentId?: number | null;
    showInNav?: boolean;
    isFeatured?: boolean;
    coverTitle?: string;
    coverAttachmentId?: number | null;
    displayMode?: TopicDisplayMode;
    /** 文档模式默认打开的文章（notes.id）；传 null 表示改回「自动」。 */
    defaultNoteId?: number | null;
  },
) {
  const topic = await db.blogTopic.findFirst({ where: { id, accountId } });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  await assertTopicCover(db, accountId, input.coverAttachmentId);
  const patch: Prisma.blogTopicUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name)
      throw new TRPCError({ code: "BAD_REQUEST", message: "专题名称不能为空" });
    patch.name = name.slice(0, 60);
  }
  if (input.slug !== undefined && input.slug.trim()) {
    const slug = slugOrFallback(topic.name, input.slug);
    if (slug !== topic.slug) {
      const clash = await db.blogTopic.findUnique({
        where: { accountId_slug: { accountId, slug } },
      });
      if (clash)
        throw new TRPCError({
          code: "CONFLICT",
          message: `标识「${slug}」已被占用`,
        });
      patch.slug = slug;
    }
  }
  if (input.desc !== undefined) patch.desc = input.desc.trim().slice(0, 500);
  if (input.color !== undefined) {
    assertHexColor(input.color);
    patch.color = input.color;
  }
  if (input.isPublished !== undefined) patch.isPublished = input.isPublished;
  if (input.showInNav !== undefined) patch.showInNav = input.showInNav;
  if (input.isFeatured !== undefined) patch.isFeatured = input.isFeatured;
  if (input.coverTitle !== undefined)
    patch.coverTitle = input.coverTitle.trim().slice(0, 24);
  // 展示方式只是「怎么排版」，字段级更新：不会碰到封面、文章关系与章节编排。
  if (input.displayMode !== undefined)
    patch.displayMode = normalizeTopicDisplayMode(input.displayMode);
  /**
   * 默认打开的文章：存之前先校验一次。
   *
   * 失效不报错 —— 悄悄退回「自动选择第一篇公开文章」，
   * 免得作者只改个名字却因为一条过期设置保存不下去。
   * 真正生效的默认值由前台读取时再校验一次。
   */
  if (input.defaultNoteId !== undefined) {
    const wanted = normalizeTopicDefaultNoteId(input.defaultNoteId);
    const usable = wanted
      ? await isTopicDefaultNoteUsable(db, accountId, id, wanted)
      : false;
    patch.defaultNote = usable
      ? { connect: { id: wanted as number } }
      : { disconnect: true };
  }
  if (input.coverAttachmentId !== undefined)
    patch.cover =
      input.coverAttachmentId === null
        ? { disconnect: true }
        : { connect: { id: input.coverAttachmentId } };
  if (input.parentId !== undefined) {
    await assertTopicParent(db, accountId, id, input.parentId);
    // 置空关系用 disconnect —— Prisma 的关系输入不接受 null。
    patch.parent =
      input.parentId === null
        ? { disconnect: true }
        : { connect: { id: input.parentId } };
  }
  return db.blogTopic.update({ where: { id }, data: patch });
}

export async function deleteBlogTopic(
  db: PrismaClient,
  accountId: number,
  id: number,
) {
  const topic = await db.blogTopic.findFirst({ where: { id, accountId } });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  // blogTopicNote 是 cascade，专题删除后笔记本身不受影响。
  await db.blogTopic.delete({ where: { id } });
  return true;
}

/** 归一化同级专题顺序为 0..n-1，避免像 tag 的 sortOrder 那样出现并列与负数。 */
export async function reorderBlogTopics(
  db: PrismaClient,
  accountId: number,
  orderedIds: number[],
) {
  const owned = await db.blogTopic.findMany({
    where: { accountId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((t) => t.id));
  const unique = [...new Set(orderedIds)].filter((id) => ownedIds.has(id));
  if (!unique.length)
    throw new TRPCError({ code: "BAD_REQUEST", message: "没有可排序的专题" });
  const complete = [
    ...unique,
    ...owned.map((t) => t.id).filter((id) => !unique.includes(id)),
  ];
  await db.$transaction(
    complete.map((id, index) =>
      db.blogTopic.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  return listBlogTopics(db, accountId);
}

/** 只允许把已发布笔记放进专题：未发布的内容不该出现在公开分组里。 */
export async function assignTopicNotes(
  db: PrismaClient,
  accountId: number,
  topicId: number,
  noteIds: number[],
) {
  const topic = await db.blogTopic.findFirst({
    where: { id: topicId, accountId },
  });
  if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "专题不存在" });
  const wanted = [...new Set(noteIds)].filter(
    (id) => Number.isInteger(id) && id > 0,
  );
  if (wanted.length) {
    const published = await db.notes.count({
      where: {
        id: { in: wanted },
        accountId,
        isPublished: true,
        isRecycle: false,
        publication: { isNot: null },
      },
    });
    if (published !== wanted.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "只能把已发布且未删除的笔记放进专题",
      });
    }
  }
  await db.$transaction([
    db.blogTopicNote.deleteMany({
      where: { topicId, noteId: { notIn: wanted } },
    }),
    ...wanted.map((noteId, index) =>
      db.blogTopicNote.upsert({
        where: { topicId_noteId: { topicId, noteId } },
        create: { topicId, noteId, sortOrder: index },
        update: { sortOrder: index },
      }),
    ),
  ]);
  return listBlogTopics(db, accountId);
}

/**
 * 设置公开封面。附件必须属于该笔记 —— 否则可以把封面指向任意附件，
 * 等于用别人的图片给自己撑门面。撤回后封面随之失效。
 */
export async function setPublicationCover(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  attachmentId: number | null,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    include: { publication: true },
  });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
  if (!note.publication)
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先发布这篇笔记" });
  if (attachmentId !== null) {
    const attachment = await db.attachments.findFirst({
      where: { id: attachmentId, noteId },
    });
    if (!attachment)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "封面附件必须属于这篇笔记",
      });
    if (
      !/^image\/(?:png|jpeg|webp|gif|avif)$/.test(attachment.type) ||
      Number(attachment.size) > 10 * 1024 * 1024
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "封面必须是图片附件",
      });
  }
  await db.notePublication.update({
    where: { noteId },
    data: { draftCoverAttachmentId: attachmentId },
  });
  return db.notePublication.findUnique({
    where: { noteId },
    select: {
      coverAttachmentId: true,
      draftCoverAttachmentId: true,
      revision: true,
    },
  });
}

/**
 * 「加入推荐页 banner」开关与它的位置。
 *
 * 与「推荐置顶」（isFeatured）是两个独立开关，互不替代：
 *   isFeatured —— 只影响首页「推荐」流里的排序，置顶文章排在普通推荐之前；
 *   isBanner   —— 决定这篇文章进不进首页顶部那块 banner。
 *
 * 位置也各自独立：featuredOrder 管置顶顺序，bannerOrder 管 banner 顺序。
 * 之前 banner 借用 featuredOrder 排序，一篇文章没法既置顶在第 1 位、
 * 又排在 banner 第 3 位。
 *
 * 两者都是运营配置：保存后立即生效，不触发正文发布，也不增加公开版本号。
 * 撤回文章时 banner 自然不再展示（公开读只取已发布内容）。
 */
export async function setPublicationBanner(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  isBanner: boolean,
  bannerOrder?: number,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId },
    select: { id: true, publication: { select: { noteId: true } } },
  });
  if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在" });
  if (!note.publication)
    throw new TRPCError({ code: "BAD_REQUEST", message: "请先发布这篇笔记" });
  await db.notePublication.update({
    where: { noteId },
    data: {
      isBanner,
      ...(bannerOrder !== undefined ? { bannerOrder } : {}),
    },
  });
  return { noteId, isBanner, bannerOrder };
}

/**
 * 封面在各展示位的裁切位置。
 *
 * 一张 1600×900 的源图要同时给双栏（2.8:1）、单栏（16:9）、Banner（2.9:1）用，
 * 比例不同、裁掉的位置不同，所以每个展示位各存一份裁切。
 *
 * 存的时候记着 sourceId —— 换源图后这份裁切就对不上了，
 * 公开站会当没调过（回到居中），后台也会显示为已重置。
 *
 * 裁切位置会被夹回安全范围：核心内容区（居中 1280×450）永远完整可见，
 * 只有背景装饰能被裁掉。
 */
/**
 * 写入草稿的标题与摘要。
 *
 * 公开页面读的是快照，所以这里只改草稿：要点「更新发布」才会对外生效，
 * 和正文改动的语义保持一致。metadata 是浅合并 —— 不能整块覆盖，
 * 否则 expireAt、aiSourceMessageId 这些字段会被抹掉。
 */
export async function saveNoteCopy(
  db: PrismaClient,
  accountId: number,
  input: {
    noteId: number;
    title?: string;
    summary?: string;
    /** 公开标签：与私有笔记标签分开。 */
    publicTags?: string[];
    /**
     * 乐观锁：调用方带上读到的笔记更新时间。
     * AI 候选是异步生成的，返回时正文可能已经被改过 —— 这时把旧候选写进去
     * 就等于用陈旧内容覆盖新内容，宁可失败让用户重新生成。
     */
    expectedUpdatedAt?: Date;
    /**
     * 正文版本指纹：AI 候选按哪一版正文生成，就带哪一版指纹。
     * 正文被改过就拒绝对应的候选；改标题/摘要/标签不影响。
     */
    expectedContentVersion?: string;
  },
) {
  const note = await db.notes.findFirst({
    where: { id: input.noteId, accountId, isRecycle: false },
    select: { id: true, metadata: true, updatedAt: true, content: true, type: true },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "文章不存在或无权修改" });
  if (
    input.expectedUpdatedAt &&
    note.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "文章已变化，请重新生成候选后再应用",
    });
  if (
    input.expectedContentVersion &&
    // 与生成时同一口径：候选是按「将要发布的正文」生成的，
    // 草稿分叉后原笔记正文已经不是那份了，拿它比会永远对不上。
    input.expectedContentVersion !==
      contentVersion(readDraftBody(note.metadata, note.content).content, note.type)
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "正文已变化，请重新生成候选后再应用",
    });
  const current = (note.metadata ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...current };
  if (input.title !== undefined) next.title = input.title.trim().slice(0, 200);
  if (input.summary !== undefined)
    next.summary = input.summary.trim().slice(0, 2000);
  if (input.publicTags !== undefined)
    next.blogPublicTags = normalizePublicTags(input.publicTags);
  await db.notes.update({
    where: { id: note.id },
    data: { metadata: next as unknown as Prisma.InputJsonValue },
  });
  if (input.publicTags !== undefined)
    await rememberPublicTags(db, accountId, input.publicTags);
  return {
    id: note.id,
    title: typeof next.title === "string" ? next.title : "",
    summary: typeof next.summary === "string" ? next.summary : "",
    publicTags: normalizePublicTags(
      input.publicTags ?? readDraftPublicTags(note.metadata),
    ),
  };
}

/** 管理页用的已发布列表：带封面、专题、草稿是否领先公开版本。 */
export async function listPublishedForManage(
  db: PrismaClient,
  accountId: number,
) {
  const notes = await db.notes.findMany({
    where: {
      accountId,
      isRecycle: false,
      OR: [
        // 已发布或曾发布：有过公开版本的文章。
        { publication: { isNot: null } },
        // 草稿箱：作者主动放进内容管理、但还没公开过的笔记。
        // 标记写在 metadata 上，不为一个列表筛选去改表结构。
        { metadata: { path: ["blogDraft"], equals: true } },
      ],
    },
    orderBy: [{ isPublished: "desc" }, { updatedAt: "desc" }],
    include: {
      publication: {
        select: {
          title: true,
          summary: true,
          content: true,
          type: true,
          revision: true,
          updatedAt: true,
          // 首次发布时间：列表的「最近发布 / 发布时间」排序与展示要用。
          createdAt: true,
          coverAttachmentId: true,
          draftCoverAttachmentId: true,
          // 首页精选位：列表行要显示勾选状态。
          isFeatured: true,
          featuredOrder: true,
          // 加入推荐页 banner：与「推荐置顶」是两个独立开关，位置也各自独立。
          isBanner: true,
          bannerOrder: true,
          // 已发布的公开标签快照。
          publicTags: true,
        },
      },
      attachments: {
        select: {
          id: true,
          name: true,
          path: true,
          type: true,
          sortOrder: true,
        },
      },
      blogTopics: {
        select: {
          topic: { select: { id: true, name: true, color: true } },
          // 章节归属：文章在每个专题里各自落在哪一章。
          sectionId: true,
        },
      },
    },
  });
  return notes.map((note) => {
    const { blogTopics, ...rest } = note;
    const changes = publicationChanges(note);
    return {
      ...rest,
      topicIds: blogTopics.map((t) => t.topic.id),
      topics: blogTopics.map((t) => ({
        ...t.topic,
        sectionId: t.sectionId,
      })),
      // 草稿态公开标签：管理页看到的待发布标签。
      draftPublicTags: readDraftPublicTags(note.metadata),
      // 与发布检查共用字段级比较，涵盖标题、摘要、正文、类型、封面与公开标签。
      // 不能比 updatedAt —— 发布动作本身会写 notes 行，刚发布完就会误报。
      hasDraftChanges: changes.length > 0,
      // 具体改了哪些字段：列表行要写「正文、摘要已修改」这样的说明。
      changes,
      // 列表行的摘要：与公开站卡片用的是同一套逻辑，管理页看到的就是读者看到的。
      excerpt:
        rest.publication?.summary?.trim() ||
        publicationSummary(note.metadata) ||
        publicText(rest.publication?.content ?? note.content ?? "").slice(0, 120),
      /*
       * 规范化后的展示字段。
       *
       * 草稿箱里的笔记没有公开版本（publication 为空），
       * 前端不该再自己去 publication 里掏字段 —— 掏一次是 null，两处代码两套判断。
       * 标题、版本号、草稿标记都在服务端算好，列表只管显示。
       */
      title:
        publicationTitle(note.metadata) ||
        deriveTitle(note.content) ||
        "无标题",
      revision: note.publication?.revision ?? 0,
      // 草稿箱里的笔记：只有草稿，没有公开版本。
      isDraft: !note.publication,
    };
  });
}

/**
 * 草稿箱标记的键名。
 *
 * 内容管理需要一个"草稿"桶：作者把一篇笔记放进博客的待办里，但还没决定发布。
 * 库里没有专门的字段，用 notes.metadata 上的一个标记位表示。
 */
const BLOG_DRAFT_FLAG = "blogDraft";

/** 把笔记放进 / 移出博客草稿箱。 */
export async function setBlogDraftFlag(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  enabled: boolean,
) {
  const note = await db.notes.findFirst({
    where: { id: noteId, accountId, isRecycle: false },
    select: { id: true, metadata: true },
  });
  if (!note)
    throw new TRPCError({ code: "NOT_FOUND", message: "笔记不存在或无权修改" });
  const current = (note.metadata ?? {}) as Record<string, unknown>;
  const next = { ...current };
  if (enabled) next[BLOG_DRAFT_FLAG] = true;
  else delete next[BLOG_DRAFT_FLAG];
  await db.notes.update({
    where: { id: note.id },
    data: { metadata: next as unknown as Prisma.InputJsonValue },
  });
  return { noteId: note.id, inDrafts: enabled };
}

/**
 * 批量发布 / 撤回。
 *
 * 为什么不在前端循环调用单篇接口：
 *   那样要发 N 个请求，而且每一篇都带着列表页那份旧快照。
 *   这里服务端逐篇重新读最新状态再写 —— 列表页打开后再改的正文，
 *   批量发布时用的是改过之后的那一版。
 *
 * 单篇失败不影响其它篇：返回逐篇结果，界面把成功的和失败的分开说。
 */
export async function bulkPublishAction(
  db: PrismaClient,
  accountId: number,
  input: { noteIds: number[]; action: "publish" | "withdraw" },
) {
  const ids = [...new Set(input.noteIds)].slice(0, 50);
  const results: { noteId: number; ok: boolean; message?: string }[] = [];
  for (const id of ids) {
    try {
      if (input.action === "withdraw") {
        await publishSnapshot(db, accountId, { id, isCancel: true });
      } else {
        await publishSnapshot(db, accountId, { id });
      }
      results.push({ noteId: id, ok: true });
    } catch (e) {
      results.push({
        noteId: id,
        ok: false,
        message: e instanceof Error ? e.message : "操作失败",
      });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    results,
    okCount: results.length - failed.length,
    failCount: failed.length,
  };
}

/** Atomic topic form save: metadata and ordered membership change together. */
export async function saveBlogTopic(
  db: PrismaClient,
  accountId: number,
  input: {
    id?: number;
    name: string;
    slug?: string;
    desc: string;
    color: string;
    isPublished: boolean;
    noteIds?: number[];
    parentId?: number | null;
    showInNav?: boolean;
    isFeatured?: boolean;
    coverTitle?: string;
    coverAttachmentId?: number | null;
    displayMode?: TopicDisplayMode;
    /** 文档模式默认打开的文章（notes.id）；传 null 表示改回「自动」。 */
    defaultNoteId?: number | null;
  },
) {
  return db.$transaction(async (tx) => {
    const topic = input.id
      ? await updateBlogTopic(
          tx as unknown as PrismaClient,
          accountId,
          input.id,
          input,
        )
      : await createBlogTopic(tx as unknown as PrismaClient, accountId, input);
    // Metadata-only saves must not overwrite a separately edited chapter arrangement.
    if (input.noteIds === undefined) return topic;
    // Existing withdrawn members may remain in the private arrangement, but
    // cannot be newly added. Public feeds filter them before pagination.
    const existing = await tx.blogTopicNote.findMany({
      where: { topicId: topic.id },
      select: { noteId: true, sectionId: true },
    });
    // 改专题基本信息时保留既有章节归属：章节编排由「保存编排」单独提交。
    const existingSections = new Map(
      existing.map((m) => [m.noteId, m.sectionId]),
    );
    const wanted = [...new Set(input.noteIds)];
    const allowed = await tx.notes.findMany({
      where: {
        accountId,
        isRecycle: false,
        publication: { isNot: null },
        id: { in: wanted },
        OR: [
          { isPublished: true },
          { id: { in: existing.map((n) => n.noteId) } },
        ],
      },
      select: { id: true },
    });
    if (allowed.length !== wanted.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "只能添加本人已发布的文章；移除已删除的文章后重试",
      });
    await tx.blogTopicNote.deleteMany({ where: { topicId: topic.id } });
    if (wanted.length)
      await tx.blogTopicNote.createMany({
        data: wanted.map((noteId, sortOrder) => ({
          topicId: topic.id,
          noteId,
          // 保留既有章节归属：改专题基本信息不该把作者的章节编排清空。
          sectionId: existingSections.get(noteId) ?? null,
          sortOrder,
        })),
      });
    return topic;
  });
}

/** Bind only an unassigned image owned by the uploader, never somebody else's file. */
export async function attachBlogCover(
  db: PrismaClient,
  accountId: number,
  noteId: number,
  path: string,
  expectedRevision?: number,
) {
  return db.$transaction(async (tx) => {
    const note = await tx.notes.findFirst({
      where: { id: noteId, accountId, isRecycle: false },
      include: { publication: true },
    });
    if (!note?.publication)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "文章不存在，请先发布正文",
      });
    const image = await tx.attachments.findFirst({
      where: { path, accountId, OR: [{ noteId: null }, { noteId }] },
    });
    if (
      !image ||
      !/^image\/(?:png|jpeg|webp|gif|avif)$/.test(image.type) ||
      Number(image.size) > 10 * 1024 * 1024
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "请选择本人上传的 PNG、JPEG、WebP、GIF 或 AVIF 图片，最大 10MB",
      });
    await tx.attachments.update({ where: { id: image.id }, data: { noteId } });
    const changed = await tx.notePublication.updateMany({
      where: {
        noteId,
        ...(expectedRevision !== undefined
          ? { revision: expectedRevision }
          : {}),
      },
      data: { draftCoverAttachmentId: image.id },
    });
    if (!changed.count)
      throw new TRPCError({
        code: "CONFLICT",
        message: "公开文章已更新，请基于最新内容重新生成封面。",
      });
    return { attachmentId: image.id };
  });
}

export async function isPublicBlogAsset(db: PrismaClient, path: string) {
  const images = await db.attachments.findMany({
    where: { path },
    select: {
      accountId: true,
      noteId: true,
      type: true,
      publicationCovers: {
        select: {
          noteId: true,
          note: { select: { isPublished: true, isRecycle: true } },
        },
      },
      // 派生分享图：它也是公开版本的一部分（og:image 要能匿名取到）。
      publicationShareCovers: {
        select: {
          noteId: true,
          note: { select: { isPublished: true, isRecycle: true } },
        },
      },
      // 动态里的图片：动态就是闪念，图片挂在闪念的附件上。
      // 闪念公开到动态流时，它就是公开内容的一部分。
      note: {
        select: {
          isMoment: true,
          momentPublishedAt: true,
          isRecycle: true,
        },
      },
    },
  });
  const candidates = images.filter((image) =>
    /^image\/(?:png|jpeg|webp|gif|avif)$/.test(image.type),
  );
  if (
    candidates.some((image) =>
      image.publicationCovers.some(
        (p) =>
          p.noteId === image.noteId && p.note.isPublished && !p.note.isRecycle,
      ),
    )
  )
    return true;
  if (
    candidates.some((image) =>
      image.publicationShareCovers.some(
        (p) =>
          p.noteId === image.noteId && p.note.isPublished && !p.note.isRecycle,
      ),
    )
  )
    return true;
  // 动态里的图片：动态已公开时匿名可读，撤回后立刻收回。
  if (
    candidates.some(
      (image) =>
        image.note?.isMoment === true &&
        !!image.note.momentPublishedAt &&
        image.note.isRecycle === false,
    )
  )
    return true;
  const owners = candidates.flatMap((image) =>
    image.accountId ? [image.accountId] : [],
  );
  if (!owners.length) return false;
  if (
    await db.blogProfile.findFirst({
      where: { accountId: { in: owners }, avatarUrl: path, isPublished: true },
      select: { accountId: true },
    })
  )
    return true;
  // 订阅页的公众号二维码：它也是公开素材，配置里登记了就算公开。
  const qrPaths = await publicSubscribeQrPaths(db, owners);
  return qrPaths.includes(path);
}

export async function publicBlogOwner(db: PrismaClient, accountId?: number) {
  if (accountId) return accountId;
  return (
    (
      await db.accounts.findFirst({
        where: { role: "superadmin" },
        orderBy: { id: "asc" },
        select: { id: true },
      })
    )?.id ?? -1
  );
}
