-- 友情链接：申请即入库，审核通过后进入公开列表。
-- 邮箱与审核说明只存在这张表里，公开接口永远不读它们。
CREATE TABLE IF NOT EXISTS "blogFriendLink" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    -- 规范化后的站点地址（去重靠它），规则见 shared/lib/blogFriends.ts
    "url" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "iconUrl" VARCHAR(500) NOT NULL DEFAULT '',
    "email" VARCHAR(120) NOT NULL DEFAULT '',
    -- 审核状态：pending / approved / rejected
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- 审核说明（内部可见）
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    -- 隐藏公开展示：与审核状态分开管
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    -- 邮件通知状态：none / sent / failed / not_configured
    "emailStatus" VARCHAR(16) NOT NULL DEFAULT 'none',
    "emailSentAt" TIMESTAMPTZ(6),
    "emailError" TEXT NOT NULL DEFAULT '',
    "emailAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogFriendLink_pkey" PRIMARY KEY ("id")
);

-- 同一站点地址只能有一条记录：并发重复申请由这个唯一约束挡住
CREATE UNIQUE INDEX IF NOT EXISTS "blogFriendLink_accountId_url_key"
    ON "blogFriendLink" ("accountId", "url");

CREATE INDEX IF NOT EXISTS "blogFriendLink_accountId_status_isHidden_sortOrder_idx"
    ON "blogFriendLink" ("accountId", "status", "isHidden", "sortOrder");

-- 异常链接反馈：一次反馈不隐藏站点，只进后台待处理列表。
CREATE TABLE IF NOT EXISTS "blogFriendFeedback" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "linkId" INTEGER,
    "linkName" VARCHAR(120) NOT NULL DEFAULT '',
    "linkUrl" VARCHAR(300) NOT NULL DEFAULT '',
    "type" VARCHAR(24) NOT NULL DEFAULT 'other',
    "message" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogFriendFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blogFriendFeedback_accountId_status_createdAt_idx"
    ON "blogFriendFeedback" ("accountId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "blogFriendFeedback_linkId_idx"
    ON "blogFriendFeedback" ("linkId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogFriendLink_accountId_fkey'
    ) THEN
        ALTER TABLE "blogFriendLink"
            ADD CONSTRAINT "blogFriendLink_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogFriendFeedback_accountId_fkey'
    ) THEN
        ALTER TABLE "blogFriendFeedback"
            ADD CONSTRAINT "blogFriendFeedback_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogFriendFeedback_linkId_fkey'
    ) THEN
        ALTER TABLE "blogFriendFeedback"
            ADD CONSTRAINT "blogFriendFeedback_linkId_fkey"
            FOREIGN KEY ("linkId") REFERENCES "blogFriendLink"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
