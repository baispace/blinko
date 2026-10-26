-- 动态不再是独立实体：它就是「被公开的闪念」。
--
-- 之前 blogMoment 是一张和 notes 平行的表，正文、引文、标签、图片各存一份，
-- 后台还要单独维护一套编辑器与发布开关。同一件事存两遍，迟早对不上。
--
-- 这次改造：
--   1) notes 增加 isMoment / momentPublishedAt：闪念在动态流里的两个状态位。
--   2) 原有动态逐条转成闪念：正文照搬，引文并进正文成为引用块，
--      图片挂到闪念的附件上并在正文里内联，公开标签写进 notes.metadata。
--   3) 共鸣与反馈改为挂 noteId（它们挂的是动态，动态即闪念）。
--   4) 旧的 blogMoment / blogMomentImage 随之退休。
--
-- 数据迁移在同一条 SQL 里做完：先建闪念并用 metadata 暂存「原动态 id」，
-- 用它把共鸣、反馈改指向新闪念，然后清掉暂存字段并删旧表。

/* -------------------------------------------------------------------------- */
/* 1) notes：动态状态位                                                        */
/* -------------------------------------------------------------------------- */

ALTER TABLE "notes"
    ADD COLUMN IF NOT EXISTS "isMoment" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "momentPublishedAt" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "notes_moment_feed_idx"
    ON "notes" ("accountId", "isMoment", "momentPublishedAt" DESC, "id" DESC);

/* -------------------------------------------------------------------------- */
/* 2) 数据迁移：动态 -> 闪念                                                    */
/* -------------------------------------------------------------------------- */

/*
 * 先把动态正文转成闪念正文：
 *   引文单独成段（> 引用），图片按原顺序内联进正文尾部。
 * metadata 里暂存 _blogMomentId —— 下面靠它把共鸣与反馈改指向新闪念。
 */
INSERT INTO "notes" (
    "type", "content", "accountId", "isPublished", "publishId", "publishedAt",
    "isMoment", "momentPublishedAt", "createdAt", "updatedAt", "metadata"
)
SELECT
    0,
    COALESCE(NULLIF(BTRIM(m."content"), ''), '')
    || CASE
        WHEN NULLIF(BTRIM(m."quote"), '') IS NOT NULL
            THEN E'\n\n> ' || REPLACE(BTRIM(m."quote"), E'\n', E'\n> ')
        ELSE ''
       END
    || COALESCE((
        SELECT E'\n\n' || STRING_AGG(
            '![' || COALESCE(NULLIF(a."name", ''), '图片') || '](' || a."path" || ')',
            E'\n\n' ORDER BY bi."sortOrder" ASC, bi."attachmentId" ASC
        )
        FROM "blogMomentImage" bi
        JOIN "attachments" a ON a."id" = bi."attachmentId"
        WHERE bi."momentId" = m."id"
    ), ''),
    m."accountId",
    false,
    NULL,
    NULL,
    m."isPublished",
    m."publishedAt",
    m."createdAt",
    m."updatedAt",
    JSONB_BUILD_OBJECT(
        '_blogMomentId', m."id",
        'blogPublicTags', TO_JSONB(m."tags")
    )::json
FROM "blogMoment" m
WHERE NOT EXISTS (
    SELECT 1 FROM "notes" n
    WHERE (n."metadata" ->> '_blogMomentId') = m."id"::text
);

-- 图片挂到对应的闪念上：附件原本 noteId 为空，现在归到新闪念名下。
UPDATE "attachments" a
SET "noteId" = n."id"
FROM "notes" n, "blogMomentImage" bi
WHERE (n."metadata" ->> '_blogMomentId') = bi."momentId"::text
  AND bi."attachmentId" = a."id"
  AND a."noteId" IS NULL;

/* -------------------------------------------------------------------------- */
/* 3) 共鸣与反馈改指向闪念                                                       */
/* -------------------------------------------------------------------------- */

-- 先摘掉指向旧表的外键：列改名后它会继续盯着 blogMoment，
-- 下面的改指向就会撞上外键约束。
ALTER TABLE "blogMomentResonance" DROP CONSTRAINT IF EXISTS "blogMomentResonance_momentId_fkey";
ALTER TABLE "blogMomentFeedback" DROP CONSTRAINT IF EXISTS "blogMomentFeedback_momentId_fkey";

ALTER TABLE "blogMomentResonance" RENAME COLUMN "momentId" TO "noteId";
ALTER TABLE "blogMomentFeedback" RENAME COLUMN "momentId" TO "noteId";

UPDATE "blogMomentResonance" r
SET "noteId" = n."id"
FROM "notes" n
WHERE (n."metadata" ->> '_blogMomentId') = r."noteId"::text;

UPDATE "blogMomentFeedback" f
SET "noteId" = n."id"
FROM "notes" n
WHERE (n."metadata" ->> '_blogMomentId') = f."noteId"::text;

/* -------------------------------------------------------------------------- */
/* 4) 旧表退休                                                                */
/* -------------------------------------------------------------------------- */

-- 清掉暂存的映射字段：它只是迁移过程中的脚手架。
-- metadata 是 json 类型：借 jsonb 做键删除，再转回来。
UPDATE "notes"
SET "metadata" = (("metadata"::jsonb - '_blogMomentId')::json)
WHERE ("metadata"::jsonb ? '_blogMomentId');

DROP TABLE IF EXISTS "blogMomentImage";
DROP TABLE IF EXISTS "blogMoment";

-- 外键与索引跟着换名换列。
ALTER TABLE "blogMomentResonance"
    ADD CONSTRAINT "blogMomentResonance_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentFeedback"
    ADD CONSTRAINT "blogMomentFeedback_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "notes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX IF EXISTS "blogMomentResonance_accountId_momentId_deviceId_key";
DROP INDEX IF EXISTS "blogMomentResonance_momentId_idx";
DROP INDEX IF EXISTS "blogMomentFeedback_momentId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "blogMomentResonance_dedupe"
    ON "blogMomentResonance" ("accountId", "noteId", "deviceId");
CREATE INDEX IF NOT EXISTS "blogMomentResonance_noteId_idx"
    ON "blogMomentResonance" ("noteId");
CREATE INDEX IF NOT EXISTS "blogMomentFeedback_noteId_idx"
    ON "blogMomentFeedback" ("noteId");

-- notes 的自增序列要跟上新插入的行。
SELECT setval(
    'notes_id_seq',
    GREATEST((SELECT COALESCE(MAX("id"), 1) FROM "notes"), 1)
);
