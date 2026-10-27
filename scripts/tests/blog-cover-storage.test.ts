import { describe, test, expect } from "bun:test";
import sharp from "sharp";
import { prisma } from "../../server/prisma";
import { getGlobalConfig } from "../../server/routerTrpc/config";
import { FileService } from "../../server/lib/files";
import { publishSnapshot } from "../../server/lib/publication";
import {
  generateBlogCover,
  applyCoverToDraft,
  coverGenerationOptions,
} from "../../server/lib/blogCoverGeneration";
import { isPublicBlogAsset } from "../../server/lib/blog";
const suite =
  process.env.RUN_COVER_STORAGE_TEST === "1" ? describe : describe.skip;
suite(
  "cover integration with real local storage and fixture image server",
  () => {
    test("request → decode → storage → history → crop → stage → explicit publication", async () => {
      const config = await getGlobalConfig({ useAdmin: true });
      if (config.objectStorage === "s3")
        throw new Error(
          "This integration test requires existing local storage and never changes user storage settings.",
        );
      const fixture = await sharp({
        create: { width: 512, height: 384, channels: 3, background: "#7055f8" },
      })
        .png()
        .toBuffer();
      let requests = 0;
      const provider = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(req) {
          requests++;
          expect(new URL(req.url).pathname).toBe("/v1/images/generations");
          const body = (await req.json()) as any;
          expect(body.n).toBe(1);
          expect(body.prompt).toContain("集成测试");
          return Response.json({
            data: [{ b64_json: fixture.toString("base64") }],
          });
        },
      });
      let accountId = 0,
        providerId = 0,
        noteId = 0;
      try {
        accountId = (
          await prisma.accounts.create({
            data: { name: "cover-storage-" + crypto.randomUUID() },
          })
        ).id;
        noteId = (
          await prisma.notes.create({
            data: {
              accountId,
              content: "# 集成测试\n仅测试用公开内容",
              metadata: { title: "集成测试" },
            },
          })
        ).id;
        await publishSnapshot(prisma, accountId, { id: noteId });
        const revision = (
          await prisma.notePublication.findUniqueOrThrow({ where: { noteId } })
        ).revision;
        providerId = (
          await prisma.aiProviders.create({
            data: {
              title: "Test-only image fixture",
              provider: "custom",
              baseURL: `http://127.0.0.1:${provider.port}/v1`,
              apiKey: "test-only-no-real-credentials",
            },
          })
        ).id;
        const model = await prisma.aiModels.create({
          data: {
            providerId,
            title: "Test fixture",
            modelKey: "gpt-image-1",
            capabilities: { imageGeneration: true },
          },
        });
        const candidate = await generateBlogCover(prisma, accountId, {
          noteId,
          modelId: model.id,
          direction: "为集成测试生成一张紫蓝色博客封面",
          style: "ink",
          revision,
        });
        expect(requests).toBe(1);
        expect(candidate.path).toStartWith("/api/file/");
        expect(
          (
            await sharp(
              await FileService.getFileBuffer(candidate.path),
            ).metadata()
          ).format,
        ).toBe("webp");
        expect(await isPublicBlogAsset(prisma, candidate.path)).toBe(false);
        expect(
          (
            await coverGenerationOptions(prisma, accountId, noteId)
          ).candidates.map((c) => c.id),
        ).toContain(candidate.id);
        // 底图统一归一化成 1600×900 —— 模型给的尺寸不一定一样，但不拉伸。
        const baseDimensions = await sharp(
          await FileService.getFileBuffer(candidate.path),
        ).metadata();
        expect([baseDimensions.width, baseDimensions.height]).toEqual([
          1600, 900,
        ]);
        const applied = await applyCoverToDraft(prisma, accountId, {
          noteId,
          attachmentId: candidate.id,
          config: {
            mode: "overlay",
            templateVersion: "v1",
            title: "集成测试封面",
            subtitle: "",
            align: "left",
            sizeScale: 1,
            palette: "violet",
          },
        });
        const attachment = await prisma.attachments.findUniqueOrThrow({
          where: { id: applied.attachmentId },
        });
        const dimensions = await sharp(
          await FileService.getFileBuffer(attachment.path),
        ).metadata();
        expect([dimensions.width, dimensions.height]).toEqual([1600, 900]);
        expect(await isPublicBlogAsset(prisma, attachment.path)).toBe(false);
        const before = await prisma.notePublication.findUniqueOrThrow({
          where: { noteId },
        });
        expect(before.coverAttachmentId).toBeNull();
        expect(before.draftCoverAttachmentId).toBe(applied.attachmentId);
        await publishSnapshot(prisma, accountId, { id: noteId });
        expect(await isPublicBlogAsset(prisma, attachment.path)).toBe(true);
        await publishSnapshot(prisma, accountId, {
          id: noteId,
          isCancel: true,
        });
        expect(await isPublicBlogAsset(prisma, attachment.path)).toBe(false);
      } finally {
        provider.stop(true);
        if (accountId) {
          await prisma.notes.deleteMany({ where: { accountId } });
          const files = await prisma.attachments.findMany({
            where: { accountId },
            select: { path: true },
          });
          for (const file of files) await FileService.deleteFile(file.path);
          await prisma.accounts.delete({ where: { id: accountId } });
        }
        if (providerId)
          await prisma.aiProviders.delete({ where: { id: providerId } });
      }
    });
  },
);
