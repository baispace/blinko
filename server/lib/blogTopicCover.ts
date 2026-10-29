import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import {
  coverPrompt,
  generateImageBytes,
  imageProtocol,
  normalizeCoverBase,
} from "./blogCoverGeneration";
import { FileService } from "./files";
import { fetchWithProxy } from "./proxy";

import { preferCoverModels, coverArtPlan, COVER_ART_VERSION } from "../../shared/lib/blogCoverArt";

const pending = new Set<number>();
/** Generate a private candidate; only saveTopic makes it the selected topic cover. */
export async function generateTopicCover(
  db: PrismaClient,
  accountId: number,
  input: { topicId: number; name: string; desc: string },
  dependencies?: {
    generate?: typeof generateImageBytes;
    upload?: typeof FileService.uploadFile;
    fetcher?: typeof fetch;
  },
) {
  if (pending.has(accountId))
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "封面正在生成，请稍候。",
    });
  pending.add(accountId);
  try {
    const topic = await db.blogTopic.findFirst({
      where: { id: input.topicId, accountId },
      include: {
        notes: {
          where: { note: { isPublished: true, isRecycle: false } },
          take: 8,
          orderBy: { sortOrder: "asc" },
          select: {
            note: {
              select: {
                publication: { select: { title: true, summary: true } },
              },
            },
          },
        },
      },
    });
    if (!topic)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "专题不存在或无权管理。",
      });
    const models = await db.aiModels.findMany({
      include: { provider: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    const model = preferCoverModels(models).find(
      (model) => imageProtocol(model) && model.provider.apiKey?.trim(),
    );
    if (!model)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "请先在 AI 设置中配置可用的生图模型。",
      });
    const context = input.desc + "\n" + topic.notes
      .map((member) => member.note.publication?.title || "")
      .join("、");
    const prompt = coverPrompt(input.name, context);
    const raw = await (dependencies?.generate || generateImageBytes)(
      model,
      prompt,
      dependencies?.fetcher || (await fetchWithProxy()),
    );
    const buffer = await normalizeCoverBase(raw);
    // Recheck after a slow model call; a deleted or transferred topic cannot be applied.
    const current = await db.blogTopic.findFirst({
      where: { id: input.topicId, accountId },
    });
    if (!current || current.updatedAt.getTime() !== topic.updatedAt.getTime())
      throw new TRPCError({
        code: "CONFLICT",
        message: "专题已变化，请重新读取后生成封面。",
      });
    const image = await (
      dependencies?.upload || ((args) => FileService.uploadFile(args))
    )({
      buffer,
      originalName: `ink-topic-cover-${topic.id}-${crypto.randomUUID()}.webp`,
      type: "image/webp",
      accountId,
      metadata: {
        blogAITopicCover: {
          topicId: topic.id,
          modelId: model.id,
          artVersion: COVER_ART_VERSION,
          artPlan: coverArtPlan(input.name, context),
          prompt,
          width: 1600,
          height: 900,
        },
      },
    });
    const attachment = await db.attachments.findFirstOrThrow({
      where: { path: image.filePath, accountId },
    });
    return { id: attachment.id, path: attachment.path, name: attachment.name };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "专题封面生成失败，请重试或检查模型配置。",
    });
  } finally {
    pending.delete(accountId);
  }
}
