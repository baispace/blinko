import { router, authProcedure } from '../middleware';
import { z } from 'zod';
import { AiService } from '@server/aiServer';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { CoreMessage } from '@mastra/core';
import { AiModelFactory, extractValidTags } from '@server/aiServer/aiModelFactory';
import { RebuildEmbeddingJob } from '../jobs/rebuildEmbeddingJob';
import { getAllPathTags } from '@server/lib/helper';
import { ModelCapabilities } from '@server/aiServer/types';
import { aiProviders, aiModels } from '@shared/lib/prismaZodType';
import { fetchWithProxy } from '@server/lib/proxy';
import { helper } from '@shared/lib/helper';
import { cleanConversationTitle } from '../../shared/lib/conversationTitle';
import { inferModelCapabilities } from '@shared/lib/modelTemplates';

import { workflowKeys } from '../../shared/lib/aiWorkflows';
import { dailySyncInput, syncDailyWorkflow } from '../lib/dailyWorkflow';
import { getChatCapabilities } from '../lib/chatCapabilities';

export const aiRouter = router({
  chatCapabilities: authProcedure.input(z.object({ modelId: z.number().int().positive().optional() })).query(({ input }) => getChatCapabilities(input.modelId)),
  skillSources: authProcedure.input(z.object({ skill: z.enum(workflowKeys), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), includeNotes: z.boolean().default(false), days: z.number().int().min(1).max(90).default(7) })).query(async ({ input, ctx }) => {
    const now = new Date();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now);
    const startToday = new Date(today + 'T00:00:00+08:00');
    if (input.skill === 'daily' || input.skill === 'weekly') {
      const from = input.from ? new Date(input.from + 'T00:00:00+08:00') : new Date(startToday.getTime() - (input.skill === 'daily' ? 1 : input.days - 1) * 86400000);
      const to = input.to ? new Date(input.to + 'T23:59:59.999+08:00') : now;
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || to.getTime() - from.getTime() > 91 * 86400000) throw new TRPCError({ code: 'BAD_REQUEST', message: '请选择有效且不超过90天的时间范围' });
      const owned = { accountId: Number(ctx.id), isRecycle: false };
      const inRange = { gte: from, lte: to };
      const tasks = await prisma.notes.findMany({ where: { ...owned, type: 2, ...(input.skill === 'daily' ? { OR: [{ isArchived: false }, { updatedAt: inRange }] } : { OR: [{ updatedAt: inRange }, { createdAt: inRange }] }) }, orderBy: { updatedAt: 'desc' }, take: 81, select: { id: true, content: true, type: true, metadata: true, isArchived: true, createdAt: true, updatedAt: true } });
      const extras = input.includeNotes ? await prisma.notes.findMany({ where: { ...owned, type: { in: [0,1] }, updatedAt: inRange }, orderBy: { updatedAt: 'desc' }, take: 21, select: { id: true, content: true, type: true, metadata: true, isArchived: true, createdAt: true, updatedAt: true } }) : [];
      return { items: [...tasks.slice(0,80), ...extras.slice(0,20)], total: tasks.length + extras.length, limited: tasks.length > 80 || extras.length > 20 };
    }
    const base = { accountId: Number(ctx.id), isRecycle: false, isArchived: false };
    const candidates = await prisma.notes.findMany({
      where: input.skill === 'overdue' ? { ...base, type: 2 } : input.skill === 'today' ? { ...base, OR: [{ type: 2 }, { createdAt: { gte: startToday } }] } : input.skill === 'tasks' ? { ...base, OR: [{ type: { in: [0,1] }, createdAt: { gte: new Date(Date.now() - input.days * 86400000) } }, { type: 2 }] } : { ...base, ...(input.skill === 'ideas' ? { type: 0 } : { type: { in: [0,1] } }), createdAt: { gte: new Date(Date.now() - input.days * 86400000) } },
      orderBy: { updatedAt: 'desc' }, take: 501,
      select: { id: true, content: true, type: true, metadata: true, isArchived: true, createdAt: true, updatedAt: true }
    });
    const matching = input.skill === 'overdue' ? candidates.filter(note => {
      const due = (note.metadata as any)?.expireAt;
      return due && Number.isFinite(new Date(due).getTime()) && new Date(due) < now;
    }) : candidates;
    return { items: matching.slice(0,80), total: matching.length, limited: matching.length > 80 || candidates.length > 500 };
  }),
  syncDaily: authProcedure.input(dailySyncInput).mutation(({ input, ctx }) => syncDailyWorkflow(input, Number(ctx.id))),
  saveDraft: authProcedure.input(z.object({
    messageId: z.number().int().positive(),
    drafts: z.array(z.object({ index: z.number().int().min(0).max(99), title: z.string().trim().min(1).max(500), content: z.string().max(100000), due: z.union([z.literal(''), z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(''), priority: z.enum(['', 'ui', 'in', 'un', 'nn']).default(''), tags: z.array(z.string().max(255)).max(30).default([]) })).min(1).max(20),
  })).mutation(async ({ input, ctx }) => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM message WHERE id = ${input.messageId} FOR UPDATE`;
    const message = await tx.message.findFirst({ where: { id: input.messageId, role: 'assistant', conversation: { accountId: Number(ctx.id) } } });
    if (!message) throw new TRPCError({ code: 'NOT_FOUND', message: '对话结果不存在' });
    const clean = message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    let draft: any;
    try { draft = JSON.parse(clean.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? clean); } catch { throw new TRPCError({ code: 'BAD_REQUEST', message: '草稿格式无效' }); }
    if (draft.kind !== 'tasks' && draft.kind !== 'note') throw new TRPCError({ code: 'BAD_REQUEST', message: '草稿类型无效' });
    const metadata: any = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const saved = { ...(metadata.savedDrafts || {}) };
    for (const item of input.drafts) {
      if (saved[item.index]) continue;
      if (draft.kind === 'note' ? item.index !== 0 : !Array.isArray(draft.tasks) || item.index >= draft.tasks.length) throw new TRPCError({ code: 'BAD_REQUEST', message: '草稿条目无效' });
      const expireAt = item.due ? new Date(item.due.length === 10 ? item.due + 'T23:59:59+08:00' : item.due) : null;
      if (expireAt && (!Number.isFinite(expireAt.getTime()) || item.due.length === 10 && item.due !== new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(expireAt))) throw new TRPCError({ code: 'BAD_REQUEST', message: '截止日期无效' });
      const note = await tx.notes.create({ data: { accountId: Number(ctx.id), type: draft.kind === 'tasks' ? 2 : 1, content: (draft.kind === 'tasks' ? item.title.replace(/^#+\s*/, '') + '\n\n' : '') + item.content.replace(/(?<!:\/\/)(?<=\s|^)#[^\s#]+(?=\s|$)/g, '').trim() + (item.tags.length ? '\n\n' + item.tags.map(tag => '#' + tag.replace(/^#/, '')).join(' ') : ''), metadata: { title: item.title.replace(/^#+\s*/, ''), expireAt: expireAt?.toISOString() ?? null, priorityImportant: ['ui','in'].includes(item.priority), priorityUrgent: ['ui','un'].includes(item.priority), priority: item.priority === 'ui' ? 1 : item.priority === 'in' || item.priority === 'un' ? 2 : 3, aiSourceMessageId: message.id } } });
      const tree = helper.buildHashTagTreeFromHashString(item.tags);
      const attachTags = async (nodes: typeof tree, parent = 0) => {
        for (const node of nodes) {
          const tag = await tx.tag.findFirst({ where: { accountId: Number(ctx.id), name: node.name, parent } });
          if (!tag) throw new TRPCError({ code: 'BAD_REQUEST', message: '标签已变化，请重新选择站点标签。' });
          await tx.tagsToNote.create({ data: { noteId: note.id, tagId: tag.id } });
          if (node.children) await attachTags(node.children, tag.id);
        }
      };
      await attachTags(tree);
      saved[item.index] = note.id;
    }
    await tx.message.update({ where: { id: message.id }, data: { metadata: { ...metadata, savedDrafts: saved } } });
    return saved;
  })),
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
      modelId: z.number().int().positive().optional(),
      withTools: z.boolean().optional(),
      withOnline: z.boolean().optional(),
      withRAG: z.boolean().optional(),
      conversations: z.array(z.object({ role: z.string(), content: z.string() })),
      systemPrompt: z.string().optional()
    }))
    .mutation(async function* ({ input, ctx }) {
      try {
        const { question, conversations, systemPrompt } = input;
        const available = await getChatCapabilities(input.modelId);
        if (!available.canChat) throw new TRPCError({ code: 'BAD_REQUEST', message: '请先配置可用的对话模型。' });
        const withTools = !!input.withTools && available.tools;
        const withOnline = !!input.withOnline && available.online;
        const withRAG = (input.withRAG ?? true) && available.rag;
        let _conversations = conversations as CoreMessage[]
        if (input.modelId) {
          const model = await prisma.aiModels.findUnique({ where: { id: input.modelId } });
          if (!model || !(model.capabilities as any)?.inference) throw new TRPCError({ code: 'BAD_REQUEST', message: '所选模型不可用于对话，请重新选择。' });
        }
        const { result: responseStream, notes } = await AiService.completions({
          question,
          conversations: _conversations,
          ctx,
          withTools,
          modelId: input.modelId,
          withOnline,
          withRAG,
          systemPrompt
        })
        yield { notes }
        for await (const chunk of responseStream.fullStream) {
          if (chunk.type === 'error') {
            const error = chunk.error as { statusCode?: number; message?: string };
            const message = error?.statusCode === 401
              ? 'AI 服务认证失败（401）：请检查 API Key 是否有效，并确认它与服务地址属于同一平台。'
              : error?.statusCode === 429
                ? 'AI 服务请求受限（429）：请检查额度或稍后重试。'
                : error?.statusCode === 400 || error?.statusCode === 404
                  ? 'AI 服务拒绝请求：请检查模型标识和 API 地址是否正确。'
                  : 'AI 服务调用失败，请检查服务配置或稍后重试。';
            yield { chunk: { type: 'error' as const, error: { name: 'AI_APICallError', message } } };
          } else {
            yield { chunk };
          }
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
      // const { filePath } = input
      // try {
      //   const localFilePath = await FileService.getFile(filePath)
      //   const doc = await AiService.speechToText(localFilePath)
      //   return doc
      // } catch (error) {
      //   throw new Error(error)
      // }
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

  summarizeConversationTitle: authProcedure
    .input(z.object({
      conversations: z.array(z.object({ role: z.string(), content: z.string() })),
      conversationId: z.number()
    }))
    .mutation(async function ({ input, ctx }) {
      const { conversations, conversationId } = input
      const owned = await prisma.conversation.findFirst({ where: { id: conversationId, accountId: Number(ctx.id) } });
      if (!owned) throw new TRPCError({ code: 'NOT_FOUND' });
      const agent = await AiModelFactory.SummarizeAgent()
      const conversationString = JSON.stringify(
        conversations.map(i => ({
          role: i.role,
          content: i.content.replace(/\n/g, '\\n')
        })),
        null, 2
      );
      const result = await agent.generate(conversationString)
      const conversation = await prisma.conversation.update({
        where: { id: conversationId, accountId: Number(ctx.id) },
        data: { title: cleanConversationTitle(result?.text, cleanConversationTitle(owned.title, '新对话')) }
      })
      return conversation
    }),

  writing: authProcedure
    .input(z.object({
      question: z.string(),
      type: z.enum(['expand', 'polish', 'custom']).optional(),
      content: z.string().optional()
    }))
    .mutation(async function* ({ input }) {
      const { question, type = 'custom', content } = input
      // Wrap agent creation/initialization so that configuration errors
      // (e.g. missing AI provider, invalid model) yield a meaningful
      // { type: 'error', error } chunk with a readable message instead
      // of propagating an empty Error that surfaces as "Unknown error"
      // on the client.
      let result: any
      try {
        const agent = await AiModelFactory.WritingAgent(type)
        result = await agent.stream([
          {
            role: 'user',
            content: `${question}\n\nThis is the user's note content: ${content || ''}`
          }
        ])
      } catch (err: any) {
        yield { type: 'error', error: new Error(err?.message || 'Failed to initialize AI writing agent') }
        return
      }
      for await (const chunk of result.fullStream) {
        yield chunk
      }
    }),
  autoTag: authProcedure
    .input(z.object({
      content: z.string()
    }))
    .mutation(async function ({ input }) {
      const config = await AiModelFactory.globalConfig();
      const { content } = input
      const tagAgent = await AiModelFactory.TagAgent(config.aiTagsPrompt || undefined);
      const tags = await getAllPathTags();
      const result = await tagAgent.generate(
        `Existing tags list: [${tags.join(', ')}]\nNote content: ${content}\nPlease suggest appropriate tags for this content. Include full hierarchical paths for tags like #Parent/Child instead of just #Child.`
      )
      // 仅提取合法 #tag，过滤推理型模型输出的分析文字
      return extractValidTags(result?.text ?? '')
    }),
  autoEmoji: authProcedure
    .input(z.object({
      content: z.string()
    }))
    .mutation(async function ({ input }) {
      const { content } = input
      const agent = await AiModelFactory.EmojiAgent()
      const result = await agent.generate("Please select and suggest appropriate emojis for the above content" + content)
      console.log(result.text)
      return result?.text?.trim().split(',').map(tag => tag.trim()).filter(Boolean) ?? [];
    }),
  AIComment: authProcedure
    .input(z.object({
      content: z.string(),
      noteId: z.number()
    }))
    .mutation(async function ({ input }) {
      return await AiService.AIComment(input)
    }),

  rebuildEmbeddingStart: authProcedure
    .input(z.object({
      force: z.boolean().optional(),
      incremental: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      await RebuildEmbeddingJob.ForceRebuild(input.force ?? true, input.incremental ?? false);
      return { success: true };
    }),

  rebuildEmbeddingResume: authProcedure
    .mutation(async () => {
      await RebuildEmbeddingJob.ResumeRebuild();
      return { success: true };
    }),

  rebuildEmbeddingRetryFailed: authProcedure
    .mutation(async () => {
      await RebuildEmbeddingJob.RetryFailedNotes();
      return { success: true };
    }),

  rebuildEmbeddingStop: authProcedure
    .mutation(async () => {
      await RebuildEmbeddingJob.StopRebuild();
      return { success: true };
    }),

  rebuildEmbeddingProgress: authProcedure
    .query(async () => {
      const progress = await RebuildEmbeddingJob.GetProgress();
      return progress || {
        current: 0,
        total: 0,
        percentage: 0,
        isRunning: false,
        results: [],
        lastUpdate: new Date().toISOString()
      };
    }),

  testConnect: authProcedure
    .input(z.object({
      providerId: z.number(),
      modelKey: z.string(),
      capabilities: z.object({
        inference: z.boolean().optional(),
        tools: z.boolean().optional(),
        image: z.boolean().optional(),
        imageGeneration: z.boolean().optional(),
        video: z.boolean().optional(),
        audio: z.boolean().optional(),
        embedding: z.boolean().optional(),
        rerank: z.boolean().optional()
      })
    }))
    .mutation(async ({ input }) => {
      try {
        const { providerId, modelKey, capabilities } = input;

        // Get provider information
        const provider = await prisma.aiProviders.findUnique({
          where: { id: providerId }
        });

        if (!provider) {
          throw new Error('Provider not found');
        }

        // Create temporary model configuration for testing
        const tempModelConfig = {
          provider: provider.provider,
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
          config: provider.config,
          modelKey,
          capabilities
        };

        // Test based on model capabilities
        let testResults: any = {};

        // Test inference capability (chat)
        if (capabilities.inference) {
          try {
            const { LLMProvider } = await import('@server/aiServer/providers');
            const llmProvider = new LLMProvider();
            const languageModel = await llmProvider.getLanguageModel({
              provider: provider.provider,
              apiKey: provider.apiKey,
              baseURL: provider.baseURL,
              modelKey,
              apiVersion: (provider.config as any)?.apiVersion
            });

            // Test simple generation
            const { generateText } = await import('ai');
            const result = await generateText({
              model: languageModel,
              prompt: 'Say "Hello" to test connection'
            });
            testResults.inference = { success: true, response: result.text };
          } catch (error) {
            testResults.inference = { success: false, error: error.message };
          }
        }

        // Test embedding capability
        if (capabilities.embedding) {
          try {
            const { EmbeddingProvider } = await import('@server/aiServer/providers');
            const embeddingProvider = new EmbeddingProvider();
            const embeddingModel = await embeddingProvider.getEmbeddingModel({
              provider: provider.provider,
              apiKey: provider.apiKey,
              baseURL: provider.baseURL,
              modelKey,
              apiVersion: (provider.config as any)?.apiVersion
            });

            const { embed } = await import('ai');
            const result = await embed({
              model: embeddingModel as any,
              value: 'test embedding'
            });
            testResults.embedding = { success: true, dimensions: result.embedding?.length || 0 };
          } catch (error) {
            testResults.embedding = { success: false, error: error.message };
          }
        }

        // Test audio capability (speech recognition)
        if (capabilities.audio) {
          throw new Error("audio cannot test")
        }

        const overallSuccess = Object.values(testResults).some((result: any) => result.success);

        return {
          success: overallSuccess,
          capabilities: testResults,
          provider: provider.title,
          model: modelKey
        };
      } catch (error) {
        console.error("Connection test failed:", error);
        throw new Error(`Connection test failed: ${error?.message || "Unknown error"}`);
      }
    }),

  getAllProviders: authProcedure
    .query(async () => {
      return await AiModelFactory.getAllAiProviders();
    }),

  createProvider: authProcedure
    .input(z.object({
      title: z.string(),
      provider: z.string(),
      baseURL: z.string().optional(),
      apiKey: z.string().optional(),
      config: z.any().optional(),
      sortOrder: z.number().default(0)
    }))
    .mutation(async ({ input }) => {
      return await prisma.aiProviders.create({
        data: input,
        include: { models: true }
      });
    }),

  updateProvider: authProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      provider: z.string().optional(),
      baseURL: z.string().optional(),
      apiKey: z.string().optional(),
      config: z.any().optional(),
      sortOrder: z.number().optional()
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await prisma.aiProviders.update({
        where: { id },
        data,
        include: { models: true }
      });
    }),

  deleteProvider: authProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input }) => {
      return await prisma.aiProviders.delete({
        where: { id: input.id }
      });
    }),

  getAllModels: authProcedure
    .query(async () => {
      return await prisma.aiModels.findMany({
        include: { provider: true },
        orderBy: [{ provider: { sortOrder: 'asc' } }, { sortOrder: 'asc' }]
      });
    }),

  getModelsByProvider: authProcedure
    .input(z.object({
      providerId: z.number()
    }))
    .query(async ({ input }) => {
      return await prisma.aiModels.findMany({
        where: { providerId: input.providerId },
        include: { provider: true },
        orderBy: { sortOrder: 'asc' }
      });
    }),

  getModelsByCapability: authProcedure
    .input(z.object({
      capability: z.string()
    }))
    .query(async ({ input }) => {
      return await AiModelFactory.getAiModelsByCapability(input.capability);
    }),

  createModel: authProcedure
    .input(z.object({
      providerId: z.number(),
      title: z.string(),
      modelKey: z.string(),
      capabilities: z.object({
        inference: z.boolean().default(true),
        tools: z.boolean().default(false),
        image: z.boolean().default(false),
        imageGeneration: z.boolean().default(false),
        video: z.boolean().default(false),
        audio: z.boolean().default(false),
        embedding: z.boolean().default(false),
        rerank: z.boolean().default(false)
      }),
      config: z.any().optional(),
      sortOrder: z.number().default(0)
    }))
    .mutation(async ({ input }) => {
      return await prisma.aiModels.create({
        data: input,
        include: { provider: true }
      });
    }),

  updateModel: authProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      modelKey: z.string().optional(),
      capabilities: z.object({
        inference: z.boolean().optional(),
        tools: z.boolean().optional(),
        image: z.boolean().optional(),
        imageGeneration: z.boolean().optional(),
        video: z.boolean().optional(),
        audio: z.boolean().optional(),
        embedding: z.boolean().optional(),
        rerank: z.boolean().optional()
      }).optional(),
      config: z.any().optional(),
      sortOrder: z.number().optional()
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      return await prisma.aiModels.update({
        where: { id },
        data,
        include: { provider: true }
      });
    }),

  deleteModel: authProcedure
    .input(z.object({
      id: z.number()
    }))
    .mutation(async ({ input }) => {
      return await prisma.aiModels.delete({
        where: { id: input.id }
      });
    }),


  createModelsFromProvider: authProcedure
    .input(z.object({
      providerId: z.number(),
      models: z.array(z.object({
        id: z.string(),
        name: z.string(),
        capabilities: z.object({
          inference: z.boolean().default(true),
          tools: z.boolean().default(false),
          image: z.boolean().default(false),
          imageGeneration: z.boolean().default(false),
          video: z.boolean().default(false),
          audio: z.boolean().default(false),
          embedding: z.boolean().default(false),
          rerank: z.boolean().default(false)
        })
      }))
    }))
    .mutation(async ({ input }) => {
      const { providerId, models } = input;

      const createdModels: aiModels[] = [];
      for (const model of models) {
        const created = await prisma.aiModels.create({
          data: {
            providerId,
            title: model.name,
            modelKey: model.id,
            capabilities: model.capabilities,
            sortOrder: 0
          },
          include: { provider: true }
        });
        createdModels.push(created);
      }

      return createdModels;
    }),

  batchCreateModelsFromProvider: authProcedure
    .input(z.object({
      providerId: z.number(),
      selectedModels: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        capabilities: z.object({
          inference: z.boolean().optional(),
          tools: z.boolean().optional(),
          image: z.boolean().optional(),
          imageGeneration: z.boolean().optional(),
          video: z.boolean().optional(),
          audio: z.boolean().optional(),
          embedding: z.boolean().optional(),
          rerank: z.boolean().optional()
        }).optional()
      }))
    }))
    .mutation(async ({ input }) => {
      const { providerId, selectedModels } = input;

      const createdModels: aiModels[] = [];
      for (const model of selectedModels) {
        const created = await prisma.aiModels.create({
          data: {
            providerId,
            title: model.name,
            modelKey: model.id,
            capabilities: model.capabilities || {
              inference: true,
              tools: false,
              image: false,
              imageGeneration: false,
              video: false,
              audio: false,
              embedding: false,
              rerank: false
            },
            sortOrder: 0
          },
          include: { provider: true }
        });
        createdModels.push(created);
      }

      return createdModels;
    }),

  fetchProviderModels: authProcedure
    .input(z.object({
      providerId: z.number()
    }))
    .mutation(async ({ input }) => {
      const { providerId } = input;

      const provider = await prisma.aiProviders.findUnique({
        where: { id: providerId }
      });

      if (!provider) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Provider not found'
        });
      }

      const proxiedFetch = await fetchWithProxy();
      let modelList: any[] = [];

      try {
        switch (provider.provider.toLowerCase()) {
          case 'ollama': {
            const endpoint = provider.baseURL || 'http://127.0.0.1:11434';
            const response = await proxiedFetch(`${endpoint}/api/tags`);
            const data = await response.json() as any;
            modelList = data.models?.map((model: any) => ({
              id: model.name,
              name: model.name,
              description: model.description || '',
              capabilities: inferModelCapabilities(model.name)
            })) || [];
            break;
          }

          case 'openai': {
            const endpoint = provider.baseURL || 'https://api.openai.com/v1';
            const response = await proxiedFetch(`${endpoint}/models`, {
              headers: { 'Authorization': `Bearer ${provider.apiKey}` }
            });
            const data = await response.json() as any;
            modelList = data.data?.map((model: any) => ({
              id: model.id,
              name: model.id,
              description: '',
              capabilities: inferModelCapabilities(model.id)
            })) || [];
            break;
          }

          case 'anthropic': {
            // Static list - Anthropic doesn't provide a list models API
            modelList = [
              { id: 'claude-3-5-sonnet-20241022', name: 'claude-3-5-sonnet-20241022', capabilities: inferModelCapabilities('claude-3-5-sonnet-20241022') },
              { id: 'claude-3-5-sonnet-20240620', name: 'claude-3-5-sonnet-20240620', capabilities: inferModelCapabilities('claude-3-5-sonnet-20240620') },
              { id: 'claude-3-5-haiku-20241022', name: 'claude-3-5-haiku-20241022', capabilities: inferModelCapabilities('claude-3-5-haiku-20241022') },
              { id: 'claude-3-opus-20240229', name: 'claude-3-opus-20240229', capabilities: inferModelCapabilities('claude-3-opus-20240229') },
              { id: 'claude-3-sonnet-20240229', name: 'claude-3-sonnet-20240229', capabilities: inferModelCapabilities('claude-3-sonnet-20240229') },
              { id: 'claude-3-haiku-20240307', name: 'claude-3-haiku-20240307', capabilities: inferModelCapabilities('claude-3-haiku-20240307') }
            ];
            break;
          }

          case 'voyageai': {
            // Static list - VoyageAI doesn't provide a list models API
            modelList = [
              { id: 'voyage-3', name: 'voyage-3', capabilities: inferModelCapabilities('voyage-3') },
              { id: 'voyage-3-lite', name: 'voyage-3-lite', capabilities: inferModelCapabilities('voyage-3-lite') },
              { id: 'voyage-finance-2', name: 'voyage-finance-2', capabilities: inferModelCapabilities('voyage-finance-2') },
              { id: 'voyage-multilingual-2', name: 'voyage-multilingual-2', capabilities: inferModelCapabilities('voyage-multilingual-2') },
              { id: 'voyage-law-2', name: 'voyage-law-2', capabilities: inferModelCapabilities('voyage-law-2') },
              { id: 'voyage-code-2', name: 'voyage-code-2', capabilities: inferModelCapabilities('voyage-code-2') },
              { id: 'voyage-large-2-instruct', name: 'voyage-large-2-instruct', capabilities: inferModelCapabilities('voyage-large-2-instruct') },
              { id: 'voyage-large-2', name: 'voyage-large-2', capabilities: inferModelCapabilities('voyage-large-2') }
            ];
            break;
          }

          case 'google': {
            const endpoint = provider.baseURL || 'https://generativelanguage.googleapis.com/v1beta';
            const response = await proxiedFetch(`${endpoint}/models?key=${provider.apiKey}`);
            const data = await response.json() as any;
            modelList = data.models?.map((model: any) => ({
              id: model.name.replace('models/', ''),
              name: model.displayName || model.name.replace('models/', ''),
              description: model.description || '',
              capabilities: inferModelCapabilities(model.name)
            })) || [];
            break;
          }

          case 'azure': {
            const endpoint = provider.baseURL;
            const response = await proxiedFetch(`${endpoint}/openai/models?api-version=2024-02-01`, {
              headers: { 'api-key': provider.apiKey || '' }
            });
            const data = await response.json() as any;
            modelList = data.data?.map((model: any) => ({
              id: model.id,
              name: model.id,
              description: '',
              capabilities: inferModelCapabilities(model.id)
            })) || [];
            break;
          }

          case 'minimax': {
            // Static list - MiniMax models with known capabilities
            modelList = [
              { id: 'MiniMax-M3', name: 'MiniMax M3', capabilities: inferModelCapabilities('MiniMax-M3') },
              { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', capabilities: inferModelCapabilities('MiniMax-M2.7') }
            ];
            break;
          }

          default: {
            // Default: use OpenAI-compatible API format
            const endpoint = provider.baseURL;
            if (!endpoint) {
              throw new Error('Base URL is required for custom providers');
            }
            const response = await proxiedFetch(`${endpoint}/models`, {
              headers: { 'Authorization': `Bearer ${provider.apiKey}` }
            });
            const data = await response.json() as any;
            modelList = data.data?.map((model: any) => ({
              id: model.id,
              name: model.id,
              description: '',
              capabilities: inferModelCapabilities(model.id)
            })) || [];
            break;
          }
        }

        // Update provider config with fetched models
        await prisma.aiProviders.update({
          where: { id: providerId },
          data: {
            config: {
              ...(provider.config as any || {}),
              models: modelList
            }
          }
        });

        return modelList;
      } catch (error: any) {
        console.error('Error fetching provider models:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to fetch models: ${error?.message || 'Unknown error'}`
        });
      }
    }),
})
