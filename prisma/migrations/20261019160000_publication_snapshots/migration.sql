-- Legacy published notes remain closed until their owner explicitly republishes.
-- Do not copy live/private drafts into public snapshots during migration.
CREATE TABLE "notePublication" (
  "noteId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "type" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "sourceUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
  -- 公开快照的封面：与 noteId 一对一，指向 attachments。
  -- 这一列原本在更早的 blog_management 迁移里用 ALTER 加的，但那张表比
  -- 本迁移更早执行 —— 新环境上必然「relation notePublication does not exist」。
  -- 现在随建表一起落地，顺序自洽。
  "coverAttachmentId" INTEGER,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notePublication_pkey" PRIMARY KEY ("noteId"),
  CONSTRAINT "notePublication_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notePublication_coverAttachmentId_fkey" FOREIGN KEY ("coverAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "notePublication_coverAttachmentId_idx" ON "notePublication"("coverAttachmentId");
