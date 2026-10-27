-- 封面从「一张带字的整图」改成「一张无字底图 + 系统文字层」。
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。
--
-- 结构变化：
--   1. notePublication.coverConfig —— 公开快照里的封面文字层配置
--      （短标题、副标题、对齐、字号微调、封面模式）。底图仍走 coverAttachmentId，
--      不再为卡片 / 列表 / Banner 各存一张图。
--   2. notePublication.shareCoverAttachmentId —— 由底图 + 文字配置派生出来的
--      社交分享图（1200×630）。它是公开版本的一部分，只能由已发布配置生成。
--   3. blogPublicationHistory.coverConfig —— 每个公开版本各自留一份封面配置，
--      撤回后仍能对比，也能还原那一版的分享图。
--
-- 不回填：历史封面可能自带文字，一律按「完整图片封面」处理（不再叠字），
-- 回填成文字层反而会在旧图上再叠一层。

-- AlterTable
ALTER TABLE "notePublication" ADD COLUMN "coverConfig" JSONB;
ALTER TABLE "notePublication" ADD COLUMN "shareCoverAttachmentId" INTEGER;

-- AlterTable
ALTER TABLE "blogPublicationHistory" ADD COLUMN "coverConfig" JSONB;

-- CreateIndex
CREATE INDEX "notePublication_shareCoverAttachmentId_idx" ON "notePublication"("shareCoverAttachmentId");

-- AddForeignKey
ALTER TABLE "notePublication" ADD CONSTRAINT "notePublication_shareCoverAttachmentId_fkey" FOREIGN KEY ("shareCoverAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
