-- 流量来源归因 + 第三方统计脚本状态
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。
--
-- 设计要点：
--   1. 不新增第二套事件表。来源维度直接补在已有的两张「原始事实」表上：
--      blogPageView（有效阅读）与 blogRecommendationEvent（曝光/列表点击/搜索）。
--      这样站内口径只有一套，计数器与明细不会各说各话。
--   2. 历史行没有来源信息，一律按 unknown 落库，不做任何反推 —— 历史分布不生成推测值。
--   3. 只存规范化来源域名（referrerHost），不存完整来源 URL，避免把查询串里的
--      敏感参数写进数据库。

-- ---------- 来源归因字段 ----------
ALTER TABLE "blogPageView"
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN "referrerHost" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "entry" VARCHAR(24) NOT NULL DEFAULT '';

ALTER TABLE "blogRecommendationEvent"
  ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'unknown',
  ADD COLUMN "referrerHost" VARCHAR(120) NOT NULL DEFAULT '',
  ADD COLUMN "entry" VARCHAR(24) NOT NULL DEFAULT '';

-- 来源分布按 (accountId, source, createdAt) 聚合
CREATE INDEX "blogPageView_accountId_source_createdAt_idx"
  ON "blogPageView"("accountId", "source", "createdAt");

-- 范围统计按 (accountId, kind, bucket) 过滤并按 publishId 分组
CREATE INDEX "blogRecommendationEvent_accountId_kind_bucket_idx"
  ON "blogRecommendationEvent"("accountId", "kind", "bucket");

CREATE INDEX "blogRecommendationEvent_accountId_source_bucket_idx"
  ON "blogRecommendationEvent"("accountId", "source", "bucket");

-- ---------- blogTrackingState：第三方统计脚本状态 ----------
-- 公开博客页在真实加载脚本、发送页面事件后上报一次；管理页只读这份事实。
-- 它只能证明「脚本加载了」「事件发出去了」，证明不了「服务商已收数」——
-- 收数必须在服务商后台人工确认。
CREATE TABLE "blogTrackingState" (
  "id" SERIAL NOT NULL,
  "accountId" INTEGER NOT NULL,
  "vendor" VARCHAR(16) NOT NULL,
  "scriptLoadedAt" TIMESTAMPTZ(6),
  "eventSentAt" TIMESTAMPTZ(6),
  "lastPath" VARCHAR(200) NOT NULL DEFAULT '',
  "lastHost" VARCHAR(120) NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blogTrackingState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blogTrackingState_accountId_vendor_key"
  ON "blogTrackingState"("accountId", "vendor");

CREATE INDEX "blogTrackingState_accountId_idx"
  ON "blogTrackingState"("accountId");
