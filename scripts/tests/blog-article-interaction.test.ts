import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  reactionInputSchema,
  feedbackInputSchema,
  feedbackReplySchema,
  REACTION_KINDS,
  isValidEmail,
  FEEDBACK_CONTENT_MAX,
} from "../../shared/lib/blogInteraction";
import {
  publicReactionState,
  setPublicReaction,
  submitArticleFeedback,
  listArticleFeedbacks,
  replyArticleFeedback,
  resendArticleFeedbackMail,
  archiveArticleFeedback,
  reactionRateLimited,
  feedbackRateLimited,
} from "../../server/lib/blogInteraction";

const prisma = new PrismaClient();

/** 一篇真实的公开文章 + 它的作者（博客拥有者）。 */
let article: {
  id: number;
  publishId: string;
  accountId: number;
  title: string;
} | null = null;

const device = (suffix: string) => suffix.padEnd(32, "0").slice(0, 32);

async function cleanup() {
  if (!article) return;
  await prisma.blogArticleFeedbackReply.deleteMany({
    where: { feedback: { noteId: article.id } },
  });
  await prisma.blogArticleFeedback.deleteMany({ where: { noteId: article.id } });
  await prisma.blogArticleReaction.deleteMany({ where: { noteId: article.id } });
}

beforeAll(async () => {
  const owner = await prisma.accounts.findFirst({
    where: { role: "superadmin" },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  const note = owner
    ? await prisma.notes.findFirst({
        where: {
          accountId: owner.id,
          isPublished: true,
          isRecycle: false,
          publishId: { not: null },
          publication: { isNot: null },
        },
        orderBy: { id: "asc" },
        select: {
          id: true,
          publishId: true,
          accountId: true,
          publication: { select: { title: true } },
        },
      })
    : null;
  if (!note || !note.publishId)
    throw new Error("测试需要一篇已公开的文章，请先准备公开内容。");
  article = {
    id: note.id,
    publishId: note.publishId,
    accountId: note.accountId,
    title: note.publication?.title || "",
  };
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("互动入参校验", () => {
  test("表态入参：设备标识与选项合法", () => {
    expect(
      reactionInputSchema.safeParse({
        publishId: "abc",
        deviceId: "a".repeat(32),
        kind: "inspired",
      }).success,
    ).toBe(true);
    // 撤销
    expect(
      reactionInputSchema.safeParse({
        publishId: "abc",
        deviceId: "a".repeat(32),
        kind: null,
      }).success,
    ).toBe(true);
    // 设备标识必须是 32 位十六进制
    expect(
      reactionInputSchema.safeParse({
        publishId: "abc",
        deviceId: "not-a-device",
        kind: "inspired",
      }).success,
    ).toBe(false);
    // 未知表态类型
    expect(
      reactionInputSchema.safeParse({
        publishId: "abc",
        deviceId: "a".repeat(32),
        kind: "confused",
      }).success,
    ).toBe(false);
  });

  test("反馈入参：内容必填、长度、订阅邮箱", () => {
    const base = {
      publishId: "abc",
      type: "question",
      content: "这段写得很清楚。",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: "abcdefgh12345678",
    };
    expect(feedbackInputSchema.safeParse(base).success).toBe(true);
    // 内容为空 / 只有空格
    expect(feedbackInputSchema.safeParse({ ...base, content: "" }).success).toBe(
      false,
    );
    expect(feedbackInputSchema.safeParse({ ...base, content: "   " }).success).toBe(
      false,
    );
    // 超长
    expect(
      feedbackInputSchema.safeParse({
        ...base,
        content: "a".repeat(FEEDBACK_CONTENT_MAX + 1),
      }).success,
    ).toBe(false);
    // 勾了订阅就必须有合法邮箱
    expect(
      feedbackInputSchema.safeParse({ ...base, wantReply: true, email: "" })
        .success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({ ...base, wantReply: true, email: "a@" })
        .success,
    ).toBe(false);
    expect(
      feedbackInputSchema.safeParse({
        ...base,
        wantReply: true,
        email: "reader@example.com",
      }).success,
    ).toBe(true);
    // 没勾订阅时邮箱可以留空
    expect(feedbackInputSchema.safeParse({ ...base, email: "" }).success).toBe(
      true,
    );
    expect(isValidEmail("reader@example.com")).toBe(true);
    expect(isValidEmail("reader@")).toBe(false);
  });

  test("回复入参校验", () => {
    expect(
      feedbackReplySchema.safeParse({ feedbackId: 1, content: "谢谢反馈。" })
        .success,
    ).toBe(true);
    expect(
      feedbackReplySchema.safeParse({ feedbackId: 1, content: "  " }).success,
    ).toBe(false);
  });
});

describe("文章表态", () => {
  const visitor = device("a1");

  beforeAll(async () => {
    await cleanup();
  });

  test("首次表态：计数 +1，自己的选择被记住", async () => {
    const before = await publicReactionState(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
    });
    const after = await setPublicReaction(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
      kind: "inspired",
    });
    expect(after.counts.inspired).toBe(before.counts.inspired + 1);
    expect(after.mine).toBe("inspired");
    // 总回应数 = 三种表态之和
    expect(after.total).toBe(
      REACTION_KINDS.reduce((sum, kind) => sum + after.counts[kind], 0),
    );
  });

  test("再次点击同一项 = 撤销，计数回落", async () => {
    const after = await setPublicReaction(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
      kind: null,
    });
    expect(after.mine).toBeNull();
    expect(after.counts.inspired).toBe(0);
  });

  test("点击其它项 = 替换，不会多计", async () => {
    await setPublicReaction(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
      kind: "inspired",
    });
    const swapped = await setPublicReaction(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
      kind: "useful",
    });
    expect(swapped.mine).toBe("useful");
    expect(swapped.counts.inspired).toBe(0);
    expect(swapped.counts.useful).toBe(1);
    const rows = await prisma.blogArticleReaction.count({
      where: { noteId: article!.id, deviceId: visitor },
    });
    expect(rows).toBe(1);
  });

  test("刷新后能恢复自己的选择", async () => {
    const state = await publicReactionState(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
    });
    expect(state.mine).toBe("useful");
  });

  test("并发表态不会多计数：同一设备只留一行", async () => {
    const racer = device("b2");
    await prisma.blogArticleReaction.deleteMany({
      where: { noteId: article!.id, deviceId: racer },
    });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        setPublicReaction(prisma, {
          publishId: article!.publishId,
          deviceId: racer,
          kind: "resonant",
        }),
      ),
    );
    const rows = await prisma.blogArticleReaction.count({
      where: { noteId: article!.id, deviceId: racer },
    });
    expect(rows).toBe(1);
    const state = await publicReactionState(prisma, {
      publishId: article!.publishId,
      deviceId: racer,
    });
    expect(state.counts.resonant).toBe(1);
    expect(state.mine).toBe("resonant");
  });

  test("数量不会变成负数", async () => {
    const state = await publicReactionState(prisma, {
      publishId: article!.publishId,
      deviceId: device("c3"),
    });
    for (const kind of REACTION_KINDS) expect(state.counts[kind]).toBeGreaterThanOrEqual(0);
    expect(state.total).toBeGreaterThanOrEqual(0);
  });

  test("文章撤回后不能继续表态", async () => {
    await expect(
      setPublicReaction(prisma, {
        publishId: "not-a-real-publish-id",
        deviceId: visitor,
        kind: "inspired",
      }),
    ).rejects.toThrow();
    await expect(
      publicReactionState(prisma, {
        publishId: "not-a-real-publish-id",
        deviceId: visitor,
      }),
    ).rejects.toThrow();
  });

  test("公开表态状态里没有任何读者身份信息", async () => {
    const state = await publicReactionState(prisma, {
      publishId: article!.publishId,
      deviceId: visitor,
    });
    const serialized = JSON.stringify(state);
    expect(serialized.includes("email")).toBe(false);
    expect(serialized.includes("deviceId")).toBe(false);
    expect(Object.keys(state).sort()).toEqual(["counts", "mine", "total"]);
  });
});

describe("读者反馈", () => {
  let key = 0;
  const nextKey = () => `key${Date.now().toString(36)}${key++}`;

  beforeAll(async () => {
    await cleanup();
  });

  test("提交后入库，默认待处理", async () => {
    const result = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "这里的数据来源是怎么来的？",
      nickname: "小明",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    expect(result.duplicate).toBe(false);
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: result.id },
    });
    expect(row?.status).toBe("pending");
    expect(row?.content).toBe("这里的数据来源是怎么来的？");
    expect(row?.nickname).toBe("小明");
  });

  test("同一次提交重试不会新增多条", async () => {
    const idempotencyKey = nextKey();
    const first = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "supplement",
      content: "重试测试",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey,
    });
    const second = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "supplement",
      content: "重试测试",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey,
    });
    expect(second.duplicate).toBe(true);
    expect(second.id).toBe(first.id);
    const rows = await prisma.blogArticleFeedback.count({
      where: { idempotencyKey },
    });
    expect(rows).toBe(1);
  });

  test("读者之后主动再提交 = 新的一条（不同幂等键）", async () => {
    const first = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "第一次",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    const second = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "第二次",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    expect(second.id).not.toBe(first.id);
    expect(second.duplicate).toBe(false);
  });

  test("没勾订阅就不保存邮箱", async () => {
    const result = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "不订阅邮箱",
      nickname: "",
      wantReply: false,
      email: "should-not-be-stored@example.com",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: result.id },
    });
    expect(row?.email).toBe("");
    expect(row?.wantReply).toBe(false);
  });

  test("文章撤回后不能提交反馈", async () => {
    await expect(
      submitArticleFeedback(prisma, {
        publishId: "not-a-real-publish-id",
        type: "question",
        content: "x",
        nickname: "",
        wantReply: false,
        email: "",
        allowPublic: false,
        idempotencyKey: nextKey(),
      }),
    ).rejects.toThrow();
  });

  test("只有文章作者能读到反馈", async () => {
    const mine = await listArticleFeedbacks(prisma, article!.accountId);
    expect(mine.length).toBeGreaterThan(0);
    const others = await listArticleFeedbacks(prisma, 999999);
    expect(others.length).toBe(0);
  });

  test("作者回复：保存回复、状态变已回复、未订阅就不发信", async () => {
    const submitted = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "想请教一下",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    const result = await replyArticleFeedback(prisma, article!.accountId, {
      feedbackId: submitted.id,
      content: "谢谢你的问题，我来补充一下。",
    });
    expect(result.skipped).toBe(true);
    expect(result.mailStatus).toBe("skipped");
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: submitted.id },
      include: { replies: true },
    });
    expect(row?.status).toBe("replied");
    expect(row?.replies.length).toBe(1);
    expect(row?.replies[0].content).toBe("谢谢你的问题，我来补充一下。");
  });

  test("订阅了通知的反馈：回复会尝试发信（未配 SMTP 时如实标记）", async () => {
    const submitted = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "error",
      content: "这里有个笔误",
      nickname: "读者",
      wantReply: true,
      email: "reader@example.com",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    const result = await replyArticleFeedback(prisma, article!.accountId, {
      feedbackId: submitted.id,
      content: "谢谢指出，已经改了。",
    });
    expect(result.skipped).toBe(false);
    expect(["not_configured", "failed", "sent"]).toContain(result.mailStatus);
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: submitted.id },
      include: { replies: true },
    });
    // 邮箱只在后台可见
    expect(row?.email).toBe("reader@example.com");
  });

  test("多条回复各自留档，历史不被覆盖", async () => {
    const submitted = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "多轮回复",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    await replyArticleFeedback(prisma, article!.accountId, {
      feedbackId: submitted.id,
      content: "第一条回复",
    });
    await replyArticleFeedback(prisma, article!.accountId, {
      feedbackId: submitted.id,
      content: "第二条回复",
    });
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: submitted.id },
      include: { replies: { orderBy: { createdAt: "asc" } } },
    });
    expect(row?.replies.length).toBe(2);
    expect(row?.replies[0].content).toBe("第一条回复");
    expect(row?.replies[1].content).toBe("第二条回复");
  });

  test("归档后状态变为已归档", async () => {
    const submitted = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "待归档",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    await archiveArticleFeedback(prisma, article!.accountId, submitted.id);
    const row = await prisma.blogArticleFeedback.findUnique({
      where: { id: submitted.id },
    });
    expect(row?.status).toBe("archived");
    const filtered = await listArticleFeedbacks(
      prisma,
      article!.accountId,
      "archived",
    );
    expect(filtered.some((r) => r.id === submitted.id)).toBe(true);
  });

  test("跨账号不能回复或归档", async () => {
    const submitted = await submitArticleFeedback(prisma, {
      publishId: article!.publishId,
      type: "question",
      content: "归属校验",
      nickname: "",
      wantReply: false,
      email: "",
      allowPublic: false,
      idempotencyKey: nextKey(),
    });
    await expect(
      replyArticleFeedback(prisma, 999999, {
        feedbackId: submitted.id,
        content: "越权回复",
      }),
    ).rejects.toThrow();
    await expect(
      archiveArticleFeedback(prisma, 999999, submitted.id),
    ).rejects.toThrow();
    await expect(
      resendArticleFeedbackMail(prisma, 999999, {
        feedbackId: submitted.id,
        replyId: 1,
      }),
    ).rejects.toThrow();
  });
});

describe("互动接口限流", () => {
  test("表态接口有限流", () => {
    const key = `r-${Date.now()}`;
    expect(reactionRateLimited(key)).toBe(0);
    for (let i = 0; i < 30; i++) reactionRateLimited(key);
    expect(reactionRateLimited(key)).toBeGreaterThan(0);
  });

  test("反馈接口有限流", () => {
    const key = `f-${Date.now()}`;
    expect(feedbackRateLimited(key)).toBe(0);
    for (let i = 0; i < 5; i++) feedbackRateLimited(key);
    expect(feedbackRateLimited(key)).toBeGreaterThan(0);
  });
});
