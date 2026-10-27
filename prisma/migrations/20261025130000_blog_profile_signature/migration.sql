-- 公开资料新增「签名」：关于页头像下方的那句简短介绍。
--
-- 与个人介绍（bio）、站点说明（spaceIntro）都分开：
--   bio       我是谁
--   signature 一句话签名
--   spaceIntro 这个站点用来做什么
--
-- 老资料默认空串 —— 空就不渲染，不占位置。
ALTER TABLE "blogProfile"
    ADD COLUMN IF NOT EXISTS "signature" VARCHAR(80) NOT NULL DEFAULT '';
