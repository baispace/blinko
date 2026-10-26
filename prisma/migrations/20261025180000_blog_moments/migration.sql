-- 公开博客的「动态」。
--
-- 1) 动态本体：短内容，独立于文章，不进文章列表与专题。
--    publishedAt 是首次公开发布时间，排序与月份归类都按它算；更新内容不重置。
-- 2) 图片：宽度与高度记的是原始像素，缩略图可以裁，原图不裁。
--    图片挂在动态上，所以公开可读的判定要认这条通路。
-- 3) 共鸣：同一设备对同一条动态最多一条，唯一约束挡住并发重复计数。
-- 4) 反馈：默认私有，邮箱只存在这里，公开接口永远不读；回复与邮件状态分开记。
CREATE TABLE IF NOT EXISTS "blogMoment" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    -- 轻量引用：单独一段引文
    "quote" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    -- 首次公开发布时间
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogMoment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blogMoment_accountId_isPublished_publishedAt_id_idx"
    ON "blogMoment" ("accountId", "isPublished", "publishedAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "blogMoment_accountId_publishedAt_idx"
    ON "blogMoment" ("accountId", "publishedAt" DESC);

-- 动态的图片
CREATE TABLE IF NOT EXISTS "blogMomentImage" (
    "momentId" INTEGER NOT NULL,
    "attachmentId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    -- 原始像素尺寸
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogMomentImage_pkey" PRIMARY KEY ("momentId", "attachmentId")
);

CREATE INDEX IF NOT EXISTS "blogMomentImage_attachmentId_idx"
    ON "blogMomentImage" ("attachmentId");

-- 共鸣
CREATE TABLE IF NOT EXISTS "blogMomentResonance" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "momentId" INTEGER NOT NULL,
    -- 匿名设备标识：浏览器生成，服务端只当不透明字符串用
    "deviceId" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogMomentResonance_pkey" PRIMARY KEY ("id")
);

-- 连点两次也只能存一行
CREATE UNIQUE INDEX IF NOT EXISTS "blogMomentResonance_dedupe"
    ON "blogMomentResonance" ("accountId", "momentId", "deviceId");

CREATE INDEX IF NOT EXISTS "blogMomentResonance_momentId_idx"
    ON "blogMomentResonance" ("momentId");

-- 读者给作者的私密反馈
CREATE TABLE IF NOT EXISTS "blogMomentFeedback" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "momentId" INTEGER NOT NULL,
    "type" VARCHAR(24) NOT NULL DEFAULT 'question',
    "content" TEXT NOT NULL,
    "nickname" VARCHAR(60) NOT NULL DEFAULT '',
    "wantReply" BOOLEAN NOT NULL DEFAULT false,
    -- 通知邮箱：仅后台受保护接口可见
    "email" VARCHAR(200) NOT NULL DEFAULT '',
    "allowPublic" BOOLEAN NOT NULL DEFAULT false,
    -- pending / replied / archived
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    -- 幂等键：同一次提交重试不会多出几条
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogMomentFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "blogMomentFeedback_idempotency_key"
    ON "blogMomentFeedback" ("accountId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "blogMomentFeedback_accountId_status_createdAt_idx"
    ON "blogMomentFeedback" ("accountId", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "blogMomentFeedback_momentId_idx"
    ON "blogMomentFeedback" ("momentId");

-- 作者回复：一条反馈可以有多条回复
CREATE TABLE IF NOT EXISTS "blogMomentFeedbackReply" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "feedbackId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    -- none / sending / sent / failed / skipped
    "mailStatus" VARCHAR(16) NOT NULL DEFAULT 'none',
    "mailError" TEXT NOT NULL DEFAULT '',
    "mailSentAt" TIMESTAMPTZ(6),
    "mailAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogMomentFeedbackReply_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "blogMomentFeedbackReply_feedbackId_createdAt_idx"
    ON "blogMomentFeedbackReply" ("feedbackId", "createdAt");
