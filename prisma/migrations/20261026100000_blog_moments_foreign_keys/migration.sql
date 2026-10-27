-- 补齐动态相关表的外键约束。
--
-- 上一条迁移（20261025180000_blog_moments）建表时漏写了外键，
-- 导致 schema.prisma 里声明的 onDelete: Cascade 实际没有生效：
-- 删掉一条动态，它的图片、共鸣、反馈与回复都会变成孤儿数据留在库里。
--
-- 这条迁移只补动态这一族的约束，不动其它表：
--   1) 动态的子表 → 动态 / 附件：删动态或删附件时一起带走；
--   2) 动态的子表 → 账号：删账号时一起带走；
--   3) 回复 → 反馈：删反馈时一起带走。
--
-- 同时把反馈表的三个列宽对齐 schema.prisma（迁移里写宽了）。
ALTER TABLE "blogMomentFeedback"
    ALTER COLUMN "type" SET DATA TYPE VARCHAR(16),
    ALTER COLUMN "nickname" SET DATA TYPE VARCHAR(30),
    ALTER COLUMN "email" SET DATA TYPE VARCHAR(120);

ALTER TABLE "blogMoment"
    ADD CONSTRAINT "blogMoment_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentImage"
    ADD CONSTRAINT "blogMomentImage_momentId_fkey"
    FOREIGN KEY ("momentId") REFERENCES "blogMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentImage"
    ADD CONSTRAINT "blogMomentImage_attachmentId_fkey"
    FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentResonance"
    ADD CONSTRAINT "blogMomentResonance_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentResonance"
    ADD CONSTRAINT "blogMomentResonance_momentId_fkey"
    FOREIGN KEY ("momentId") REFERENCES "blogMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentFeedback"
    ADD CONSTRAINT "blogMomentFeedback_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentFeedback"
    ADD CONSTRAINT "blogMomentFeedback_momentId_fkey"
    FOREIGN KEY ("momentId") REFERENCES "blogMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentFeedbackReply"
    ADD CONSTRAINT "blogMomentFeedbackReply_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blogMomentFeedbackReply"
    ADD CONSTRAINT "blogMomentFeedbackReply_feedbackId_fkey"
    FOREIGN KEY ("feedbackId") REFERENCES "blogMomentFeedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
