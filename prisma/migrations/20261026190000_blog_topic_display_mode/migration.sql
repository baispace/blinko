-- 专题增加「展示方式」字段。
--
-- topic（专题模式）：保留现有的专题介绍 + 文章列表。
-- doc （文档模式）：以章节目录和正文为主，适合系列教程、手册与连续阅读。
--
-- 只新增一列，不动任何历史数据：DEFAULT 'topic' 让所有已有专题迁移后
-- 保持原有行为，只有作者在后台主动切换才会变成文档模式。
-- 两种模式复用同一套专题、章节、文章与排序 —— 没有新建任何表。
ALTER TABLE "blogTopic"
    ADD COLUMN "displayMode" VARCHAR NOT NULL DEFAULT 'topic';
