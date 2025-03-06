import { cache } from '@/lib/cache';
import { AzureOpenAIModelProvider } from './providers/azureOpenAI';
import { OpenAIModelProvider } from './providers/openAI';
import { getGlobalConfig } from '@/server/routers/config';
import { OllamaModelProvider } from './providers/ollama';
import { AnthropicModelProvider } from './providers/anthropic';
import { Agent } from '@mastra/core/agent';
import { upsertBlinkoTool } from './tools/createBlinko';
import { LibSQLVector } from '@mastra/core/vector/libsql';
import { DeepSeekModelProvider } from './providers/deepseek';
import dayjs from 'dayjs';
import { createLogger, Mastra } from '@mastra/core';
import { LanguageModelV1, EmbeddingModelV1 } from '@ai-sdk/provider';
import { MarkdownTextSplitter, TokenTextSplitter } from '@langchain/textsplitters';
import { embed } from 'ai';
import { prisma } from '@/server/prisma';
import { _ } from '@/lib/lodash';
import { GeminiModelProvider } from './providers/gemini';
import { GrokModelProvider } from './providers/grok';
import { OpenRouterModelProvider } from './providers/openRouter';
import { webSearchTool } from './tools/webSearch';
import { webExtra } from './tools/webExtra';
import { searchBlinkoTool } from './tools/searchBlinko';
import { updateBlinkoTool } from './tools/updateBlinko';
import { deleteBlinkoTool } from './tools/deleteBlinko';

export class AiModelFactory {
  //metadata->>'id'
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

  static async queryVector(query: string, accountId: number) {
    const { VectorStore, Embeddings } = await AiModelFactory.GetProvider();
    const config = await AiModelFactory.globalConfig();
    const topK = config.embeddingTopK ?? 3;
    const embeddingMinScore = config.embeddingScore ?? 0.4;
    const { embedding } = await embed({
      value: query,
      model: Embeddings,
    });
    const result = await VectorStore.query('blinko', embedding, topK);
    const filteredResults = result.filter(({ score }) => score > embeddingMinScore);

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
              },
            },
          },
        })
      ).map((i) => {
        return { ...i, score: filteredResults.find((t) => Number(t.metadata?.id) == i.id)?.score ?? 0 };
      }) ?? [];

    let aiContext = filteredResults.filter((i) => i.metadata?.isAttachment).map((i) => i.metadata?.text + '\n') || '';
    return { notes, aiContext: aiContext };
  }

  static async rebuildVectorIndex({ vectorStore, isDelete = false }: { vectorStore: LibSQLVector; isDelete?: boolean }) {
    try {
      if (isDelete) {
        await vectorStore.deleteIndex('blinko');
      }
    } catch (error) {
      console.error('delete vector index failed:', error);
    }

    const config = await AiModelFactory.globalConfig();
    const model = config.embeddingModel.toLowerCase();
    let userConfigDimensions = config.embeddingDimensions;
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
    await vectorStore.createIndex('blinko', dimensions, 'cosine');
  }

  static async globalConfig() {
    return cache.wrap(
      'globalConfig',
      async () => {
        return await getGlobalConfig({ useAdmin: true });
      },
      { ttl: 1000 },
    );
  }

  static async ValidConfig() {
    const globalConfig = await AiModelFactory.globalConfig();
    if (!globalConfig.aiModelProvider || !globalConfig.isUseAI) {
      throw new Error('model provider or apikey not configure!');
    }
    return await AiModelFactory.globalConfig();
  }

  static async GetProvider() {
    const globalConfig = await AiModelFactory.ValidConfig();

    return cache.wrap(
      `GetProvider-
      ${globalConfig.aiModelProvider}-
      ${globalConfig.aiApiKey}-
      ${globalConfig.embeddingModel}-
      ${globalConfig.embeddingApiKey}-
      ${globalConfig.aiModel}-
      ${globalConfig.aiApiEndpoint}-
      ${globalConfig.embeddingTopK}-
      ${globalConfig.embeddingScore}
      `,
      async () => {
        const createProviderResult = async (provider: any) => ({
          LLM: provider.LLM() as LanguageModelV1,
          VectorStore: (await provider.VectorStore()) as LibSQLVector,
          Embeddings: provider.Embeddings() as EmbeddingModelV1<string>,
          MarkdownSplitter: provider.MarkdownSplitter() as MarkdownTextSplitter,
          TokenTextSplitter: provider.TokenTextSplitter() as TokenTextSplitter,
        });

        switch (globalConfig.aiModelProvider) {
          case 'OpenAI':
            return createProviderResult(new OpenAIModelProvider({ globalConfig }));
          case 'AzureOpenAI':
            return createProviderResult(new AzureOpenAIModelProvider({ globalConfig }));
          case 'Ollama':
            return createProviderResult(new OllamaModelProvider({ globalConfig }));
          case 'DeepSeek':
            return createProviderResult(new DeepSeekModelProvider({ globalConfig }));
          case 'Anthropic':
            return createProviderResult(new AnthropicModelProvider({ globalConfig }));
          case 'Grok':
            return createProviderResult(new GrokModelProvider({ globalConfig }));
          case 'Gemini':
            return createProviderResult(new GeminiModelProvider({ globalConfig }));
          case 'OpenRouter':
            return createProviderResult(new OpenRouterModelProvider({ globalConfig }));
          default:
            throw new Error(`Unsupported AI model provider: ${globalConfig.aiModelProvider}`);
        }
      },
      { ttl: 24 * 60 * 60 * 1000 },
    );
  }
  static async BaseChatAgent({ withTools = true, withOnlineSearch = false }: { withTools?: boolean; withOnlineSearch?: boolean }) {
    //globel.model.name cache
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
        },
      };
    }
    if (withOnlineSearch) {
      tools = {
        tools: { ...tools?.tools, webSearchTool },
      };
    }
    const BlinkoAgent = new Agent({
      name: 'Blinko Chat Agent',
      instructions:
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
        'Maintain a friendly and professional conversational tone.',
      model: provider?.LLM!,
      ...tools,
    });

    const mastra = new Mastra({
      agents: { BlinkoAgent },
      logger: createLogger({ name: 'Blinko', level: 'debug' }),
    });
    return mastra.getAgent('BlinkoAgent');
  }

  static #createAgentFactory(
    name: string,
    systemPrompt: string | ((type?: string) => string),
    loggerName: string,
    options?: {
      tools?: Record<string, any>;
      isWritingAgent?: boolean;
    },
  ) {
    return async (type?: 'expand' | 'polish' | 'custom') => {
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
        logger: createLogger({ name: loggerName, level: 'info' }),
      }).getAgent('agent');
    };
  }

  static TagAgent = AiModelFactory.#createAgentFactory(
    'Blinko Tagging Agent',
    `You are a precision tag classification expert. Rules:
     1. Select 5 most relevant tags from existing list
     2. Create new tags in #category/subcategory format if needed
     3. Return comma-separated tags only
     4. Must start with #`,
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
      return prompts[type || 'custom'];
    },
    'BlinkoWriting',
    { isWritingAgent: true },
  );

  static TestConnectAgent = AiModelFactory.#createAgentFactory('Blinko Test Connect Agent', `Test the api is working,return 1 words`, 'BlinkoTestConnect');

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
