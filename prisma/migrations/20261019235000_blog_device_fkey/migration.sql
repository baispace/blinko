-- 设备档案挂到账号上：账号被删时，站点级设备数据跟着清，不留孤儿行。
--
-- 同样是手写迁移：prisma migrate dev 表达不了 notes_content_trgm_idx 等 GIN
-- trigram 索引，每次 diff 都会想删它们并顺手把迁移写成破坏性的。
ALTER TABLE "blogDevice"
    ADD CONSTRAINT "blogDevice_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
