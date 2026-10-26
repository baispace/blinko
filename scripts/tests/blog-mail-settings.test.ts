import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import {
  blogMailSettingsSchema,
  blogMailSettingsView,
} from "../../shared/lib/blogMailSettings";
import {
  blogMailConfigFromSettings,
  readBlogMailConfig,
  MAIL_NOT_CONFIGURED_MESSAGE,
} from "../../server/lib/blogMail";
import {
  readBlogMailSettings,
  saveBlogMailSettings,
  resolveBlogMailConfig,
} from "../../server/lib/blogMailSettings";

/**
 * 邮件服务的后台配置。
 *
 * 真库用例按仓库约定门控：只有显式设置 RUN_PUBLISH_DB_TESTS=1 才会连库。
 * 用例只作用在自己新建的测试账号上，绝不碰站点主人的配置。
 */
const DB_ENABLED = process.env.RUN_PUBLISH_DB_TESTS === "1";
const dbSuite = DB_ENABLED ? describe : describe.skip;

describe("邮件设置的形状", () => {
  test("缺 host / port / from 任意一项都算没配", () => {
    const base = {
      host: "smtp.example.com",
      port: 465,
      secure: true,
      user: "user@example.com",
      pass: "secret",
      from: "blog@example.com",
    };
    expect(blogMailConfigFromSettings(base)).not.toBeNull();
    expect(blogMailConfigFromSettings({ ...base, host: "" })).toBeNull();
    expect(blogMailConfigFromSettings({ ...base, port: 0 })).toBeNull();
    expect(blogMailConfigFromSettings({ ...base, from: "  " })).toBeNull();
  });

  test("读给后台的视图里没有密码，只有「是否已设置」", () => {
    const data = blogMailSettingsSchema.parse({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      user: "user@example.com",
      pass: "secret",
      from: "blog@example.com",
    });
    const view = blogMailSettingsView(data);
    expect(view.hasPass).toBe(true);
    expect("pass" in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(blogMailSettingsView(blogMailSettingsSchema.parse({})).hasPass).toBe(false);
  });

  test("未配置提示同时给出后台入口与环境变量两条路", () => {
    expect(MAIL_NOT_CONFIGURED_MESSAGE).toContain("邮件服务");
    expect(MAIL_NOT_CONFIGURED_MESSAGE).toContain("BLOG_SMTP_HOST");
  });

  test("环境变量那条路仍然独立可用（没有后台配置时的兜底）", () => {
    expect(readBlogMailConfig({})).toBeNull();
    expect(
      readBlogMailConfig({
        BLOG_SMTP_HOST: "smtp.example.com",
        BLOG_SMTP_PORT: "465",
        BLOG_SMTP_FROM: "a@example.com",
      })?.host,
    ).toBe("smtp.example.com");
  });
});

dbSuite("邮件设置在库里的读写", () => {
  const db = new PrismaClient();
  let accountId = 0;

  beforeAll(async () => {
    accountId = (
      await db.accounts.create({
        data: { name: "mail-settings-" + crypto.randomUUID() },
      })
    ).id;
  });

  afterAll(async () => {
    await db.config.deleteMany({ where: { userId: accountId } });
    await db.accounts.deleteMany({ where: { id: accountId } });
    await db.$disconnect();
  });

  const payload = {
    host: "smtp.example.com",
    port: 465,
    secure: true,
    user: "user@example.com",
    from: "blog@example.com",
  };

  test("保存后读回来，密码不外传", async () => {
    const before = await readBlogMailSettings(db, accountId);
    expect(before.configured).toBe(false);
    const saved = await saveBlogMailSettings(
      db,
      accountId,
      { ...payload, pass: "first-secret" },
      before.revision,
    );
    expect(saved.configured).toBe(true);
    expect(blogMailSettingsView(saved.data).hasPass).toBe(true);
    expect(JSON.stringify(blogMailSettingsView(saved.data))).not.toContain(
      "first-secret",
    );
  });

  test("密码留空表示沿用，clearPass 才清空", async () => {
    const current = await readBlogMailSettings(db, accountId);
    const kept = await saveBlogMailSettings(
      db,
      accountId,
      { ...payload, port: 587 },
      current.revision,
    );
    expect(kept.data.pass).toBe("first-secret");
    expect(kept.data.port).toBe(587);

    const cleared = await saveBlogMailSettings(
      db,
      accountId,
      { ...payload, clearPass: true },
      kept.revision,
    );
    expect(cleared.data.pass).toBe("");
    expect(blogMailSettingsView(cleared.data).hasPass).toBe(false);
  });

  test("并发修改会被 revision 拦下", async () => {
    const current = await readBlogMailSettings(db, accountId);
    // 先改一次内容 —— revision 是内容哈希，内容变了 revision 才跟着变。
    await saveBlogMailSettings(db, accountId, { ...payload, port: 25 }, current.revision);
    await expect(
      saveBlogMailSettings(db, accountId, { ...payload, port: 26 }, current.revision),
    ).rejects.toThrow("已在其他窗口更新");
  });

  test("生效来源：后台配置优先，后台没配就回落环境变量", async () => {
    const saved = await saveBlogMailSettings(
      db,
      accountId,
      { ...payload, pass: "secret" },
      (await readBlogMailSettings(db, accountId)).revision,
    );
    const fromSettings = await resolveBlogMailConfig(db, accountId);
    expect(fromSettings.source).toBe("settings");
    expect(fromSettings.config?.host).toBe("smtp.example.com");

    // 清空后台配置（host 留空即视为没配）→ 回落环境变量。
    await saveBlogMailSettings(
      db,
      accountId,
      { ...payload, host: "", pass: "" },
      saved.revision,
    );
    const previous = {
      BLOG_SMTP_HOST: process.env.BLOG_SMTP_HOST,
      BLOG_SMTP_PORT: process.env.BLOG_SMTP_PORT,
      BLOG_SMTP_FROM: process.env.BLOG_SMTP_FROM,
      BLOG_SMTP_USER: process.env.BLOG_SMTP_USER,
      BLOG_SMTP_PASS: process.env.BLOG_SMTP_PASS,
      BLOG_SMTP_SECURE: process.env.BLOG_SMTP_SECURE,
    };
    process.env.BLOG_SMTP_HOST = "smtp.env.example.com";
    process.env.BLOG_SMTP_PORT = "587";
    process.env.BLOG_SMTP_FROM = "env@example.com";
    try {
      const fromEnv = await resolveBlogMailConfig(db, accountId);
      expect(fromEnv.source).toBe("env");
      expect(fromEnv.config?.host).toBe("smtp.env.example.com");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
