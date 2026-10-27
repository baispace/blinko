-- AI 整理出来的发布信息候选：只存草稿侧的工作缓存，不进公开快照。
-- 正文改过不算失效，只标记过期（字段里记着生成时用的正文指纹）。
ALTER TABLE "notePublication" ADD COLUMN IF NOT EXISTS "aiCopy" JSONB;