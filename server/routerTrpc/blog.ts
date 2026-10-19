import { router, authProcedure, publicProcedure } from '@server/middleware';
import { prisma } from '@server/prisma';
import { z } from 'zod';
import {
  getBlogProfile, upsertBlogProfile, listBlogTopics, createBlogTopic, updateBlogTopic,
  deleteBlogTopic, reorderBlogTopics, assignTopicNotes, setPublicationCover, listPublishedForManage,
  sanitizeLinks,
} from '../lib/blog';
import { publicPublicationDTO } from '../lib/publication';

const linkSchema = z.object({ label: z.string().max(40), url: z.string().max(300) });

export const blogRouter = router({
  /** 已发布文章的完整管理视图：封面、专题、草稿差异一次拿全。 */
  published: authProcedure
    .input(z.void())
    .query(({ ctx }) => listPublishedForManage(prisma, Number(ctx.id))),

  profile: authProcedure
    .input(z.void())
    .query(({ ctx }) => getBlogProfile(prisma, Number(ctx.id))),

  saveProfile: authProcedure
    .input(z.object({
      displayName: z.string().max(80),
      tagline: z.string().max(160),
      bio: z.string().max(5000),
      avatarUrl: z.string().max(500),
      homepage: z.string().max(300),
      links: z.array(linkSchema).max(12).optional(),
      isPublished: z.boolean(),
    }))
    .mutation(({ input, ctx }) => upsertBlogProfile(prisma, Number(ctx.id), input)),

  topics: authProcedure
    .input(z.void())
    .query(({ ctx }) => listBlogTopics(prisma, Number(ctx.id))),

  createTopic: authProcedure
    .input(z.object({
      name: z.string().min(1).max(60),
      slug: z.string().max(80).optional(),
      desc: z.string().max(500),
      color: z.string().max(16),
      isPublished: z.boolean(),
    }))
    .mutation(({ input, ctx }) => createBlogTopic(prisma, Number(ctx.id), input)),

  updateTopic: authProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().max(60).optional(),
      slug: z.string().max(80).optional(),
      desc: z.string().max(500).optional(),
      color: z.string().max(16).optional(),
      isPublished: z.boolean().optional(),
    }))
    .mutation(({ input, ctx }) => {
      const { id, ...rest } = input;
      return updateBlogTopic(prisma, Number(ctx.id), id, rest);
    }),

  deleteTopic: authProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(({ input, ctx }) => deleteBlogTopic(prisma, Number(ctx.id), input.id)),

  reorderTopics: authProcedure
    .input(z.object({ orderedIds: z.array(z.number().int().positive()).max(200) }))
    .mutation(({ input, ctx }) => reorderBlogTopics(prisma, Number(ctx.id), input.orderedIds)),

  assignTopics: authProcedure
    .input(z.object({ topicId: z.number().int().positive(), noteIds: z.array(z.number().int().positive()).max(200) }))
    .mutation(({ input, ctx }) => assignTopicNotes(prisma, Number(ctx.id), input.topicId, input.noteIds)),

  setCover: authProcedure
    .input(z.object({ noteId: z.number().int().positive(), attachmentId: z.number().int().positive().nullable() }))
    .mutation(({ input, ctx }) => setPublicationCover(prisma, Number(ctx.id), input.noteId, input.attachmentId)),

  /**
   * 公开读：博客首页要拉作者资料和专题。资料未发布时一律返回 null，
   * 不因为「表里有记录」就默认公开。
   */
  publicProfile: publicProcedure
    .input(z.void())
    .query(async () => {
      const profile = await prisma.blogProfile.findFirst({ where: { isPublished: true }, orderBy: { updatedAt: 'desc' } });
      if (!profile) return null;
      return {
        displayName: profile.displayName, tagline: profile.tagline, bio: profile.bio,
        avatarUrl: profile.avatarUrl, homepage: profile.homepage,
        links: sanitizeLinks(profile.links),
      };
    }),

  publicTopics: publicProcedure
    .input(z.void())
    .query(async () => {
      const topics = await prisma.blogTopic.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        select: {
          name: true, slug: true, desc: true, color: true,
          _count: { select: { notes: true } },
        },
      });
      return topics;
    }),

  /** 公开读：按专题 slug 拉文章列表，只返回快照，不碰草稿。 */
  publicTopicFeed: publicProcedure
    .input(z.object({ slug: z.string().max(80), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const topic = await prisma.blogTopic.findFirst({ where: { slug: input.slug, isPublished: true } });
      if (!topic) return [];
      const links = await prisma.blogTopicNote.findMany({
        where: { topicId: topic.id },
        orderBy: [{ sortOrder: 'asc' }, { noteId: 'asc' }],
        take: input.limit,
        select: { note: { select: { id: true, publishId: true, isPublished: true, isRecycle: true, publication: true } } },
      });
      return links
        .map(l => publicPublicationDTO(l.note))
        .filter((n): n is NonNullable<typeof n> => !!n);
    }),
});
