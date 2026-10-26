-- 阅读埋点表：浏览器设备 ID 去重后的站点/文章访问统计。
--
-- 一行 = 一次「有效点击」。同一设备对同一篇文章，如果在滑动窗口内又打开
-- （多半是刷新），服务端就只留一行；因此 count(*) 是有效点击数，
-- count(distinct "deviceId") 是去重后的读者数（同一台设备在多篇文章上
-- 只算一个站点用户）。
--
-- 服务端只拿到浏览器生成的随机 ID，拿不到 IP、UA 或任何指纹 —— 这是这套统计
-- 能公开放在站点上的前提。
--
-- 同样是手写迁移：prisma migrate dev 表达不了 notes_content_trgm_idx 等 GIN
-- trigram 索引，每次 diff 都会想删它们并顺手把迁移写成破坏性的。这里只建表 +
-- 建索引，不碰别的表。重建 trigram 索引的命令见 20261015160000_list_performance/migration.sql。
CREATE TABLE IF NOT EXISTS "blogPageView" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    "deviceId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogPageView_pkey" PRIMARY KEY ("id")
);

-- 滑动窗口判重：查这个设备在这篇文章上的最后一次阅读。
CREATE INDEX IF NOT EXISTS "blogPageView_noteId_deviceId_createdAt_idx"
    ON "blogPageView" ("noteId", "deviceId", "createdAt" DESC);

-- 站点级统计：去重设备数、每日趋势。
CREATE INDEX IF NOT EXISTS "blogPageView_accountId_deviceId_idx"
    ON "blogPageView" ("accountId", "deviceId");
CREATE INDEX IF NOT EXISTS "blogPageView_accountId_createdAt_idx"
    ON "blogPageView" ("accountId", "createdAt");

ALTER TABLE "blogPageView"
    ADD CONSTRAINT "blogPageView_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
