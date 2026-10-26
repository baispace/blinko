-- 文章互动与反馈。
--
-- 1) 表态：每篇文章每个匿名设备最多一条，唯一约束挡住并发重复计数。
-- 2) 反馈：默认私有，邮箱只存在这里，公开接口永远不读。
-- 3) 回复：一条反馈可以有多条回复，历史不被覆盖；邮件发送状态单独记。
CREATE TABLE IF NOT EXISTS "blogArticleReaction" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    -- 匿名设备标识：浏览器生成，服务端只当不透明字符串用
    "deviceId" VARCHAR(64) NOT NULL,
    -- inspired / useful / resonant
    "kind" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogArticleReaction_pkey" PRIMARY KEY ("id")
);

-- 连点两次也只能存一行
CREATE UNIQUE INDEX IF NOT EXISTS "blogArticleReaction_dedupe"
    ON "blogArticleReaction" ("accountId", "noteId", "deviceId");

CREATE INDEX IF NOT EXISTS "blogArticleReaction_accountId_noteId_kind_idx"
    ON "blogArticleReaction" ("accountId", "noteId", "kind");

-- 读者给作者的私密反馈
CREATE TABLE IF NOT EXISTS "blogArticleFeedback" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    -- 文章快照：标题与公开地址在提交时记下
    "title" VARCHAR(200) NOT NULL,
    "publishId" VARCHAR(128) NOT NULL,
    "type" VARCHAR(24) NOT NULL DEFAULT 'question',
    "content" TEXT NOT NULL,
    "nickname" VARCHAR(60) NOT NULL DEFAULT '',
    "wantReply" BOOLEAN NOT NULL DEFAULT false,
    -- 通知邮箱：仅后台受保护接口可见
    "email" VARCHAR(200) NOT NULL DEFAULT '',
    "allowPublic" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- 幂等键：同一次提交重试不会新增多条
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogArticleFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "blogArticleFeedback_idempotency_key"
    ON "blogArticleFeedback" ("accountId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "blogArticleFeedback_accountId_status_createdAt_idx"
    ON "blogArticleFeedback" ("accountId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "blogArticleFeedback_noteId_idx"
    ON "blogArticleFeedback" ("noteId");

-- 作者回复：一条反馈可以有多条回复；邮件状态与回复内容分开记
CREATE TABLE IF NOT EXISTS "blogArticleFeedbackReply" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "feedbackId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "mailStatus" VARCHAR(16) NOT NULL DEFAULT 'none',
    "mailError" TEXT NOT NULL DEFAULT '',
    "mailSentAt" TIMESTAMPTZ(6),
    "mailAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogArticleFeedbackReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blogArticleFeedbackReply_feedbackId_createdAt_idx"
    ON "blogArticleFeedbackReply" ("feedbackId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleReaction_accountId_fkey'
    ) THEN
        ALTER TABLE "blogArticleReaction"
            ADD CONSTRAINT "blogArticleReaction_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleReaction_noteId_fkey'
    ) THEN
        ALTER TABLE "blogArticleReaction"
            ADD CONSTRAINT "blogArticleReaction_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "notes"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleFeedback_accountId_fkey'
    ) THEN
        ALTER TABLE "blogArticleFeedback"
            ADD CONSTRAINT "blogArticleFeedback_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleFeedback_noteId_fkey'
    ) THEN
        ALTER TABLE "blogArticleFeedback"
            ADD CONSTRAINT "blogArticleFeedback_noteId_fkey"
            FOREIGN KEY ("noteId") REFERENCES "notes"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleFeedbackReply_accountId_fkey'
    ) THEN
        ALTER TABLE "blogArticleFeedbackReply"
            ADD CONSTRAINT "blogArticleFeedbackReply_accountId_fkey"
            FOREIGN KEY ("accountId") REFERENCES "accounts"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'blogArticleFeedbackReply_feedbackId_fkey'
    ) THEN
        ALTER TABLE "blogArticleFeedbackReply"
            ADD CONSTRAINT "blogArticleFeedbackReply_feedbackId_fkey"
            FOREIGN KEY ("feedbackId") REFERENCES "blogArticleFeedback"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
