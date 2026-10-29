import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import {
  coverPrompt,
  coverPromptForModel,
  imageProtocol,
  imageRequest,
  generateImageBytes,
  cropCoverToRatio,
  publicImageIP,
  coverGenerationOptions,
  generateBlogCover,
  applyCoverToDraft,
} from "../../server/lib/blogCoverGeneration";
import { publishSnapshot } from "../../server/lib/publication";
import { isPublicBlogAsset } from "../../server/lib/blog";
const model: any = {
  id: 1,
  title: "test",
  modelKey: "gpt-image-1",
  capabilities: { imageGeneration: true },
  provider: {
    provider: "openai",
    apiKey: "fixture-key",
    baseURL: "https://example.com/v1",
  },
};
describe("image adapter and crop", () => {
  test("prompt uses article topic and site style; input is bounded and plain text", () => {
    const prompt = coverPrompt(
      "<b>指标</b>",
      "<h2>公开正文</h2>\n" + "资料".repeat(1000),
    );
    expect(prompt).toContain("指标");
    expect(prompt).toContain("cobalt blue to azure");
    expect(prompt).not.toContain("<h2>");
    expect(prompt.length).toBeLessThan(1500);
    expect(prompt).toContain('产品功能发布封面');
    expect(prompt).toContain('No text');
    expect(prompt).toContain('cropped by the right edge');
    expect(prompt).toContain('禁止：低饱和');
    // 参考封面抽象出来的风格契约：哑光质感 + 饱和渐变 + 纯白界面。
    expect(prompt).toContain('Clean 3D app-icon illustration');
    expect(prompt).toContain('the backdrop uses exactly this gradient');
    expect(prompt).toContain('Surfaces solid white and pale grey-blue');
    expect(prompt).toContain('Matte premium materials, not plastic');
  });
  test("all model briefs retain wordless and crop constraints within provider limit", () => {
    for (const style of ["ink"] as const) {
      const args = ["标题".repeat(100), "正文".repeat(1000), style, "细节".repeat(200)] as const;
      const standard = coverPromptForModel({modelKey:"image-01"}, ...args);
      const live = coverPromptForModel({modelKey:"image-01-live"}, ...args);
      expect(live).toBe(standard);
      expect(standard.length).toBeLessThanOrEqual(1500);
      const request = imageRequest({...model, modelKey:"image-01-live", provider:{...model.provider, provider:"minimax"}}, standard);
      expect(request.body.prompt).toBe(standard);
      expect(request.body).not.toHaveProperty("style");
      expect(request.body).not.toHaveProperty("subject_reference");
      expect(request.body.n).toBe(1);
      expect(standard).toContain("the left 38% must stay clean");
      expect(standard).toContain("no duplicate copies");
      expect(standard).toContain("No text");
      expect(standard).toContain("tabletop");
      expect(standard).toContain("circular hub");
      expect(standard).toContain("thin extruded side face");
    }
  });
  test("长标题 + 长正文 + 画面要求也不会超出服务商上限", () => {
    // MiniMax 侧按 1500 字符截断，超了就悄悄丢掉尾部的硬约束。
    const worst = coverPrompt(
      "标".repeat(80),
      "内".repeat(80),
      "ink",
      "细".repeat(100),
    );
    expect(worst.length).toBeLessThanOrEqual(1500);
    expect(worst).toContain("禁止：低饱和粉紫摄影棚。");
    expect(worst).toContain("No text, letters, numbers, logos");
    // 空间不够时先牺牲作者的画面要求，风格契约不能丢。
    expect(worst).toContain("Clean 3D app-icon illustration");
  });
  test("画面要求优先吃掉剩余预算，硬约束永远完整", () => {
    const roomy = coverPrompt("短标题", "短正文", "ink", "一只铅笔和三个卡片");
    expect(roomy).toContain("Optional detail: 一只铅笔和三个卡片");
    // 标题与正文都很长时，画面要求被截短，但尾巴一字不少。
    const tight = coverPrompt(
      "标".repeat(80),
      "内".repeat(80),
      "ink",
      "细节".repeat(100),
    );
    expect(tight.length).toBeLessThanOrEqual(1500);
    expect(tight.endsWith("禁止：低饱和粉紫摄影棚。")).toBe(true);
  });
  test("protocols reuse configured endpoints and distinguish text-only models", () => {
    expect(
      imageProtocol({ ...model, capabilities: { inference: true } }),
    ).toBeNull();
    expect(imageRequest(model, "a cover").url).toBe(
      "https://example.com/v1/images/generations",
    );
    expect(imageRequest(model, "a cover").body).not.toHaveProperty(
      "response_format",
    );
    expect(
      imageRequest(
        {
          ...model,
          modelKey: "image-01",
          config: { imageGenerationProtocol: "minimax" },
        },
        "a cover",
      ).url,
    ).toBe("https://example.com/v1/image_generation");
    expect(() =>
      imageRequest(
        { ...model, provider: { ...model.provider, apiKey: "" } },
        "a cover",
      ),
    ).toThrow();
  });
  test("capability checkbox cannot turn MiniMax M3.1 into an image model", () => {
    expect(
      imageProtocol({ ...model, modelKey: "MiniMax-M3.1-Flash" }),
    ).toBeNull();
    expect(() =>
      imageRequest({ ...model, modelKey: "MiniMax-M3.1-Flash" }, "test"),
    ).toThrow("Image-01");
  });
  test("provider base64 result becomes real, metadata-free WebP; output errors do not expose provider payloads", async () => {
    const png = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#7055f8" },
    })
      .png()
      .toBuffer();
    const bytes = await generateImageBytes(model, "test", async () =>
      Response.json({ data: [{ b64_json: png.toString("base64") }] }),
    );
    expect((await sharp(bytes).metadata()).format).toBe("webp");
    await expect(
      generateImageBytes(
        model,
        "test",
        async () => new Response("secret-key-echo", { status: 401 }),
      ),
    ).rejects.toThrow("鉴权失败");
    await expect(
      generateImageBytes(model, "test", async () =>
        Response.json({ data: [{ url: "http://127.0.0.1/private" }] }),
      ),
    ).rejects.toThrow();
    await expect(
      generateImageBytes(model, "test", async () =>
        Response.json({
          data: [{ b64_json: Buffer.from("<svg/>").toString("base64") }],
        }),
      ),
    ).rejects.toThrow();
  });
  test("MiniMax native URL images are downloaded without forwarding API credentials; unsafe redirects are rejected", async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#7055f8" },
    })
      .png()
      .toBuffer();
    const native = {
      ...model,
      modelKey: "image-01",
      provider: { ...model.provider, provider: "minimax" },
    };
    const fetcher: any = async (url: any, init: any) => {
      if (String(url).includes("image_generation")) {
        expect(JSON.parse(init.body).aspect_ratio).toBe("16:9");
        return Response.json({
          data: { image_urls: ["https://8.8.8.8/generated.png"] },
          base_resp: { status_code: 0 },
        });
      }
      expect(init.headers).toBeUndefined();
      return new Response(png);
    };
    expect(
      (
        await sharp(
          await generateImageBytes(native, "test", fetcher),
        ).metadata()
      ).format,
    ).toBe("webp");
    const redirect: any = async (url: any) =>
      String(url).includes("image_generation")
        ? Response.json({
            data: { image_urls: ["https://8.8.8.8/generated.png"] },
          })
        : new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/private" },
          });
    await expect(
      generateImageBytes(native, "test", redirect),
    ).rejects.toThrow();
  });
  test("裁切按目标比例出图，焦点位置取两端也不越界", async () => {
    const png = await sharp({
      create: { width: 500, height: 700, channels: 3, background: "#7055f8" },
    })
      .png()
      .toBuffer();
    for (const [x, y] of [
      [0, 100],
      [100, 0],
      [50, 50],
    ]) {
      const meta = await sharp(
        await cropCoverToRatio(png, { width: 1600, height: 900, focus: { x, y } }),
      ).metadata();
      expect([meta.width, meta.height]).toEqual([1600, 900]);
    }
    // 分享图是 1200×630：比例不同，裁出来的尺寸也不同。
    const share = await sharp(
      await cropCoverToRatio(png, { width: 1200, height: 630 }),
    ).metadata();
    expect([share.width, share.height]).toEqual([1200, 630]);
  });
  test("remote image destinations reject local and reserved network addresses", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "192.168.0.1",
      "169.254.169.254",
      "::1",
      "::ffff:127.0.0.1",
      "fe80::1",
      "fd00::1",
    ])
      expect(publicImageIP(ip)).toBe(false);
    expect(publicImageIP("8.8.8.8")).toBe(true);
    expect(publicImageIP("2606:4700:4700::1111")).toBe(true);
  });
});
const suite =
  process.env.RUN_PUBLISH_DB_TESTS === "1" ? describe : describe.skip;
suite("AI cover draft lifecycle", () => {
  const db = new PrismaClient();
  let owner = 0,
    other = 0,
    noteId = 0,
    modelId = 0,
    providerId = 0;
  let revision = 0;
  let png: Buffer;
  let candidate: { id: number; path: string; revision: number };
  const upload: any = async (args: any) => {
    const path = "/api/file/test-cover-" + crypto.randomUUID() + ".webp";
    await db.attachments.create({
      data: {
        accountId: args.accountId,
        path,
        name: "test cover",
        type: "image/webp",
        size: args.buffer.length,
        metadata: args.metadata,
      },
    });
    return { filePath: path, fileName: "test.webp" };
  };
  beforeAll(async () => {
    owner = (
      await db.accounts.create({
        data: { name: "cover-" + crypto.randomUUID() },
      })
    ).id;
    other = (
      await db.accounts.create({
        data: { name: "cover-other-" + crypto.randomUUID() },
      })
    ).id;
    const n = await db.notes.create({
      data: {
        accountId: owner,
        content: "# 公开内容\n生图依据",
        metadata: { title: "文章主题" },
      },
    });
    noteId = n.id;
    await publishSnapshot(db, owner, { id: noteId });
    revision = (
      await db.notePublication.findUniqueOrThrow({ where: { noteId } })
    ).revision;
    await db.notes.update({
      where: { id: noteId },
      data: { content: "SECRET_PRIVATE_DRAFT" },
    });
    providerId = (
      await db.aiProviders.create({
        data: {
          title: "cover test",
          provider: "openai",
          baseURL: "https://example.com/v1",
          apiKey: "fixture-key",
        },
      })
    ).id;
    modelId = (
      await db.aiModels.create({
        data: {
          providerId,
          title: "cover-test",
          modelKey: "gpt-image-1",
          capabilities: { imageGeneration: true },
        },
      })
    ).id;
    png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#7055f8" },
    })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    if (owner) {
      await db.notes.deleteMany({ where: { accountId: owner } });
      await db.attachments.deleteMany({ where: { accountId: owner } });
      await db.accounts.delete({ where: { id: owner } });
    }
    if (other) await db.accounts.delete({ where: { id: other } });
    if (providerId) await db.aiProviders.delete({ where: { id: providerId } });
    await db.$disconnect();
  });
  test("configuration lists no secrets and prompt reads only publication", async () => {
    const options = await coverGenerationOptions(db, owner, noteId);
    expect(options.prompt).toContain("公开内容");
    expect(options.prompt).not.toContain("SECRET_PRIVATE_DRAFT");
    expect(JSON.stringify(options)).not.toContain("fixture-key");
    expect(options.models.find((m) => m.id === modelId)?.available).toBe(true);
    await expect(coverGenerationOptions(db, other, noteId)).rejects.toThrow();
  });
  test("generation saves private candidate without changing either cover pointer", async () => {
    candidate = await generateBlogCover(
      db,
      owner,
      {
        noteId,
        modelId,
        direction: "紫蓝色插画",
        style: "ink",
        revision,
      },
      { generate: async () => png, upload },
    );
    expect(candidate.path).toContain("/api/file/");
    const p = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    expect(p.coverAttachmentId).toBeNull();
    expect(p.draftCoverAttachmentId).toBeNull();
    expect(await isPublicBlogAsset(db, candidate.path)).toBe(false);
  });
  test("应用封面只写草稿：底图进草稿指针，文字进草稿配置，公开快照不动", async () => {
    const result = await applyCoverToDraft(db, owner, {
      noteId,
      attachmentId: candidate.id,
      config: {
        mode: "overlay",
        templateVersion: "v1",
        title: "召回三段式改造",
        subtitle: "先校准分数再融合",
        align: "left",
        sizeScale: 1,
        palette: "violet",
      },
    });
    const p = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    // 公开快照没动：底图指针与文字配置都还是空的。
    expect(p.coverAttachmentId).toBeNull();
    expect(p.coverConfig).toBeNull();
    // 草稿指针指向这张底图 —— 一张图，不按场景各存一张。
    expect(p.draftCoverAttachmentId).toBe(candidate.id);
    const note = await db.notes.findUniqueOrThrow({ where: { id: noteId } });
    const draft = (note.metadata as any)?.blogCover;
    expect(draft?.title).toBe("召回三段式改造");
    expect(draft?.subtitle).toBe("先校准分数再融合");
    expect(draft?.mode).toBe("overlay");
    // 草稿封面还不是公开资源。
    const file = await db.attachments.findUniqueOrThrow({
      where: { id: candidate.id },
    });
    expect(await isPublicBlogAsset(db, file.path)).toBe(false);
    // 别人的账号不能改这篇的封面。
    await expect(
      applyCoverToDraft(db, other, {
        noteId,
        attachmentId: candidate.id,
        config: {
          mode: "overlay",
          templateVersion: "v1",
          title: "越权",
          subtitle: "",
          align: "left",
          sizeScale: 1,
          palette: "violet",
        },
      }),
    ).rejects.toThrow();
  });
  test("发布后底图与文字配置一起进公开快照，版本变了旧候选不能再应用", async () => {
    await publishSnapshot(db, owner, { id: noteId });
    const p = await db.notePublication.findUniqueOrThrow({ where: { noteId } });
    expect(p.coverAttachmentId).toBe(p.draftCoverAttachmentId);
    // 文字配置也跟着进了公开快照。
    const config = (p.coverConfig ?? {}) as any;
    expect(config.title).toBe("召回三段式改造");
    expect(config.mode).toBe("overlay");
    const file = await db.attachments.findUniqueOrThrow({
      where: { id: p.coverAttachmentId! },
    });
    expect(await isPublicBlogAsset(db, file.path)).toBe(true);
    // 版本已经变了，还拿旧版本号来应用要被挡住。
    await expect(
      applyCoverToDraft(db, owner, {
        noteId,
        attachmentId: candidate.id,
        expectedRevision: revision,
        config: {
          mode: "overlay",
          templateVersion: "v1",
          title: "旧版本",
          subtitle: "",
          align: "left",
          sizeScale: 1,
          palette: "violet",
        },
      }),
    ).rejects.toThrow("公开文章已更新");
    await expect(
      generateBlogCover(
        db,
        owner,
        { noteId, modelId, direction: "test direction", style: "ink", revision },
        { generate: async () => png, upload },
      ),
    ).rejects.toThrow("公开文章已更新");
  });
});
