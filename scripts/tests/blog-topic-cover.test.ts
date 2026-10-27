import { test, expect } from "bun:test";
import sharp from "sharp";
import { generateTopicCover } from "../../server/lib/blogTopicCover";

const model = {
  id: 1,
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
    accountId: 7,
    updatedAt: new Date(1000),
    notes: [
      { note: { publication: { title: "公开文章标题", summary: "公开摘要" } } },
    ],
  };
  const db: any = {
    attachments: {
      findFirstOrThrow: async (query: any) => {
        expect(query.where).toEqual({
          path: "/api/file/cover.webp",
          accountId: 7,
        });
        return { id: 99, path: "/api/file/cover.webp", name: "cover.webp" };
      },
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
    aiModels: { findMany: async () => (options.noModel ? [] : [model]) },
  };
  return { db, topic };
}
test("专题封面复用生图与上传，生成候选不直接更改专题", async () => {
  const { db, topic } = fixture();
  let uploads = 0;
  const raw = await sharp({
    create: { width: 100, height: 100, channels: 3, background: "#7051ff" },
  })
    .png()
    .toBuffer();
  const result = await generateTopicCover(
    db,
    7,
    { topicId: 12, name: "产品思考", desc: "从问题到方案" },
    {
      fetcher: fetch,
      generate: async (_model, prompt) => {
        expect(prompt).toContain("产品思考");
        expect(prompt).toContain("公开文章标题");
        expect(prompt).toContain("No text");
        return raw;
      },
      upload: async (args: any) => {
        uploads++;
        const info = await sharp(args.buffer).metadata();
        expect(info.width).toBe(1600);
        expect(info.height).toBe(900);
        expect(args.accountId).toBe(7);
        expect(args.metadata.blogAITopicCover.topicId).toBe(12);
        return {
          filePath: "/api/file/cover.webp",
          fileName: "cover.webp",
        } as any;
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
    generateTopicCover(db, 7, { topicId: 12, name: "标题", desc: "" }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test("缺少生图配置给出清晰提示", async () => {
  const { db } = fixture({ noModel: true });
  await expect(
    generateTopicCover(db, 7, { topicId: 12, name: "标题", desc: "" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});
test("生成期间专题发生变化则拒绝上传", async () => {
  const { db } = fixture({ changed: true });
  let uploads = 0;
  const raw = await sharp({
    create: { width: 50, height: 50, channels: 3, background: "#7051ff" },
  })
    .png()
    .toBuffer();
  await expect(
    generateTopicCover(
      db,
      7,
      { topicId: 12, name: "标题", desc: "" },
      {
        fetcher: fetch,
        generate: async () => raw,
        upload: async () => {
          uploads++;
          return {} as any;
        },
      },
    ),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(uploads).toBe(0);
});
