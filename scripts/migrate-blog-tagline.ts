#!/usr/bin/env bun
/**
 * migrate-blog-tagline.ts — 把作者资料里的旧标语并入站点设置的「站点标语」
 *
 * 背景：公开博客的标语之前存了两份 —— 站点设置里的「站点标语」和公开作者资料里的
 * 「一句话介绍」。读者看到的绝大多数位置（页脚、关于页、动态页、SEO 描述、RSS 描述）
 * 读的都是作者资料那份，站点设置那份只有友链页在用。两处各填各的必然对不上。
 *
 * 现在标语收口到站点设置一个出处，公开页一律读它。这个脚本把作者资料里已经填好的
 * 那句搬过去 —— 搬运只在「站点设置的标语还是默认值」时进行，用户自己写过标语就不动。
 *
 * 用法：
 *   bun scripts/migrate-blog-tagline.ts            # 只看会改什么（默认 dry-run）
 *   bun scripts/migrate-blog-tagline.ts --apply    # 真改
 *   bun scripts/migrate-blog-tagline.ts --apply --keep   # 搬过去但保留作者资料里的旧值
 *
 * 连接参数走 DATABASE_URL（与 Prisma 一致）。
 */
import { PrismaClient } from "@prisma/client";
import { blogSiteSettingsSchema } from "../shared/lib/blogSiteSettings";
import {
  readBlogSiteSettings,
  saveBlogSiteSettings,
} from "../server/lib/blogSiteSettings";

const APPLY = process.argv.includes("--apply");
/** 搬过去但不清空作者资料里的旧值（留给回退旧代码用）。 */
const KEEP = process.argv.includes("--keep");

/** 站点设置的标语默认值：还是它就说明用户从没改过，可以安全搬。 */
const DEFAULT_TAGLINE = blogSiteSettingsSchema.parse({}).tagline;

const db = new PrismaClient();

type Row = {
  accountId: number;
  oldTagline: string;
  currentTagline: string;
  action: "move" | "skip-site-set" | "skip-empty";
};

async function main() {
  const profiles = await db.blogProfile.findMany({
    where: { tagline: { not: "" } },
    select: { accountId: true, tagline: true },
    orderBy: { accountId: "asc" },
  });

  if (!profiles.length) {
    console.log("没有作者资料里填过标语的账号，无需迁移。");
    return;
  }

  const rows: Row[] = [];
  for (const p of profiles) {
    const oldTagline = p.tagline.trim();
    if (!oldTagline) continue;
    const settings = await readBlogSiteSettings(db, p.accountId);
    const currentTagline = settings.data.tagline.trim();
    if (!currentTagline || currentTagline === DEFAULT_TAGLINE) {
      rows.push({
        accountId: p.accountId,
        oldTagline,
        currentTagline,
        action: "move",
      });
    } else {
      rows.push({
        accountId: p.accountId,
        oldTagline,
        currentTagline,
        action: "skip-site-set",
      });
    }
  }

  let moved = 0;
  for (const row of rows) {
    if (row.action === "skip-site-set") {
      console.log(
        `[跳过] 账号 ${row.accountId}：站点设置里已有自己的标语「${row.currentTagline}」，不动。`,
      );
      console.log(`         作者资料里的旧标语「${row.oldTagline}」不再对外生效。`);
      continue;
    }

    const settings = await readBlogSiteSettings(db, row.accountId);
    console.log(`[搬运] 账号 ${row.accountId}：「${row.oldTagline}」→ 站点设置的站点标语`);

    if (!APPLY) continue;

    await saveBlogSiteSettings(
      db,
      row.accountId,
      { ...settings.data, tagline: row.oldTagline },
      settings.revision,
    );
    if (!KEEP) {
      await db.blogProfile.update({
        where: { accountId: row.accountId },
        data: { tagline: "" },
      });
    }
    moved += 1;
  }

  console.log("");
  if (!APPLY) {
    console.log(
      `以上是预览，没有改任何数据。确认无误后加 --apply 执行${
        KEEP ? "（会保留作者资料里的旧值）" : "（会清空作者资料里的旧标语）"
      }。`,
    );
    return;
  }
  console.log(`完成：搬运了 ${moved} 个账号的标语。`);
}

main()
  .catch((e) => {
    console.error("迁移失败：", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
