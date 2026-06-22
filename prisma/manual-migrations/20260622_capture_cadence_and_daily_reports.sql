ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "captureCadence" TEXT NOT NULL DEFAULT 'DAILY';

UPDATE "Campaign"
SET "captureCadence" = 'BOUNDARY'
WHERE "segmentation" = 'GOV_FEDERAL';

UPDATE "Campaign"
SET "captureCadence" = 'DAILY'
WHERE "pi" = '488285';

ALTER TABLE "EmailDispatch"
ADD COLUMN IF NOT EXISTS "reportScope" TEXT NOT NULL DEFAULT 'CAMPAIGN';

ALTER TABLE "EmailDispatch"
ADD COLUMN IF NOT EXISTS "reportDate" TIMESTAMP(3);

ALTER TABLE "EmailDispatch"
ADD COLUMN IF NOT EXISTS "scopeKey" TEXT;

UPDATE "EmailDispatch"
SET "scopeKey" = 'CAMPAIGN:' || "pi" || ':' || FLOOR(EXTRACT(EPOCH FROM "flightEnd") * 1000)::BIGINT
WHERE "scopeKey" IS NULL
  AND "flightEnd" IS NOT NULL;

DROP INDEX IF EXISTS "EmailDispatch_pi_flightEnd_key";

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDispatch_scopeKey_key"
ON "EmailDispatch"("scopeKey");
