-- 动态迁成闪念后，图片附件要「一条动态一份」。
--
-- 旧数据里同一张图被两条动态共用（blogMomentImage 允许重复引用同一附件），
-- 迁移时附件只归属了先到的那条。归属是唯一的，公开可读判定也只看附件自己
-- 挂的那条闪念 —— 于是「后一条动态的正文引用了这张图」时，
-- 只要前一条被撤回，这张图就取不到了。
--
-- 这里按正文里实际引用的图片路径，给每条动态补齐自己的一份附件登记：
-- 同一个文件路径，多一条记录。磁盘上的文件没有复制，只是各记各的。

INSERT INTO "attachments" (
    "isShare", "sharePassword", "name", "path", "size", "type",
    "noteId", "accountId", "sortOrder", "createdAt", "updatedAt", "perfixPath", "depth"
)
SELECT
    src."isShare", src."sharePassword", src."name", src."path", src."size", src."type",
    n."id", src."accountId", src."sortOrder", src."createdAt", src."updatedAt",
    src."perfixPath", src."depth"
FROM "notes" n
CROSS JOIN LATERAL regexp_matches(n."content", '!\[[^\]]*\]\(([^)]+)\)', 'g') AS hit
JOIN "attachments" src ON src."path" = hit[1]
WHERE n."isMoment" = true
  AND NOT EXISTS (
      SELECT 1 FROM "attachments" own
      WHERE own."noteId" = n."id" AND own."path" = src."path"
  );
