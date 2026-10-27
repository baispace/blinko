-- 专题增加「默认打开文章」字段（文档模式用）。
--
-- 存的是私有笔记 id（notes.id），不是公开地址 publishId：
-- 文章重新发布后 publishId 会变，笔记 id 不会 —— 默认文章不会因为
-- 作者重新发布一次就失效。
--
-- 外键指向 notes(id)，ON DELETE SET NULL：文章被彻底删除时，
-- 这里自动置空，前台自然回落到「自动选择第一篇公开文章」，
-- 不会因为一条悬空引用让整个专题页报错。
ALTER TABLE "blogTopic"
    ADD COLUMN "defaultNoteId" INTEGER;

CREATE INDEX "blogTopic_defaultNoteId_idx"
    ON "blogTopic" ("defaultNoteId");

ALTER TABLE "blogTopic"
    ADD CONSTRAINT "blogTopic_defaultNoteId_fkey"
    FOREIGN KEY ("defaultNoteId")
    REFERENCES "notes" ("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
