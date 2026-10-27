-- 说明：这份迁移最初由 `prisma migrate dev` 生成，但它把 schema.prisma 无法
-- 表达的 GIN trigram 索引当成漂移一并 DROP 了（notes/tag/attachments 的
-- 全文检索索引）。已手工移除那 4 条 DROP —— 新环境跑这份迁移时不会丢索引。
--
-- 已知遗留：Prisma 无法在 schema.prisma 里声明 `USING gin (col gin_trgm_ops)`，
-- 因此这些索引始终处于「数据库有、schema 无」的状态，后续再跑
-- `prisma migrate dev` 仍会试图删除它们。若误删，用
-- `20261015160000_list_performance/migration.sql` 里的 CREATE INDEX 重建。
--
-- AlterTable
ALTER TABLE "conversation" ALTER COLUMN "metadata" SET DATA TYPE JSON;

-- AlterTable
-- notePublication 的列与外键挪到 20261019160000_publication_snapshots：
-- 那份迁移才创建这张表，在这里 ALTER 会直接报「relation does not exist」，
-- 迁移链一断，后面所有迁移都落不下去（新环境部署必踩）。

-- CreateTable
CREATE TABLE "blogProfile" (
    "accountId" INTEGER NOT NULL,
    "displayName" VARCHAR NOT NULL DEFAULT '',
    "tagline" VARCHAR NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarUrl" VARCHAR NOT NULL DEFAULT '',
    "homepage" VARCHAR NOT NULL DEFAULT '',
    "links" JSON,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blogProfile_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "blogTopic" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "slug" VARCHAR NOT NULL,
    "desc" TEXT NOT NULL DEFAULT '',
    "color" VARCHAR NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "blogTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogTopicNote" (
    "topicId" INTEGER NOT NULL,
    "noteId" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogTopicNote_pkey" PRIMARY KEY ("topicId","noteId")
);

-- CreateIndex
CREATE INDEX "blogTopic_accountId_sortOrder_id_idx" ON "blogTopic"("accountId", "sortOrder", "id");

-- CreateIndex
CREATE UNIQUE INDEX "blogTopic_accountId_slug_key" ON "blogTopic"("accountId", "slug");

-- CreateIndex
CREATE INDEX "blogTopicNote_noteId_idx" ON "blogTopicNote"("noteId");



-- AddForeignKey
ALTER TABLE "blogProfile" ADD CONSTRAINT "blogProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogTopic" ADD CONSTRAINT "blogTopic_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogTopicNote" ADD CONSTRAINT "blogTopicNote_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "blogTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogTopicNote" ADD CONSTRAINT "blogTopicNote_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "attachments_noteid_idx" RENAME TO "attachments_noteId_idx";
