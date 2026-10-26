-- 发布对比的最小结构变更：
--   1. notePublication 记下「上次发布时的原笔记正文指纹」，作为来源比对的基线；
--   2. 新建 blogPublicationHistory，存每一次确认发布留下的公开版本快照。
-- 手写迁移，不动已有索引。

-- AlterTable
ALTER TABLE "notePublication" ADD COLUMN "sourceContentVersion" VARCHAR(64);

-- CreateTable
CREATE TABLE "blogPublicationHistory" (
    "id" SERIAL NOT NULL,
    "noteId" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "title" VARCHAR NOT NULL DEFAULT '',
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "coverAttachmentId" INTEGER,
    "publicTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo" JSONB,
    "sourceContentVersion" VARCHAR(64) NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogPublicationHistory_pkey" PRIMARY KEY ("id")
);

-- 同一篇文章的同一个版本号只能有一条：重复提交撞唯一键，不会写出重复版本。
CREATE UNIQUE INDEX "blogPublicationHistory_noteId_revision_key" ON "blogPublicationHistory"("noteId", "revision");

-- CreateIndex
CREATE INDEX "blogPublicationHistory_noteId_idx" ON "blogPublicationHistory"("noteId");

-- AddForeignKey
ALTER TABLE "blogPublicationHistory" ADD CONSTRAINT "blogPublicationHistory_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
