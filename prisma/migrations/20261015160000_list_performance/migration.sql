-- Accept only explicit ISO dates/timestamps; malformed legacy metadata stays undated.
CREATE OR REPLACE FUNCTION blinko_iso_timestamp(value text) RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE STRICT SET timezone = 'UTC' AS $$
BEGIN
  IF value ~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN (value || 'T23:59:59+08:00')::timestamptz;
  ELSIF value ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$' THEN
    RETURN value::timestamptz;
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN RETURN NULL;
END; $$;
CREATE INDEX IF NOT EXISTS notes_list_created_idx ON notes ("accountId", type, "isRecycle", "isArchived", "isTop" DESC, "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS notes_list_updated_idx ON notes ("accountId", type, "isRecycle", "isArchived", "isTop" DESC, "updatedAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS notes_todo_due_idx ON notes ("accountId", blinko_iso_timestamp(metadata->>'expireAt'), id) WHERE type = 2 AND NOT "isRecycle";
CREATE INDEX IF NOT EXISTS "tagsToNote_tagId_noteId_idx" ON "tagsToNote" ("tagId", "noteId");
CREATE INDEX IF NOT EXISTS attachments_account_sort_idx ON attachments ("accountId", "sortOrder", "updatedAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS attachments_noteId_idx ON attachments ("noteId");
CREATE INDEX IF NOT EXISTS conversation_account_created_idx ON conversation ("accountId", "createdAt" DESC, id DESC);
CREATE INDEX IF NOT EXISTS message_conversation_created_idx ON message ("conversationId", "createdAt" DESC, id DESC);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS notes_content_trgm_idx ON notes USING gin (content gin_trgm_ops);
CREATE INDEX IF NOT EXISTS notes_title_trgm_idx ON notes USING gin ((metadata #>> '{title}') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tag_name_trgm_idx ON tag USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS attachments_name_trgm_idx ON attachments USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS attachments_path_trgm_idx ON attachments USING gin (path gin_trgm_ops);
