import { LLMProvider, EmbeddingProvider, AudioProvider, AiUtilities } from './providers';
import { upsertBlinkoTool } from './tools/createBlinko';
import { createCommentTool } from './tools/createComment';
import { LibSQLVector } from "@mastra/libsql";
import dayjs from 'dayjs';
import { Agent, Mastra } from '@mastra/core';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { MarkdownTextSplitter, TokenTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { _ } from '@shared/lib/lodash';
import { webSearchTool } from './tools/webSearch';
import { webExtra } from './tools/webExtra';
import { searchBlinkoTool } from './tools/searchBlinko';
import { updateBlinkoTool } from './tools/updateBlinko';
import { deleteBlinkoTool } from './tools/deleteBlinko';
import { createScheduledTaskTool, deleteScheduledTaskTool, listScheduledTasksTool } from './tools/scheduledTask';
import { getMcpMastraTools, hasMcpServers } from './mcp';
import { rerank } from '@mastra/rag';
import { prisma } from '@server/prisma';
import { getGlobalConfig } from '@server/routerTrpc/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PinoLogger } from '@mastra/loggers';
import { ModelCapabilities } from './types';
import { aiModels } from '@shared/index';
import { MastraVoice } from '@mastra/core/voice';

/**
 * 从模型输出中提取合法标签。
 * 推理型模型会先输出大段分析文字再给出标签，这里只认 "#标签" 格式，
 * 且优先取最后一段含 # 的文本（推理在前、结论在后），避免把分析过程写进笔记。
 */
/**
 * 剥离推理型模型输出的 <think>...</think> 思考块（含未闭合的 <think>...），
 * 用于所有把模型原文写入用户可见内容（评论/笔记）的场景。
 */
export function stripThinkText(text: string): string {
  return String(text ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .trim();
}

export function extractValidTags(text: string, max = 3): string[] {
  // 剥离推理型模型的 <think>...</think> 思考块，防止分析文字被当作内容处理
  const cleanedText = stripThinkText(text);
  const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean);
  const tagLine = [...lines].reverse().find(l => l.includes('#')) ?? '';
  const raw = tagLine.match(/#[\p{L}\p{N}_.\-/]+/gu) ?? [];
  const cleaned = raw
    .map(t => t.replace(/[.。,，、]+$/u, ''))
    .filter(t => t.length > 1 && t.length <= 100);
  return Array.from(new Set(cleaned)).slice(0, max);
}

export class AiModelFactory {
  static async queryAndDeleteVectorById(targetId: number) {
    const { VectorStore } = await AiModelFactory.GetProvider();
    try {
      const query = `
          WITH target_record AS (
            SELECT vector_id 
            FROM 'blinko'
            WHERE metadata->>'id' = ? 
            LIMIT 1
          )
          DELETE FROM 'blinko'
          WHERE vector_id IN (SELECT vector_id FROM target_record)
          RETURNING *;`;
      //@ts-ignore
      const result = await VectorStore.turso.execute({
        sql: query,
        args: [targetId],
      });

      if (result.rows.length === 0) {
        throw new Error(`id  ${targetId} is not found`);
      }

      return {
        success: true,
        deletedData: result.rows[0],
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  static async queryVector(query: string, accountId: number, _topK?: number) {
    const { VectorStore, Embeddings } = await AiModelFactory.GetProvider();
    if (!Embeddings) {
      throw new Error("No embeddings model config")
    }
    const config = await AiModelFactory.globalConfig();
    const topK = _topK ?? config.embeddingTopK ?? 3;
    const embeddingMinScore = config.embeddingScore ?? 0.4;
    const { embedding } = await embed({
      value: query,
      model: Embeddings,
    });

    const result = await VectorStore.query({
      indexName: 'blinko',
      queryVector: embedding,
      topK: topK,
    });
    let filteredResults = result.filter(({ score }) => score >= embeddingMinScore);

    const notes =
      (
        await prisma.notes.findMany({
          where: {
            accountId: accountId,
            id: {
              in: _.uniqWith(filteredResults.map((i) => Number(i.metadata?.id))).filter((i) => !!i) as number[],
            },
          },
          include: {
            tags: { include: { tag: true } },
            attachments: {
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            },
            references: {
              select: {
                toNoteId: true,
                toNote: {
                  select: {
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                },
              },
            },
            referencedBy: {
              select: {
                fromNoteId: true,
                fromNote: {
                  select: {
                    content: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                },
              },
            },
            _count: {
              select: {
                comments: true,
                histories: true,
              },
            },
          },
        })
      ).map((i) => {
        return { ...i, score: filteredResults.find((t) => Number(t.metadata?.id) == i.id)?.score ?? 0 };
      }) ?? [];

    let aiContext = notes.map((i) => i.content + '\n') || '';
    return { notes, aiContext: aiContext };
  }

  static async rebuildVectorIndex({ vectorStore, isDelete = false }: { vectorStore: LibSQLVector; isDelete?: boolean }) {
    try {
      if (isDelete) {
        await vectorStore.deleteIndex({ indexName: 'blinko' });
      }
    } catch (error) {
      console.error('delete vector index failed:', error);
    }

    const config = await AiModelFactory.globalConfig();
    const embeddingModel = config.embeddingModelId ? await AiModelFactory.getAiModel(config.embeddingModelId) : null;
    if (!embeddingModel) {
      console.warn('Embedding model not configured, skipping vector index creation');
      return;
    }

    const model = embeddingModel.modelKey.toLowerCase();
    let userConfigDimensions = (embeddingModel.config as any)?.embeddingDimensions || 0;
    let dimensions: number = 0;
    switch (true) {
      case model.includes('text-embedding-3-small'):
        dimensions = 1536;
        break;
      case model.includes('text-embedding-3-large'):
        dimensions = 3072;
        break;
      case model.includes('cohere/embed-english-v3') || model.includes('bge-m3') || model.includes('voyage') || model.includes('bge-large'):
        dimensions = 1024;
        break;
      case model.includes('cohere'):
        dimensions = 4096;
        break;
      case model.includes('voyage-3-lite'):
        dimensions = 512;
        break;
      case model.includes('bge') || model.includes('bert') || model.includes('bce-embedding-base'):
        dimensions = 768;
        break;
      case model.includes('all-minilm'):
        dimensions = 384;
        break;
      case model.includes('mxbai-embed-large'):
        dimensions = 1024;
        break;
      case model.includes('nomic-embed-text'):
        dimensions = 768;
        break;
      case model.includes('bge-large-en'):
        dimensions = 1024;
        break;
      default:
        if (userConfigDimensions == 0 || userConfigDimensions == undefined || !userConfigDimensions) {
          throw new Error('Must set the embedding dimension in ai Settings > Embed Settings > Advanced Settings');
        }
    }
    if (userConfigDimensions != 0 && userConfigDimensions != undefined) {
      dimensions = userConfigDimensions;
    }
    await vectorStore.createIndex({ indexName: 'blinko', dimension: dimensions, metric: 'cosine' });
  }

  static async globalConfig() {
    return await getGlobalConfig({ useAdmin: true });
  }

  static async getAiProvider(id: number) {
    return await prisma.aiProviders.findUnique({
      where: { id },
      include: { models: true }
    });
  }

  static async getAllAiProviders() {
    return await prisma.aiProviders.findMany({
      include: { models: true },
      orderBy: { sortOrder: 'asc' }
    });
  }

  static async getAiModel(id: number) {
    return await prisma.aiModels.findUnique({
      where: { id },
      include: { provider: true }
    });
  }

  static async getAiModelsByCapability(capability: string) {
    return await prisma.aiModels.findMany({
      where: {
        capabilities: {
          path: [capability],
          equals: true
        }
      },
      include: { provider: true },
      orderBy: { sortOrder: 'asc' }
    });
  }


  static async ValidConfig() {
    const globalConfig = await AiModelFactory.globalConfig();
    if (!globalConfig.mainModelId) {
      throw new Error('Main AI model not configured!');
    }
    return await AiModelFactory.globalConfig();
  }

  static async GetProvider() {
    const globalConfig = await AiModelFactory.ValidConfig();
    if (!globalConfig.mainModelId) {
      throw new Error('Main AI model configuration not found!');
    }
    const mainModel = await AiModelFactory.getAiModel(globalConfig.mainModelId);
    if (!mainModel) {
      throw new Error('Main AI model configuration not found!');
    }

    const embeddingModel = globalConfig.embeddingModelId
      ? await AiModelFactory.getAiModel(globalConfig.embeddingModelId)
      : null;

    const audioModel = globalConfig.voiceModelId
      ? await AiModelFactory.getAiModel(globalConfig.voiceModelId)
      : null;

    const imageModel = globalConfig.imageModelId
      ? await AiModelFactory.getAiModel(globalConfig.imageModelId)
      : null;

    // Initialize providers
    const llmProvider = new LLMProvider();
    const embeddingProvider = new EmbeddingProvider();
    const audioProvider = new AudioProvider();

    // Create LLM configuration
    const llmConfig = {
      provider: mainModel.provider.provider,
      apiKey: mainModel.provider.apiKey,
      baseURL: mainModel.provider.baseURL,
      modelKey: mainModel.modelKey,
      apiVersion: (mainModel.provider.config as any)?.apiVersion
    };

    // Get LLM instance
    const llm = await llmProvider.getLanguageModel(llmConfig);

    // Get Embedding instance (if configured)
    let embeddings: EmbeddingModelV1<string> | null = null;
    if (embeddingModel) {
      const embeddingConfig = {
        provider: embeddingModel.provider.provider,
        apiKey: embeddingModel.provider.apiKey,
        baseURL: embeddingModel.provider.baseURL,
        modelKey: embeddingModel.modelKey,
        apiVersion: (embeddingModel.provider.config as any)?.apiVersion
      };
      embeddings = await embeddingProvider.getEmbeddingModel(embeddingConfig);
    }

    // Get Audio instance (if configured)
    let audio: MastraVoice | null = null;
    if (audioModel) {
      const audioConfig = {
        provider: audioModel.provider.provider,
        apiKey: audioModel.provider.apiKey,
        baseURL: audioModel.provider.baseURL,
        modelKey: audioModel.modelKey,
        apiVersion: (audioModel.provider.config as any)?.apiVersion
      };
      audio = await audioProvider.getAudioModel(audioConfig);
    }

    // Get utilities
    const vectorStore = await AiUtilities.VectorStore();
    const markdownSplitter = AiUtilities.MarkdownSplitter();
    const tokenTextSplitter = AiUtilities.TokenTextSplitter();

    return {
      LLM: llm,
      VectorStore: vectorStore,
      Embeddings: embeddings,
      MarkdownSplitter: markdownSplitter,
      TokenTextSplitter: tokenTextSplitter,
      audioModel: audio,
      // Keep for backward compatibility
      provider: {
        llmProvider,
        embeddingProvider,
        audioProvider
      }
    };
  }
  static async BaseChatAgent({ withTools = true, withOnlineSearch = false, withMcpTools = true, extraInstructions }: { withTools?: boolean; withOnlineSearch?: boolean; withMcpTools?: boolean; extraInstructions?: string }) {
    const provider = await AiModelFactory.GetProvider();
    let tools: Record<string, any> = {};
    if (withTools) {
      tools = {
        tools: {
          upsertBlinkoTool,
          searchBlinkoTool,
          updateBlinkoTool,
          deleteBlinkoTool,
          webExtra,
          webSearchTool,
          createCommentTool,
          createScheduledTaskTool,
          deleteScheduledTaskTool,
          listScheduledTasksTool,
        },
      };
    }
    if (withOnlineSearch) {
      tools = {
        tools: { ...tools?.tools, webSearchTool },
      };
    }

    // Load MCP tools if enabled
    if (withMcpTools && withTools) {
      try {
        const hasMcp = await hasMcpServers();
        if (hasMcp) {
          const mcpTools = await getMcpMastraTools();
          if (Object.keys(mcpTools).length > 0) {
            tools = {
              tools: { ...tools?.tools, ...mcpTools },
            };
            console.log(`[AI] Loaded ${Object.keys(mcpTools).length} MCP tools`);
          }
        }
      } catch (error) {
        console.error('[AI] Failed to load MCP tools:', error);
        // Continue without MCP tools - don't break the agent
      }
    }

    const globalConfig = await AiModelFactory.globalConfig();
    const defaultInstructions =
      `Today is ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n` +
      'You are a versatile AI assistant who can:\n' +
      '1. Answer questions and explain concepts\n' +
      '2. Provide suggestions and analysis\n' +
      '3. Help with planning and organizing ideas\n' +
      '4. Assist with content creation and editing\n' +
      '5. Perform basic calculations and reasoning\n\n' +
      "6. When using 'web-search-tool' to return results, use the markdown link format to mark the origin of the page" +
      "7. When using 'search-blinko-tool', The entire content of the note should not be returned unless specifically specified by the user " +
      "Always respond in the user's language.\n" +
      'Maintain a friendly and professional conversational tone.';

    const baseInstructions = `Today is ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n` + globalConfig.globalPrompt || defaultInstructions;
    const instructions = extraInstructions ? `${baseInstructions}\n\n${extraInstructions}` : baseInstructions;

    const BlinkoAgent = new Agent({
      name: 'Blinko Chat Agent',
      instructions,
      model: provider?.LLM!,
      ...tools,
    });

    const mastra = new Mastra({
      agents: { BlinkoAgent },
      logger: process.env.NODE_ENV === 'development' ? new PinoLogger({
        name: 'Mastra',
        level: 'debug',
      }) : undefined
    });
    return mastra.getAgent('BlinkoAgent');
  }

  static #createAgentFactory(
    name: string,
    systemPrompt: string | ((customPrompt?: string) => string),
    loggerName: string,
    options?: {
      tools?: Record<string, any>;
      isWritingAgent?: boolean;
    },
  ) {
    return async (type?: 'expand' | 'polish' | 'custom' | string) => {
      const provider = await AiModelFactory.GetProvider();
      const finalPrompt = typeof systemPrompt === 'function' ? systemPrompt(type!) : systemPrompt;

      const agent = new Agent({
        name: options?.isWritingAgent ? `${name} - ${type}` : name,
        instructions: finalPrompt,
        model: provider?.LLM!,
        ...(options?.tools || {}),
      });

      return new Mastra({
        agents: { agent },
        logger: process.env.NODE_ENV === 'development' ? new PinoLogger({
          name: 'Mastra',
          level: 'debug',
        }) : undefined,
      }).getAgent('agent');
    };
  }

  static TagAgent = AiModelFactory.#createAgentFactory(
    'Blinko Tagging Agent',
    (customPrompt?: string) => {
      console.log(customPrompt, 'customPrompt');
      if (customPrompt) {
        return customPrompt;
      }
      return `你是个人博客的标签分类专家，根据笔记内容从现有标签列表中选择或生成标签。

规则：
1. 【数量硬性限制】最多输出 3 个标签，宁缺毋滥。若 1-2 个标签已能精准覆盖核心主题，就只输出 1-2 个。
2. 【精准优先】只选与内容核心主题直接相关的标签，禁止为凑数添加宽泛、弱相关或无区分度的标签。
3. 【优先复用】优先从现有标签列表中选择，能覆盖主题时不要新建同义或近似标签。
4. 【层级结构】选择已有标签时使用其完整层级路径（如 #技术/数据库 而非 #数据库）；需要新建标签时，也尽量挂到合适的已有父标签下。
5. 【语言一致】新标签的语言与笔记内容语言保持一致（中文笔记用中文标签）。
6. 【输出格式】只输出标签本身，以空格分隔（示例：#技术/数据库 #产品思考），不要编号、不要解释、不要输出任何其他文字。`;
    },
    'BlinkoTag',
  );

  static EmojiAgent = AiModelFactory.#createAgentFactory(
    'Blinko Emoji Agent',
    `You are an emoji recommendation expert. Rules:
     1. Analyze content theme and emotion
     2. Return 4-10 comma-separated emojis
     3. Use '💻,🔧' for tech content, '😊,🎉' for emotional content
     4. Must be separated by comma like '💻,🔧'`,
    'BlinkoEmoji',
  );

  static RelatedNotesAgent = AiModelFactory.#createAgentFactory(
    'Blinko Related Notes Agent',
    `You are a keyword extraction expert. Your task is to extract the most representative keywords from the provided note content.

    Rules:
    1. Analyze note content to identify core themes, concepts, and key information
    2. Extract 5-8 keywords or phrases that accurately summarize the content
    3. Ensure the extracted keywords are specific and can be used to find related notes
    4. Sort the extracted keywords by importance from high to low
    5. Return a comma-separated list of keywords without any additional formatting or explanation
    6. Keywords should accurately express the content theme, not too broad or specific
    7. If the note content includes professional terms or technical content, please ensure that the keywords include these terms

    Example output:
    machine learning, neural network, deep learning, TensorFlow, image recognition`,
    'BlinkoRelatedNotes',
  );

  static CommentAgent = AiModelFactory.#createAgentFactory(
    'Blinko Comment Agent',
    `You are Blinko Comment Assistant. Guidelines:
     1. Use Markdown formatting
     2. Include 1-2 relevant emojis
     3. Maintain professional tone
     4. Keep responses concise (50-150 words)
     5. Match user's language`,
    'BlinkoComment',
  );

  static SummarizeAgent = AiModelFactory.#createAgentFactory(
    'Blinko Summary Agent',
    `You are a conversation title summarizer. Rules:
      1. Summarize the content 
      2. Return the title only
      3. Generate titles based on the user's language
      4. Do not return any punctuation marks in the result
      5. Keep it short and concise`,
    'BlinkoSummary',
  );

  static WritingAgent = AiModelFactory.#createAgentFactory(
    'Blinko Writing Agent',
    (type) => {
      const prompts = {
        expand: `# Text Expansion Expert
          ## Original Content
          {content}

          ## Requirements
          1. Use same language as input
          2. Add details/examples without introducing new concepts
          3. Maintain original structure and style
          4. Use Markdown formatting
          5. Output format with markdown
          6. Do not add explanation`,

        polish: `# Text Refinement Specialist
          ## Input Text
          {content}

          ## Guidelines
          1. Optimize sentence flow and vocabulary
          2. Preserve core meaning
          3. Apply technical writing standards
          4. Use Markdown formatting
          5. Output format with markdown`,

        custom: `# Multi-Purpose Writing Assistant
            ## User Request
            {content}

            ## Requirements
            1. Create content as needed
            2. Follow industry-standard documentation
            3. Use Markdown formatting
            4. Output format with markdown`,
      };
      return prompts[type as 'expand' | 'polish' | 'custom'] || prompts['custom'];
    },
    'BlinkoWriting',
    { isWritingAgent: true },
  );

  static TestConnectAgent = AiModelFactory.#createAgentFactory('Blinko Test Connect Agent', `Test the api is working,return 1 words`, 'BlinkoTestConnect');

  static ImageEmbeddingAgent = AiModelFactory.#createAgentFactory(
    'Blinko Image Embedding Agent',
    `You are a vision assistant. When provided an image, you must:
1) Describe the image in detail (objects, scenes, layout, style, colors).
2) Extract and return all visible text in the image (OCR) accurately.
If the underlying model does not support image inputs, respond exactly with: not support image`,
    'BlinkoImageEmbedding',
  );

  static async readImage(
    imagePath: string,
    options?: { maxEdge?: number; quality?: number; toJPEG?: boolean; background?: string },
  ): Promise<{ dataUrl: string; mime: string }> {
    const { maxEdge = 1024, quality = 70, toJPEG = true, background = '#ffffff' } = options || {};
    try {
      let pipeline = sharp(imagePath).rotate();
      pipeline = pipeline.resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true });
      if (toJPEG) {
        // Remove alpha channel when converting to JPEG
        pipeline = pipeline.flatten({ background }).jpeg({ quality, mozjpeg: true });
      }
      const buffer = await pipeline.toBuffer();
      const mime = toJPEG ? 'image/jpeg' : path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, mime };
    } catch (err) {
      // Fallback to original file if compression fails
      const fallbackMime = path.extname(imagePath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
      return { dataUrl: `data:${fallbackMime};base64,${fs.readFileSync(imagePath, 'base64')}`, mime: fallbackMime };
    }
  }

  static async describeImage(imagePath: string): Promise<string> {
    try {
      const agent = await AiModelFactory.ImageEmbeddingAgent();
      console.log(imagePath, 'imagePath');
      const { dataUrl, mime } = await AiModelFactory.readImage(imagePath);
      const response = await agent.generate(
        [
          {
            role: 'user',
            content: [
              { type: 'image', image: dataUrl, mimeType: mime },
              {
                type: 'text',
                text: 'Describe the image in detail, and extract all the text in the image.',
              },
            ],
          },
        ],
        { temperature: 0.3 },
      );
      console.log(response.text?.trim(), 'response.text?.trim()');
      return response.text?.trim() || '';
    } catch (error) {
      console.log(error, 'error');
      // Fallback when model/provider does not support images or any error occurs
      return 'not support image';
    }
  }

  // static async GetAudioLoader(audioPath: string) {
  //   const globalConfig = await AiModelFactory.ValidConfig()
  //   if (globalConfig.aiModelProvider == 'OpenAI') {
  //     const provider = new OpenAIModelProvider({ globalConfig })
  //     return provider.AudioLoader(audioPath)
  //   } else {
  //     throw new Error('not support other loader')
  //   }
  // }
}
