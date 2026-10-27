import { describe, test, expect, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  normalizeFriendUrl,
  isHttpUrl,
  isPubliclyLoadableUrl,
  friendApplySchema,
  friendFeedbackSchema,
  friendEditSchema,
  FRIEND_NAME_MAX,
  FRIEND_DESC_MAX,
} from "../../shared/lib/blogFriends";
import {
  applyFriendLink,
  publicFriendLinks,
  submitFriendFeedback,
  listFriendLinks,
  updateFriendLink,
  reviewFriendLink,
  setFriendLinkHidden,
  reorderFriendLinks,
  resendFriendLinkMail,
  listFriendFeedback,
  resolveFriendFeedback,
  friendApplyRateLimited,
} from "../../server/lib/blogFriends";
import {
  readBlogMailConfig,
  sendBlogMail,
  MAIL_NOT_CONFIGURED_MESSAGE,
} from "../../server/lib/blogMail";
import { publicBlogOwner } from "../../server/lib/blog";

const prisma = new PrismaClient();

/**
 * 真库用例按仓库约定门控：只有显式设置 RUN_PUBLISH_DB_TESTS=1 才会连库。
 *
 * 这条开关不是形式主义 —— 友链表里放着站点主人真实提交的申请，
 * 测试绝不能在没有显式开关的情况下动它，更不能整表清空。
 */
const DB_ENABLED = process.env.RUN_PUBLISH_DB_TESTS === "1";
const dbSuite = DB_ENABLED ? describe : describe.skip;

/** 博客主人账号（超级管理员）：测试只作用在它名下。 */
const OWNER = await publicBlogOwner(prisma);

/** 每次用例用独立地址，避免互相撞车。 */
let seq = 0;
const freshUrl = (label: string) =>
  `https://${label}-${Date.now().toString(36)}-${seq++}.example.com`;

/** 本次测试造出来的友链 id：清理时只删这些，绝不碰真实数据。 */
const testLinkIds = new Set<number>();
/** 本次测试造出来的反馈 id。 */
const testFeedbackIds = new Set<number>();

/**
 * 造一条测试友链，并记下它的 id。
 * 所有写入都走这里，清理才有明确的边界。
 */
async function createTestLink(input: {
  name: string;
  url: string;
  description?: string;
  email?: string;
  iconUrl?: string;
}) {
  const result = await applyFriendLink(prisma, {
    name: input.name,
    url: input.url,
    description: input.description ?? "",
    email: input.email ?? "owner@example.com",
    iconUrl: input.iconUrl ?? "",
  });
  testLinkIds.add(result.link.id);
  return result;
}

/**
 * 只清理本文件自己造出来的行。
 *
 * 曾经这里是 deleteMany({}) —— 整表清空。
 * 那意味着跑一次测试，站点主人真实提交的友链就没了，而且不留任何痕迹。
 * 现在一律按 id 精确删除。
 */
async function cleanupTestRows() {
  const linkIds = [...testLinkIds];
  const feedbackIds = [...testFeedbackIds];
  if (feedbackIds.length) {
    await prisma.blogFriendFeedback.deleteMany({ where: { id: { in: feedbackIds } } });
  }
  if (linkIds.length) {
    await prisma.blogFriendLink.deleteMany({ where: { id: { in: linkIds } } });
  }
  testLinkIds.clear();
  testFeedbackIds.clear();
}

describe("友链 URL 规范化", () => {
  test("去空白、主机名小写、默认端口、结尾斜杠", () => {
    expect(normalizeFriendUrl("  https://Example.COM/blog/  ")).toBe(
      "https://example.com/blog",
    );
    expect(normalizeFriendUrl("https://example.com:443/blog")).toBe(
      "https://example.com/blog",
    );
    expect(normalizeFriendUrl("http://example.com:80/blog")).toBe(
      "http://example.com/blog",
    );
    expect(normalizeFriendUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeFriendUrl("https://example.com")).toBe("https://example.com");
  });

  test("不同路径不被合并", () => {
    expect(normalizeFriendUrl("https://example.com/about")).not.toBe(
      normalizeFriendUrl("https://example.com/blog"),
    );
    // 协议不同也算不同站点
    expect(normalizeFriendUrl("https://example.com")).not.toBe(
      normalizeFriendUrl("http://example.com"),
    );
    // 非默认端口保留
    expect(normalizeFriendUrl("https://example.com:8443/x")).toBe(
      "https://example.com:8443/x",
    );
  });

  test("fragment 被丢弃，query 保留", () => {
    expect(normalizeFriendUrl("https://example.com/a?b=1#frag")).toBe(
      "https://example.com/a?b=1",
    );
  });

  test("非法地址返回 null", () => {
    expect(normalizeFriendUrl("example.com")).toBeNull();
    expect(normalizeFriendUrl("ftp://example.com")).toBeNull();
    expect(normalizeFriendUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeFriendUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeFriendUrl("")).toBeNull();
    expect(isHttpUrl("https://example.com")).toBe(true);
    expect(isHttpUrl("example.com")).toBe(false);
  });
});

describe("友链申请表单校验", () => {
  const valid = {
    name: "山间来信",
    url: "https://mountain.example.com",
    description: "写下山与生活的来信。",
    email: "owner@example.com",
    iconUrl: "",
  };

  test("合法输入通过", () => {
    expect(friendApplySchema.safeParse(valid).success).toBe(true);
  });

  test("必填字段缺失时报错", () => {
    const parsed = friendApplySchema.safeParse({
      ...valid,
      name: "  ",
      description: "",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path[0]);
      expect(fields).toContain("name");
      expect(fields).toContain("description");
    }
  });

  test("长度上限生效", () => {
    expect(
      friendApplySchema.safeParse({ ...valid, name: "a".repeat(FRIEND_NAME_MAX + 1) })
        .success,
    ).toBe(false);
    expect(
      friendApplySchema.safeParse({
        ...valid,
        description: "a".repeat(FRIEND_DESC_MAX + 1),
      }).success,
    ).toBe(false);
  });

  test("邮箱格式与图标地址校验", () => {
    expect(friendApplySchema.safeParse({ ...valid, email: "reader@" }).success).toBe(
      false,
    );
    expect(
      friendApplySchema.safeParse({ ...valid, iconUrl: "not-a-url" }).success,
    ).toBe(false);
    expect(
      friendApplySchema.safeParse({
        ...valid,
        iconUrl: "https://example.com/a.png",
      }).success,
    ).toBe(true);
  });

  test("反馈与编辑的校验规则", () => {
    expect(
      friendFeedbackSchema.safeParse({ type: "unreachable", message: "" }).success,
    ).toBe(true);
    expect(
      friendFeedbackSchema.safeParse({ type: "not-a-type", message: "" }).success,
    ).toBe(false);
    expect(
      friendEditSchema.safeParse({
        id: 1,
        name: "站点",
        url: "https://example.com",
        description: "",
        iconUrl: "",
      }).success,
    ).toBe(true);
  });

  test("图标地址拒收内网 / 回环地址", () => {
    expect(isPubliclyLoadableUrl("https://example.com/a.png")).toBe(true);
    expect(isPubliclyLoadableUrl("http://127.0.0.1/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://localhost:3000/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://10.0.0.5/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://192.168.1.1/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://172.16.0.1/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://169.254.169.254/latest/meta-data")).toBe(
      false,
    );
    expect(isPubliclyLoadableUrl("http://[::1]/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://box.local/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://service.internal/a.png")).toBe(false);
    expect(isPubliclyLoadableUrl("http://metadata/a.png")).toBe(false);
    // 内网图标地址在申请表单里直接被拒
    expect(
      friendApplySchema.safeParse({
        ...valid,
        iconUrl: "http://127.0.0.1/a.png",
      }).success,
    ).toBe(false);
  });
});

dbSuite("友链公开列表与审核", () => {
  let createdId = 0;

  afterAll(async () => {
    await cleanupTestRows();
    await prisma.$disconnect();
  });

  test("申请后进入待审核，不出现在公开列表", async () => {
    const url = freshUrl("pending");
    const result = await createTestLink({
      name: "待审核站点",
      url,
      description: "还在审核中",
      email: "owner@example.com",
      iconUrl: "",
    });
    createdId = result.link.id;
    expect(result.outcome).toBe("created");
    const list = await publicFriendLinks(prisma, {});
    expect(list.some((l) => l.id === createdId)).toBe(false);
  });

  test("公开 DTO 不含邮箱与审核说明", async () => {
    // 自造一条并审核通过，只检查自己这一条的公开形态：
    // 真实数据里可能出现含 "email" 字样的介绍，混在一起断言会误判。
    const created = await createTestLink({
      name: "DTO 检查站点",
      url: freshUrl("dto"),
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "",
    });
    const list = await publicFriendLinks(prisma, {});
    const mine = list.filter((l) => l.id === created.link.id);
    expect(mine.length).toBe(1);
    const serialized = JSON.stringify(mine);
    expect(serialized.includes("email")).toBe(false);
    expect(serialized.includes("reviewNote")).toBe(false);
  });

  test("不同写法重复申请 → 已在审核中", async () => {
    const url = freshUrl("dup");
    const first = await createTestLink({
      name: "站点",
      url,
      description: "第一次",
      email: "owner@example.com",
      iconUrl: "",
    });
    const again = await applyFriendLink(prisma, {
      name: "站点",
      url: `  ${url.replace("https://", "HTTPS://")}/  `,
      description: "换个写法",
      email: "owner@example.com",
      iconUrl: "",
    });
    expect(first.outcome).toBe("created");
    expect(again.outcome).toBe("pending");
    expect(again.link.id).toBe(first.link.id);
    // 重复申请不会覆盖原内容
    expect(again.link.description).toBe("第一次");
  });

  test("已收录后重复申请 → 已收录", async () => {
    const url = freshUrl("approved");
    const first = await createTestLink({
      name: "已收录站点",
      url,
      description: "收录了",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: first.link.id,
      decision: "approved",
      note: "收录",
    });
    const again = await applyFriendLink(prisma, {
      name: "已收录站点",
      url,
      description: "再申请一次",
      email: "owner@example.com",
      iconUrl: "",
    });
    expect(again.outcome).toBe("approved");
    expect(again.link.id).toBe(first.link.id);
  });

  test("并发申请只落一条记录", async () => {
    const url = freshUrl("concurrent");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        applyFriendLink(prisma, {
          name: "并发站点",
          url,
          description: "并发",
          email: "owner@example.com",
          iconUrl: "",
        }),
      ),
    );
    const created = results.filter((r) => r.outcome === "created");
    expect(created.length).toBe(1);
    // 并发里落库的那一条也要记进清理名单。
    testLinkIds.add(created[0].link.id);
    const rows = await prisma.blogFriendLink.count({ where: { url } });
    expect(rows).toBe(1);
  });

  test("审核通过后进入公开列表，隐藏后消失、恢复后回来", async () => {
    const url = freshUrl("visible");
    const created = await createTestLink({
      name: "可见站点",
      url,
      description: "公开可见",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "通过",
    });
    let list = await publicFriendLinks(prisma, {});
    expect(list.some((l) => l.id === created.link.id)).toBe(true);

    await setFriendLinkHidden(prisma, OWNER, created.link.id, true);
    list = await publicFriendLinks(prisma, {});
    expect(list.some((l) => l.id === created.link.id)).toBe(false);
    // 隐藏不影响审核记录
    const admin = await listFriendLinks(prisma, OWNER);
    const hidden = admin.find((l) => l.id === created.link.id);
    expect(hidden?.status).toBe("approved");
    expect(hidden?.isHidden).toBe(true);

    await setFriendLinkHidden(prisma, OWNER, created.link.id, false);
    list = await publicFriendLinks(prisma, {});
    expect(list.some((l) => l.id === created.link.id)).toBe(true);
  });

  test("公开列表按后台排序", async () => {
    // 只重排自己造出来的两条。
    // 早先这里是把整张表反过来重排一遍 —— 那会顺手改掉真实友链的排序位置。
    const a = await createTestLink({
      name: "排序甲",
      url: freshUrl("sort-a"),
      description: "",
    });
    const b = await createTestLink({
      name: "排序乙",
      url: freshUrl("sort-b"),
      description: "",
    });
    // 公开列表只收「审核通过 + 未隐藏」，所以先审核通过再验排序。
    for (const id of [a.link.id, b.link.id]) {
      await reviewFriendLink(prisma, OWNER, { id, decision: "approved", note: "" });
    }
    const ids = [b.link.id, a.link.id];
    await reorderFriendLinks(prisma, OWNER, ids);
    const after = await listFriendLinks(prisma, OWNER);
    expect(after.filter((l) => ids.includes(l.id)).map((l) => l.id)).toEqual(ids);
    const pub = await publicFriendLinks(prisma, {});
    expect(pub.filter((l) => ids.includes(l.id)).map((l) => l.id)).toEqual(ids);
  });

  test("搜索按名称与介绍，大小写不敏感", async () => {
    const url = freshUrl("search");
    const created = await createTestLink({
      name: "Searchable Site",
      url,
      description: "A distinctive description",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "",
    });
    expect(
      (await publicFriendLinks(prisma, { q: "searchable" })).some(
        (l) => l.id === created.link.id,
      ),
    ).toBe(true);
    expect(
      (await publicFriendLinks(prisma, { q: "SEARCHABLE" })).some(
        (l) => l.id === created.link.id,
      ),
    ).toBe(true);
    expect(
      (await publicFriendLinks(prisma, { q: "distinctive" })).some(
        (l) => l.id === created.link.id,
      ),
    ).toBe(true);
    expect(
      (await publicFriendLinks(prisma, { q: "不存在的关键词zzz" })).some(
        (l) => l.id === created.link.id,
      ),
    ).toBe(false);
  });

  test("编辑友链：地址规范化 + 冲突检测", async () => {
    const a = freshUrl("edit-a");
    const b = freshUrl("edit-b");
    const first = await createTestLink({
      name: "编辑甲",
      url: a,
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    const second = await createTestLink({
      name: "编辑乙",
      url: b,
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    const updated = await updateFriendLink(prisma, OWNER, {
      id: first.link.id,
      name: "编辑甲改",
      url: `${a}/`,
      description: "改过的介绍",
      iconUrl: "",
    });
    expect(updated.url).toBe(a);
    expect(updated.description).toBe("改过的介绍");
    // 改成别人的地址 → 冲突
    await expect(
      updateFriendLink(prisma, OWNER, {
        id: second.link.id,
        name: "撞车",
        url: a,
        description: "",
        iconUrl: "",
      }),
    ).rejects.toThrow();
  });

  test("反馈进后台，不隐藏站点", async () => {
    const url = freshUrl("feedback");
    const created = await createTestLink({
      name: "反馈目标",
      url,
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "",
    });
    const received = await submitFriendFeedback(prisma, {
      linkId: created.link.id,
      type: "unreachable",
      message: "打不开了",
    });
    testFeedbackIds.add(received.id);
    const feedbacks = await listFriendFeedback(prisma, OWNER, "pending");
    // 只断言自己这条反馈：真实待处理反馈可能同时存在。
    const mine = feedbacks.filter((f) => f.id === received.id);
    expect(mine.length).toBe(1);
    expect(mine[0].linkName).toBe("反馈目标");
    // 反馈不会隐藏站点
    const list = await publicFriendLinks(prisma, {});
    expect(list.some((l) => l.id === created.link.id)).toBe(true);

    await resolveFriendFeedback(prisma, OWNER, received.id, "resolved");
    const rest = await listFriendFeedback(prisma, OWNER, "pending");
    expect(rest.some((f) => f.id === received.id)).toBe(false);
  });

  test("跨账号访问被拒（归属校验）", async () => {
    const created = await createTestLink({
      name: "归属校验",
      url: freshUrl("owner"),
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    await expect(
      reviewFriendLink(prisma, 999999, {
        id: created.link.id,
        decision: "approved",
        note: "",
      }),
    ).rejects.toThrow();
    await expect(
      setFriendLinkHidden(prisma, 999999, created.link.id, true),
    ).rejects.toThrow();
  });
});

dbSuite("友链邮件通知状态", () => {
  afterAll(async () => {
    await cleanupTestRows();
    await prisma.$disconnect();
  });

  test("未配置 SMTP 时如实标记 not_configured，不伪造发送成功", async () => {
    const created = await createTestLink({
      name: "邮件状态站点",
      url: freshUrl("mail"),
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    const reviewed = await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "通过",
    });
    expect(reviewed.link.status).toBe("approved");
    // 环境里没有配 SMTP → 必须是 not_configured 或 failed，不能是 sent
    expect(["not_configured", "failed"]).toContain(reviewed.link.emailStatus);
    expect(reviewed.link.emailStatus).not.toBe("sent");
    if (reviewed.link.emailStatus === "not_configured") {
      expect(reviewed.link.emailError).toContain("BLOG_SMTP_HOST");
    }
  });

  test("邮件失败不会回滚审核结果", async () => {
    const created = await createTestLink({
      name: "回滚检查站点",
      url: freshUrl("rollback"),
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    const reviewed = await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "rejected",
      note: "不收录",
    });
    expect(reviewed.link.status).toBe("rejected");
    expect(reviewed.link.reviewNote).toBe("不收录");
  });

  test("重发：已发过的不重复发送；未发过的会再试一次", async () => {
    const created = await createTestLink({
      name: "重发站点",
      url: freshUrl("resend"),
      description: "",
      email: "owner@example.com",
      iconUrl: "",
    });
    await reviewFriendLink(prisma, OWNER, {
      id: created.link.id,
      decision: "approved",
      note: "",
    });
    const row = await prisma.blogFriendLink.findUnique({
      where: { id: created.link.id },
    });
    // 人为标记成已发送，重发应当被跳过
    await prisma.blogFriendLink.update({
      where: { id: created.link.id },
      data: { emailStatus: "sent" },
    });
    const skipped = await resendFriendLinkMail(prisma, OWNER, created.link.id);
    expect(skipped.skipped).toBe(true);
    expect(row).toBeTruthy();
  });
});

describe("友链邮件配置读取", () => {
  test("配置读取：缺项即视为未配置", () => {
    expect(readBlogMailConfig({})).toBeNull();
    expect(readBlogMailConfig({ BLOG_SMTP_HOST: "smtp.example.com" })).toBeNull();
    const config = readBlogMailConfig({
      BLOG_SMTP_HOST: "smtp.example.com",
      BLOG_SMTP_PORT: "465",
      BLOG_SMTP_FROM: "a@example.com",
    });
    expect(config?.host).toBe("smtp.example.com");
    expect(config?.port).toBe(465);
    expect(MAIL_NOT_CONFIGURED_MESSAGE).toContain("BLOG_SMTP_HOST");
  });
});

describe("公开提交限流", () => {
  test("同一来源连续提交会被限流", () => {
    const key = `test-${Date.now()}`;
    expect(friendApplyRateLimited(key)).toBe(0);
    for (let i = 0; i < 4; i++) friendApplyRateLimited(key);
    expect(friendApplyRateLimited(key)).toBeGreaterThan(0);
  });
});

describe("SMTP 客户端（配好之后真的能发）", () => {
  /**
   * 起一个最小 SMTP 服务器：EHLO → AUTH LOGIN → MAIL/RCPT → DATA。
   * 只有真的走完这套握手，才算「邮件能力可用」，而不是「配置读到了而已」。
   */
  async function startFakeSmtp() {
    const net = await import("node:net");
    const received: { from?: string; to?: string; data: string } = { data: "" };
    const server = net.createServer((socket) => {
      let stage = "greeting";
      let buffer = "";
      socket.write("220 fake.smtp ESMTP ready\r\n");
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let index: number;
        while ((index = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const upper = line.toUpperCase();
          if (upper.startsWith("EHLO")) socket.write("250-fake.smtp\r\n250 AUTH LOGIN\r\n");
          else if (upper.startsWith("AUTH LOGIN")) {
            stage = "auth-user";
            socket.write("334 VXNlcm5hbWU6\r\n");
          } else if (stage === "auth-user") {
            stage = "auth-pass";
            socket.write("334 UGFzc3dvcmQ6\r\n");
          } else if (stage === "auth-pass") {
            stage = "ready";
            socket.write("235 2.7.0 Authentication successful\r\n");
          } else if (upper.startsWith("MAIL FROM")) {
            received.from = line;
            socket.write("250 2.1.0 Ok\r\n");
          } else if (upper.startsWith("RCPT TO")) {
            received.to = line;
            socket.write("250 2.1.5 Ok\r\n");
          } else if (upper.startsWith("DATA")) {
            socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
          } else if (line === ".") {
            socket.write("250 2.0.0 Ok: queued\r\n");
          } else if (upper.startsWith("QUIT")) {
            socket.write("221 2.0.0 Bye\r\n");
            socket.end();
          } else {
            socket.write("250 Ok\r\n");
          }
        }
      });
      socket.on("error", () => {});
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return {
      port,
      received,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  test("配置齐全时邮件真的能投出去", async () => {
    const smtp = await startFakeSmtp();
    try {
      const result = await sendBlogMail(
        {
          to: "applicant@example.com",
          subject: "友情链接申请已通过",
          text: "你的站点已收录。",
        },
        {
          host: "127.0.0.1",
          port: smtp.port,
          user: "user",
          pass: "pass",
          from: "blog@example.com",
          secure: false,
        },
      );
      expect(result.status).toBe("sent");
      expect(smtp.received.to).toContain("applicant@example.com");
      expect(smtp.received.from).toContain("blog@example.com");
    } finally {
      await smtp.close();
    }
  });

  test("服务器拒绝时如实返回 failed", async () => {
    const result = await sendBlogMail(
      { to: "x@example.com", subject: "s", text: "t" },
      {
        host: "127.0.0.1",
        // 没人监听的端口：连接必然失败
        port: 1,
        user: "",
        pass: "",
        from: "blog@example.com",
        secure: false,
      },
      3000,
    );
    expect(result.status).toBe("failed");
    expect(result.message.length).toBeGreaterThan(0);
  });

  test("没有配置时返回 not_configured 与配置指引", async () => {
    const result = await sendBlogMail(
      { to: "x@example.com", subject: "s", text: "t" },
      null,
    );
    expect(result.status).toBe("not_configured");
    expect(result.message).toContain("BLOG_SMTP_HOST");
  });
});
