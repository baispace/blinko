import { test, expect } from "bun:test";
import { createRequire } from "node:module";
const sharp = createRequire(import.meta.dir + "/../../server/index.js")("sharp");
import { generateAssetCover } from "../../server/lib/assetCoverGeneration";

/**
 * 专题封面与笔记配图走同一条生图入口（generateAssetCover）。
 *
 * 这里盯的是统一之后仍然要成立的几件事：
 *   - 取景包含专题简介与成员文章标题；
 *   - 生成的是候选图，不直接改专题；
 *   - 专题变了、没权限、没配生图模型，都要说清楚。
 */

const model = {
  id: 1,
  title: "image",
  modelKey: "gpt-image-1",
  capabilities: { imageGeneration: true },
  provider: {
    provider: "openai",
    apiKey: "SECRET_KEY",
    baseURL: "https://example.com/v1",
  },
};
function fixture(
  options: { missing?: boolean; changed?: boolean; noModel?: boolean } = {},
) {
  let reads = 0;
  const topic = {
    id: 12,
    name: "产品思考",
    desc: "从问题到方案",
    updatedAt: new Date(1000),
    notes: [{ note: { publication: { title: "公开文章标题" } } }],
  };
  const db: any = {
    attachments: {
      findFirstOrThrow: async () => ({ id: 99, path: "/api/file/cover.webp", name: "cover.webp" }),
    },
    blogTopic: {
      findFirst: async (query: any) => {
        expect(query.where.accountId).toBe(7);
        reads++;
        return options.missing
          ? null
          : {
              ...topic,
              updatedAt: new Date(options.changed && reads > 1 ? 2000 : 1000),
            };
      },
    },
    aiModels: {
      findMany: async () => (options.noModel ? [] : [model]),
      findUnique: async () => (options.noModel ? null : model),
    },
  };
  return { db, topic };
}
const target = { type: "topic" as const, id: 12 };

test("专题封面按「简介 + 成员文章标题」取景，生成候选不改专题", async () => {
  const { db, topic } = fixture();
  let uploads = 0;
  const raw = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#7051ff" },
  })
    .png()
    .toBuffer();
  const result = await generateAssetCover(
    db,
    7,
    { target, sourceVersion: new Date(1000).toISOString(), modelId: 1 },
    {
      fetcher: fetch,
      generate: async (_model, prompt) => {
        expect(prompt).toContain("产品思考");
        expect(prompt).toContain("公开文章标题");
        // 独立成图的产物：图里不许有字。
        expect(prompt).toContain("NO text");
        return raw;
      },
      upload: async (args: any) => {
        uploads++;
        const info = await sharp(args.buffer).metadata();
        expect(info.width).toBe(1600);
        expect(info.height).toBe(900);
        expect(args.accountId).toBe(7);
        expect(args.metadata.aiCover.assetKind).toBe("illustration");
        return { filePath: "/api/file/cover.webp", fileName: "cover.webp" } as any;
      },
    },
  );
  expect(result.id).toBe(99);
  expect(uploads).toBe(1);
  expect(JSON.stringify(result)).not.toContain("SECRET_KEY");
  expect(topic).not.toHaveProperty("coverAttachmentId");
});

test("无权限的专题不能调用模型", async () => {
  const { db } = fixture({ missing: true });
  await expect(
    generateAssetCover(db, 7, { target, sourceVersion: new Date(1000).toISOString(), modelId: 1 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("缺少生图配置给出清晰提示", async () => {
  const { db } = fixture({ noModel: true });
  await expect(
    generateAssetCover(db, 7, { target, sourceVersion: new Date(1000).toISOString(), modelId: 1 }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("生成期间专题发生变化则拒绝上传", async () => {
  const { db } = fixture({ changed: true });
  const raw = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#7455ef" },
  })
    .png()
    .toBuffer();
  let uploads = 0;
  await expect(
    generateAssetCover(db, 7, { target, sourceVersion: new Date(1000).toISOString(), modelId: 1 }, {
      generate: async () => raw,
      fetcher: fetch,
      upload: async () => {
        uploads++;
        return {} as any;
      },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(uploads).toBe(0);
});
