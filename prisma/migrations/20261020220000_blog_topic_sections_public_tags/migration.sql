-- 专题章节 + 公开标签 + 推荐置顶与 banner 分离
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。blogDistribution/blogPostStat 的 updatedAt 默认值
-- 漂移也是既有问题，一并不在这里动。

-- ---------- blogTopicSection：专题下的章节 ----------
-- 章节是独立实体，跟 blogTopic.parentId 的「子专题」树不是一回事：
-- 专题树决定「这个站点有哪些专题」，章节决定「一个专题内部怎么分章编排」。
CREATE TABLE "blogTopicSection" (
  "id" SERIAL NOT NULL,
  "topicId" INTEGER NOT NULL,
  "name" VARCHAR NOT NULL,
  "desc" TEXT NOT NULL DEFAULT '',
  "showTitle" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blogTopicSection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "blogTopicSection_topicId_sortOrder_id_idx"
  ON "blogTopicSection"("topicId", "sortOrder", "id");

ALTER TABLE "blogTopicSection"
  ADD CONSTRAINT "blogTopicSection_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "blogTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- blogTopicNote：文章落到章节 ----------
-- sectionId 为空即「未分章节」。旧文章天然落在这里，不需要回填。
-- 主键仍是 (topicId, noteId)，结构上就排除了「同一文章在同一专题里落两个章节」。
ALTER TABLE "blogTopicNote" ADD COLUMN "sectionId" INTEGER;

ALTER TABLE "blogTopicNote"
  ADD CONSTRAINT "blogTopicNote_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "blogTopicSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "blogTopicNote_sectionId_idx" ON "blogTopicNote"("sectionId");

-- ---------- blogPublicTag：公开标签池 ----------
-- 与私有笔记标签（tag / tagsToNote）刻意分开：私有标签永远不外泄，
-- 公开标签只活在博客这条线上。
CREATE TABLE "blogPublicTag" (
  "id" SERIAL NOT NULL,
  "accountId" INTEGER NOT NULL,
  "name" VARCHAR NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "blogPublicTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blogPublicTag_accountId_name_key"
  ON "blogPublicTag"("accountId", "name");
CREATE INDEX "blogPublicTag_accountId_idx" ON "blogPublicTag"("accountId");

ALTER TABLE "blogPublicTag"
  ADD CONSTRAINT "blogPublicTag_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- notePublication：推荐置顶 / banner 分离 + 公开标签快照 ----------
-- isFeatured  = 推荐置顶：只影响首页「推荐」流的排序。
-- isBanner    = 加入推荐页 banner：只决定这篇文章进不进首页顶部那块大图位。
-- 两者互不替代，保存后立即生效，不增加公开版本号。
-- publicTags  = 公开标签的已发布快照（草稿态存在 notes.metadata.blogPublicTags）。
ALTER TABLE "notePublication"
  ADD COLUMN "isBanner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
