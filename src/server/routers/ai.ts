import { router, authProcedure } from '../trpc';
import { z } from 'zod';
import { AiService } from '../plugins/ai';
import { prisma } from '../prisma';
import { FileService } from '../plugins/files';
import { TRPCError } from '@trpc/server';

export const aiRouter = router({
  embeddingUpsert: authProcedure
    .input(z.object({
      id: z.number(),
      content: z.string(),
      type: z.enum(['update', 'insert'])
    }))
    .mutation(async ({ input }) => {
      const { id, content, type } = input
      const createTime = await prisma.notes.findUnique({ where: { id } }).then(i => i?.createdAt)
      const { ok, error } = await AiService.embeddingUpsert({ id, content, type, createTime: createTime! })
      if (!ok) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error
        })
      }
      return { ok }
    }),
  embeddingInsertAttachments: authProcedure
    .input(z.object({
      id: z.number(),
      filePath: z.string() //api/file/text.pdf
    }))
    .mutation(async ({ input }) => {
      const { id, filePath } = input
      try {
        const res = await AiService.embeddingInsertAttachments({ id, filePath })
        return res
      } catch (error) {
        return { ok: false, msg: error?.message }
      }
    }),
  embeddingDelete: authProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input }) => {
      const { id } = input
      try {
        const res = await AiService.embeddingDelete({ id })
        return res
      } catch (error) {
        return { ok: false, msg: error?.message }
      }
    }),
  completions: authProcedure
    .input(z.object({
      question: z.string(),
      conversations: z.array(z.object({ role: z.string(), content: z.string() }))
    }))
    .mutation(async function* ({ input, ctx }) {
      try {
        const { question, conversations } = input
        const { result: responseStream, notes } = await AiService.completions({ question, conversations, ctx })
        yield { notes }
        for await (const chunk of responseStream) {
          yield { context: chunk }
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message
        })
      }
    }),
  speechToText: authProcedure
    .input(z.object({
      filePath: z.string()
    }))
    .mutation(async function ({ input }) {
      const { filePath } = input
      try {
        const localFilePath = await FileService.getFile(filePath)
        const doc = await AiService.speechToText(localFilePath)
        return doc
      } catch (error) {
        throw new Error(error)
      }
    }),
  rebuildingEmbeddings: authProcedure
    .input(z.object({
      force: z.boolean().optional()
    }))
    .mutation(async function* ({ input }) {
      const { force } = input
      try {
        for await (const result of AiService.rebuildEmbeddingIndex({ force })) {
          yield result;
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message
        })
      }
    }),
  writing: authProcedure
    .input(z.object({
      question: z.string(),
      type: z.enum(['expand', 'polish', 'custom']).optional(),
      content: z.string().optional()
    }))
    .mutation(async function* ({ input }) {
      const { question, type = 'custom', content } = input
      try {
        const { result: responseStream } = await AiService.writing({
          question,
          type,
          content
        })

        for await (const chunk of responseStream) {
          yield { content: chunk }
        }
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error?.message
        })
      }
    }),
  autoTag: authProcedure
    .input(z.object({
      content: z.string(),
      tags: z.array(z.string())
    }))
    .mutation(async function ({ input }) {
      const { content, tags } = input
      const res = await AiService.autoTag({ content, tags })
      return res
    }),
  autoEmoji: authProcedure
    .input(z.object({
      content: z.string()
    }))
    .mutation(async function ({ input }) {
      const { content } = input
      const res = await AiService.autoEmoji({ content })
      return res
    }),
  AIComment: authProcedure
    .input(z.object({
      content: z.string(),
      noteId: z.number()
    }))
    .mutation(async function ({ input }) {
      return await AiService.AIComment(input)
    })
})
