BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(20261103, 2);
CREATE TABLE IF NOT EXISTS "SupportPolicy" (
  id TEXT PRIMARY KEY,
  "ownerUserId" TEXT NOT NULL UNIQUE REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  version TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
ALTER TABLE "SupportPolicy" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "SupportPolicy" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "SupportPolicy" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "SupportPolicy" FROM authenticated; END IF;
END $$;
COMMIT;
