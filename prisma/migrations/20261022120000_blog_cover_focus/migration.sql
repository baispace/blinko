-- 封面在各展示位的裁切位置
--
-- 手写迁移，不走 prisma migrate dev：库里那 5 个 GIN trigram 索引 Prisma 表达不了，
-- migrate dev 每次都想把它们删掉。
--
-- 背景：
--   封面源图统一成 1600×900，一张图要同时给双栏（2.8:1）、单栏（16:9）、
--   Banner（2.9:1）三个展示位用。比例不同，object-fit: cover 裁掉的位置也不同，
--   作者希望能分别微调每个展示位的裁切位置。
--
-- 结构：
--   { sourceId, placements: { double: {x,y}, single: {x,y}, banner: {x,y} } }
--   sourceId 记着这份裁切是针对哪张源图调的 —— 换源图后对不上就当没调过，回到居中。
--
-- 不回填：老封面的裁切一律居中，跟现在的显示效果完全一致。

ALTER TABLE "notePublication"
  ADD COLUMN "coverFocus" JSONB;
