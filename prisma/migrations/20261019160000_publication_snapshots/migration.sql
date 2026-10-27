-- Legacy published notes remain closed until their owner explicitly republishes.
-- Do not copy live/private drafts into public snapshots during migration.
CREATE TABLE "notePublication" (
  "noteId" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "type" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "sourceUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notePublication_pkey" PRIMARY KEY ("noteId"),
  CONSTRAINT "notePublication_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
