BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(1103202601);

CREATE TABLE IF NOT EXISTS "SupportConversation" (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL, title TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportConversation_userId_updatedAt_idx" ON "SupportConversation"("userId", "updatedAt");
CREATE TABLE IF NOT EXISTS "SupportTurn" (
  id TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL, "requestKey" TEXT NOT NULL,
  "userText" TEXT NOT NULL, "assistantText" TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'QUEUED',
  "claimRunId" TEXT, "lockedUntil" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTurn_conversationId_requestKey_key" ON "SupportTurn"("conversationId", "requestKey");
CREATE INDEX IF NOT EXISTS "SupportTurn_status_createdAt_idx" ON "SupportTurn"(status, "createdAt");
CREATE TABLE IF NOT EXISTS "SupportAction" (
  id TEXT PRIMARY KEY, "turnId" TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL, result JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportAction_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "SupportTurn"(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportAction_turnId_status_idx" ON "SupportAction"("turnId", status);
CREATE TABLE IF NOT EXISTS "SupportExecutor" (
  id TEXT PRIMARY KEY, "runId" TEXT NOT NULL, state TEXT NOT NULL, plan TEXT NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL, "lockedUntil" TIMESTAMP(3) NOT NULL
);

-- Access is exclusively through the authenticated application and the trusted executor.
-- Supabase's public REST roles must not inherit access to private conversations.
ALTER TABLE "SupportConversation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportTurn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportExecutor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "SupportConversation", "SupportTurn", "SupportAction", "SupportExecutor" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "SupportConversation", "SupportTurn", "SupportAction", "SupportExecutor" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "SupportConversation", "SupportTurn", "SupportAction", "SupportExecutor" FROM authenticated;
  END IF;
END $$;
COMMIT;
