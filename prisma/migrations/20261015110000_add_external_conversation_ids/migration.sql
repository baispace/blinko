-- AlterTable
-- 外部 AI 工具同步用：externalId 提供幂等 upsert 的唯一键，source 用于按来源过滤。
-- 两列都可空，站内自己产生的会话保持 NULL。
ALTER TABLE "conversation" ADD COLUMN     "externalId" VARCHAR(255),
ADD COLUMN     "source" VARCHAR(64),
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "message" ADD COLUMN     "externalId" VARCHAR(255);

-- CreateIndex
-- PostgreSQL 唯一索引允许多个 NULL，存量行不会被约束影响。
CREATE UNIQUE INDEX "conversation_accountId_externalId_key" ON "conversation"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "conversation_source_idx" ON "conversation"("source");

-- CreateIndex
CREATE UNIQUE INDEX "message_conversationId_externalId_key" ON "message"("conversationId", "externalId");
