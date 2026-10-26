ALTER TABLE "notePublication" ADD COLUMN "title" VARCHAR NOT NULL DEFAULT '';
-- Existing snapshots do not copy a newer private draft title. Republish explicitly to update.
