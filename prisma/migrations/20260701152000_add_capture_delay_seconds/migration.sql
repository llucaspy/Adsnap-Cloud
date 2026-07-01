ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "captureDelaySeconds" INTEGER NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Campaign_captureDelaySeconds_range'
      AND conrelid = '"Campaign"'::regclass
  ) THEN
    ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_captureDelaySeconds_range"
    CHECK ("captureDelaySeconds" BETWEEN 1 AND 10);
  END IF;
END $$;
