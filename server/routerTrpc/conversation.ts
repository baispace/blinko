import { getConversationMessages } from '../lib/conversationPages';
import { router, authProcedure, publicProcedure } from '../middleware';
import { z } from 'zod';
import { prisma } from '../prisma';

export const conversationRouter = router({
  create: authProcedure
    .input(z.object({
      title: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await prisma.conversation.create({
        data: {
          title: input.title,
          accountId: Number(ctx.id),
        }
      });
    }),
  clearMessages: authProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input }) => {
      await prisma.message.deleteMany({
        where: {
          conversationId: input.id
        }
      });
      return {
        success: true
      }
    }),
  list: authProcedure
    .input(z.object({
      page: z.number().default(1),
      size: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const skip = (input.page - 1) * input.size;
      const conversations = await prisma.conversation.findMany({
          where: { accountId: Number(ctx.id) },
          skip,
          take: input.size,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
        });
      return conversations;
    }),
  messages: authProcedure.input(z.object({ id: z.number().int().positive(), beforeId: z.number().int().positive().optional(), size: z.number().int().min(1).max(100).default(40) }))
    .query(({ input, ctx }) => getConversationMessages(input.id, Number(ctx.id), input.size, input.beforeId)),
  detail: authProcedure.input(z.object({ id: z.number(), messageLimit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input, ctx }) => {
      const conversation = await prisma.conversation.findFirst({ where: { id: input.id, accountId: Number(ctx.id) } });
      if (!conversation) return null;
      if (input.messageLimit) {
        const page = await getConversationMessages(input.id, Number(ctx.id), input.messageLimit);
        return { ...conversation, messages: page.items, nextMessageCursor: page.nextCursor };
      }
      const messages = await prisma.message.findMany({ where: { conversationId: input.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
      return { ...conversation, messages, nextMessageCursor: null as number | null };
    }),

  publicDetail: publicProcedure
    .input(z.object({
      shareId: z.string()
    }))
    .query(async ({ input }) => {
      try {
        // Decode the share ID to extract conversation ID
        const decoded = Buffer.from(input.shareId, 'base64').toString('utf-8');
        const conversationId = parseInt(decoded.replace('blinko-ai-share-', ''));
        
        if (isNaN(conversationId)) {
          throw new Error('Invalid share ID');
        }

        const conversation = await prisma.conversation.findUnique({
          where: { 
            id: conversationId,
            isShare: true  // Only return if the conversation is shared
          },
          include: {
            messages: {
              orderBy: {
                createdAt: 'asc'
              }
            },
            account: {
              select: {
                name: true,
                nickname: true,
                image: true,
              }
            }
          }
        });

        if (!conversation) {
          throw new Error('Conversation not found or not shared');
        }

        return conversation;
      } catch (error) {
        throw new Error('Invalid share link');
      }
    }),

  toggleShare: authProcedure
    .input(z.object({
      id: z.number(),
      isShare: z.boolean()
    }))
    .mutation(async ({ input, ctx }) => {
      return await prisma.conversation.update({
        where: {
          id: input.id,
          accountId: Number(ctx.id)
        },
        data: {
          isShare: input.isShare
        }
      });
    }),

  update: authProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return await prisma.conversation.update({
        where: {
          id: input.id,
          accountId: Number(ctx.id)
        },
        data: {
          title: input.title,
        }
      });
    }),

  delete: authProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input, ctx }) => {
      return await prisma.$transaction(async (prisma) => {
        await prisma.message.deleteMany({
          where: {
            conversationId: input.id
          }
        });
        return await prisma.conversation.delete({
          where: {
            id: input.id,
            accountId: Number(ctx.id)
          }
        });
      });
    }),
}); 