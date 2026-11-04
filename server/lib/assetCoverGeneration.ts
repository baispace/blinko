import { prepareGeneratedCover } from "./coverIllustration";
import { coverGenerationJobs as pending } from "./coverGenerationLock";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import {
  coverPromptForModel,
  generateImageBytes,
  imageProtocol,
} from "./blogCoverGeneration";
import {
  coverArtPlan,
  preferCoverModels,
  COVER_ART_VERSION,
} from "../../shared/lib/blogCoverArt";
import { FileService } from "./files";
import { fetchWithProxy } from "./proxy";

export type AssetCoverTarget = {
  type: "note" | "topic";
  id: number;
  title?: string;
  description?: string;
};

/** 生成封面需要的文字来源，以及用于并发保护的版本号。 */
type CoverSource = { title: string; content: string; version: string };

const notFound = () =>
  new TRPCError({ code: "NOT_FOUND", message: "内容不存在或无权访问。" });

/** 笔记没有标题时拿正文首行兜底。 */
function firstLine(content: string) {
  return content.split("\n")[0]?.trim() ?? "";
}

/**
 * 读取封面的文字来源。
 *
 * 笔记与专题的字段名不一样（content / desc），差异只收在这里，
 * 调用方拿到统一的 title + content + version。
 */
async function loadSource(
  db: PrismaClient,
  accountId: number,
  target: AssetCoverTarget,
): Promise<CoverSource> {
  if (target.type === "note") {
    const note = await db.notes.findFirst({
      where: { id: target.id, accountId, isRecycle: false },
    });
    if (!note) throw notFound();
    const metadataTitle = (note.metadata as { title?: unknown } | null)?.title;
    const storedTitle = typeof metadataTitle === "string" ? metadataTitle.trim() : "";
    return {
      title: target.title || storedTitle || firstLine(note.content),
      content: target.description ?? note.content,
      version: note.updatedAt.toISOString(),
    };
  }
  const topic = await db.blogTopic.findFirst({
    where: { id: target.id, accountId },
  });
  if (!topic) throw notFound();
  return {
    title: target.title || topic.name,
    content: target.description ?? topic.desc,
    version: topic.updatedAt.toISOString(),
  };
}

/** 封面助手打开时要用到的上下文：建议标题、可选模型、当前提示词。 */
export async function assetCoverOptions(
  db: PrismaClient,
  accountId: number,
  target: AssetCoverTarget,
) {
  const context = await loadSource(db, accountId, target);
  const models = preferCoverModels(
    await db.aiModels.findMany({
      include: { provider: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
  );
  const preferred = models.find(
    (model) => imageProtocol(model) && model.provider.apiKey?.trim(),
  );
  return {
    suggestedTitle: context.title,
    sourceVersion: context.version,
    revision: 0,
    modelTitle: preferred?.title || "",
    modelKey: preferred?.modelKey || "",
    artPlan: coverArtPlan(context.title, context.content),
    prompt: coverPromptForModel(preferred, context.title, context.content),
    models: models
      .filter((model) => (model.capabilities as Record<string,unknown> | null)?.imageGeneration)
      .map((model) => ({
        id: model.id,
        title: model.title,
        providerTitle: model.provider.title,
        available: !!imageProtocol(model) && !!model.provider.apiKey?.trim(),
        reason: "请检查生图模型和密钥配置。",
      })),
  };
}

export async function generateAssetCover(
  db: PrismaClient,
  accountId: number,
  input: {
    target: AssetCoverTarget;
    sourceVersion: string;
    modelId: number;
    direction?: string;
  },
  dependencies?: {
    generate?: typeof generateImageBytes;
    upload?: typeof FileService.uploadFile;
    fetcher?: typeof fetch;
  },
) {
  if (pending.has(accountId))
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "封面正在生成，请稍候。" });
  pending.add(accountId);
  try {
    const context = await loadSource(db, accountId, input.target);
    if (context.version !== input.sourceVersion)
      throw new TRPCError({
        code: "CONFLICT",
        message: "内容已变化，请重新打开封面助手。",
      });
    const model = await db.aiModels.findUnique({
      where: { id: input.modelId },
      include: { provider: true },
    });
    if (!model || !imageProtocol(model) || !model.provider.apiKey?.trim())
      throw new TRPCError({ code: "BAD_REQUEST", message: "请配置可用的生图模型。" });

    const prompt = coverPromptForModel(
      model,
      context.title,
      context.content,
      "ink",
      input.direction,
    );
    const generate = dependencies?.generate || generateImageBytes;
    const fetcher = dependencies?.fetcher || (await fetchWithProxy());
    /* 只出一张独立素材；位置由程序按规则摆，不让模型排版。 */
    const raw = await generate(model, prompt, fetcher);
    if (!raw)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "模型没有返回图片，请调整描述或检查模型是否支持生图。",
      });

    /* 模型调用可能很慢：回来再确认一次内容没变，变了就整份作废。 */
    const latest = await loadSource(db, accountId, input.target);
    if (latest.version !== context.version)
      throw new TRPCError({
        code: "CONFLICT",
        message: "内容已变化，本次封面未应用，请重新生成。",
      });

    const artPlan = coverArtPlan(context.title, context.content);
    const {image:icon, generationMode} = await prepareGeneratedCover(raw, artPlan);
    const buffer = icon;
    const upload = dependencies?.upload || ((args) => FileService.uploadFile(args));
    const image = await upload({
      buffer,
      originalName: `ink-cover-${input.target.type}-${input.target.id}-${crypto.randomUUID()}.webp`,
      type: "image/webp",
      accountId,
      metadata: {
        aiCover: {
          target: { type: input.target.type, id: input.target.id },
          sourceVersion: context.version,
          modelId: model.id,
          artVersion: COVER_ART_VERSION,
          generationMode,
          composition: null,
          compositionAttempts: 1,
        },
      },
    });
    const attachment = await db.attachments.findFirstOrThrow({
      where: { path: image.filePath, accountId },
    });
    return {
      id: attachment.id,
      path: attachment.path,
      artwork: "tile" as const,
      coverPalette: artPlan.overlayPalette,
      generationMode,
      candidates: [{ id: attachment.id, path: attachment.path }],
    };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "封面生成失败，请检查模型配置或稍后重试。",
    });
  } finally {
    pending.delete(accountId);
  }
}
