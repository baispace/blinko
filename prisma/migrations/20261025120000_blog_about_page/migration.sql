-- 关于页的作者可配置项。
--
-- 三件事，都挂在 blogProfile 上（与「公开作者」面板同一处配置）：
--   1) spaceIntro  「关于这个空间」的站点说明。与个人介绍分开 —— bio 说「我是谁」，
--      这里说「这个站点用来做什么」，不再靠按空行切分 bio 来拼。
--   2) featuredPosts 作者精选的阅读入口：[{ noteId, reason }]，最多 3 篇。
--      存的是笔记 id 与推荐理由，公开状态在读取时校验，撤回即自动退出。
--   3) aboutTopicIds 「我在记录什么」展示的专题与顺序；为空时按专题默认排序取前 4。
--
-- 老数据兼容：三列都有默认值，老资料不需要回填。
ALTER TABLE "blogProfile"
    ADD COLUMN IF NOT EXISTS "spaceIntro" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "featuredPosts" JSONB,
    ADD COLUMN IF NOT EXISTS "aboutTopicIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
