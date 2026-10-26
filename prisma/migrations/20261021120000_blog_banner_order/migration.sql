-- 推荐页 banner 的独立位置
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。
--
-- 背景：
--   banner 的排序之前借用 featuredOrder（置顶位置）。两个开关虽然独立，
--   位置却共用一个数字 —— 想让文章置顶在第 1 位、同时排在 banner 第 3 位，
--   就表达不出来。bannerOrder 把这两件事拆开。
--
-- 回填：
--   已有 banner 文章的 bannerOrder 取原来的 featuredOrder ——
--   这样上线前后推荐页的 banner 顺序完全一致，不会有肉眼可见的跳动。
--   featuredOrder 本身不动，置顶排序不受影响。

ALTER TABLE "notePublication"
  ADD COLUMN "bannerOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "notePublication"
  SET "bannerOrder" = "featuredOrder"
  WHERE "isBanner" = true;
