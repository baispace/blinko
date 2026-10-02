-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "isPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishId" VARCHAR,
ADD COLUMN     "publishedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE UNIQUE INDEX "notes_publishId_key" ON "notes"("publishId");

-- CreateIndex
CREATE INDEX "notes_isPublished_idx" ON "notes"("isPublished");
