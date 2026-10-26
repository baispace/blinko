CREATE TABLE "blogRecommendationEvent" (
 "id" SERIAL PRIMARY KEY, "accountId" INTEGER NOT NULL, "deviceId" VARCHAR(64) NOT NULL,
 "kind" VARCHAR(16) NOT NULL, "publishId" VARCHAR(128) NOT NULL, "term" VARCHAR(80) NOT NULL, "bucket" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "blogRecommendationEvent_dedupe" ON "blogRecommendationEvent"("accountId","deviceId","kind","publishId","term","bucket");
CREATE INDEX "blogRecommendationEvent_accountId_bucket_idx" ON "blogRecommendationEvent"("accountId","bucket");
CREATE INDEX "blogRecommendationEvent_accountId_deviceId_bucket_idx" ON "blogRecommendationEvent"("accountId","deviceId","bucket");
