-- 博客管理底座：多级专题 + 发布设置 + 专题封面 + 封面排版参数 + 首页精选 + 分发策略
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。

-- ---------- blogTopic：多级 + 发布设置 + 专题封面 ----------
ALTER TABLE "blogTopic"
  ADD COLUMN "parentId" INTEGER,
  ADD COLUMN "showInNav" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "coverAttachmentId" INTEGER,
  ADD COLUMN "coverTitle" VARCHAR NOT NULL DEFAULT '';

ALTER TABLE "blogTopic"
  ADD CONSTRAINT "blogTopic_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "blogTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "blogTopic"
  ADD CONSTRAINT "blogTopic_coverAttachmentId_fkey"
  FOREIGN KEY ("coverAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "blogTopic_accountId_parentId_sortOrder_id_idx"
  ON "blogTopic"("accountId", "parentId", "sortOrder", "id");

-- ---------- notePublication：封面排版参数 + 首页精选 ----------
ALTER TABLE "notePublication"
  ADD COLUMN "coverTitle" VARCHAR NOT NULL DEFAULT '',
  ADD COLUMN "coverSubtitle" VARCHAR NOT NULL DEFAULT '',
  ADD COLUMN "coverPalette" VARCHAR NOT NULL DEFAULT 'violet',
  ADD COLUMN "coverLayout" VARCHAR NOT NULL DEFAULT 'prototype',
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "featuredOrder" INTEGER NOT NULL DEFAULT 0;

-- ---------- blogDistribution：流量分发策略 ----------
CREATE TABLE "blogDistribution" (
  "accountId" INTEGER NOT NULL,
  "mode" VARCHAR NOT NULL DEFAULT 'blended',
  "freshWeight" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "hotWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "qualityWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "affinityWeight" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "searchWeight" DOUBLE PRECISION NOT NULL DEFAULT 3,
  "freshHalfLife" DOUBLE PRECISION NOT NULL DEFAULT 14,
  "hotHalfLife" DOUBLE PRECISION NOT NULL DEFAULT 60,
  "featuredFirst" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blogDistribution_pkey" PRIMARY KEY ("accountId"),
  CONSTRAINT "blogDistribution_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
