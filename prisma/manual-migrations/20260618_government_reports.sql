ALTER TABLE "Settings"
    ADD COLUMN IF NOT EXISTS "governmentReportRecipients" TEXT NOT NULL DEFAULT '["opec.gov@metropoles.com","karoliny.sousa@metropoles.com"]',
    ADD COLUMN IF NOT EXISTS "governmentReportAutoSend" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "governmentReportTime" TEXT NOT NULL DEFAULT '09:00',
    ADD COLUMN IF NOT EXISTS "governmentReportAutoSince" TIMESTAMP(3);

ALTER TABLE "EmailDispatch"
    ADD COLUMN IF NOT EXISTS "flightEnd" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "triggerMode" TEXT NOT NULL DEFAULT 'MANUAL',
    ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
    ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT,
    ADD COLUMN IF NOT EXISTS "attachmentCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "attachmentBytes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "sendVersion" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "EmailDispatch_pi_flightEnd_key"
    ON "EmailDispatch"("pi", "flightEnd");

CREATE INDEX IF NOT EXISTS "EmailDispatch_status_isActive_flightEnd_idx"
    ON "EmailDispatch"("status", "isActive", "flightEnd");
