-- 阅读统计改成「明细 + 计数器」两层：
--   blogPageView  原始事实（每次有效阅读一行），滑动窗口判重、读者去重、趋势都靠它
--   blogPostStat  文章级计数器，公开页读数直接读这里，不再实时 COUNT 明细表
--   blogDevice    站点级设备档案，站点总用户数 = 跨文章去重后的设备数
--
-- 三张表都在 Postgres 里，不引入 Redis —— 自托管和桌面版都只要一个数据库。
--
-- 同样是手写迁移：prisma migrate dev 表达不了 notes_content_trgm_idx 等 GIN
-- trigram 索引，每次 diff 都会想删它们并顺手把迁移写成破坏性的。这里只建表 +
-- 建索引 + 回填，不碰别的表。重建 trigram 索引的命令见 20261015160000_list_performance/migration.sql。
CREATE TABLE IF NOT EXISTS "blogPostStat" (
    "noteId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "readers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogPostStat_pkey" PRIMARY KEY ("noteId")
);

CREATE INDEX IF NOT EXISTS "blogPostStat_accountId_idx" ON "blogPostStat" ("accountId");

CREATE TABLE IF NOT EXISTS "blogDevice" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogDevice_pkey" PRIMARY KEY ("id")
);

-- 一个浏览器在站点只有一份档案：跨文章去重的站点用户数就靠这个唯一键。
CREATE UNIQUE INDEX IF NOT EXISTS "blogDevice_accountId_deviceId_key"
    ON "blogDevice" ("accountId", "deviceId");
CREATE INDEX IF NOT EXISTS "blogDevice_accountId_firstSeenAt_idx"
    ON "blogDevice" ("accountId", "firstSeenAt");

ALTER TABLE "blogPostStat"
    ADD CONSTRAINT "blogPostStat_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 回填：把已经记下的明细灌进新计数器，两边口径保持一致。
INSERT INTO "blogPostStat" ("noteId", "accountId", "views", "readers", "createdAt", "updatedAt")
SELECT v."noteId",
       v."accountId",
       COUNT(*),
       COUNT(DISTINCT v."deviceId"),
       MIN(v."createdAt"),
       MAX(v."createdAt")
FROM "blogPageView" v
GROUP BY v."noteId", v."accountId"
ON CONFLICT ("noteId") DO NOTHING;

INSERT INTO "blogDevice" ("accountId", "deviceId", "firstSeenAt", "lastSeenAt")
SELECT v."accountId",
       v."deviceId",
       MIN(v."createdAt"),
       MAX(v."createdAt")
FROM "blogPageView" v
GROUP BY v."accountId", v."deviceId"
ON CONFLICT ("accountId", "deviceId") DO NOTHING;
