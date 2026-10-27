ALTER TABLE "notePublication" ADD COLUMN "draftCoverAttachmentId" INTEGER;
UPDATE "notePublication" SET "draftCoverAttachmentId" = "coverAttachmentId";
CREATE INDEX "notePublication_draftCoverAttachmentId_idx" ON "notePublication"("draftCoverAttachmentId");
ALTER TABLE "notePublication" ADD CONSTRAINT "notePublication_draftCoverAttachmentId_fkey" FOREIGN KEY ("draftCoverAttachmentId") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
