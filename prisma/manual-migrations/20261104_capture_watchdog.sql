-- Private service state; no browser-facing Prisma model or Data API access.
CREATE SCHEMA IF NOT EXISTS adsnap_private;
REVOKE ALL ON SCHEMA adsnap_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS adsnap_private.capture_scheduler (
    id integer PRIMARY KEY CHECK (id = 1),
    token_hash text NOT NULL,
    checked_at timestamptz,
    dispatched_at timestamptz,
    decision text,
    last_error text
);
ALTER TABLE adsnap_private.capture_scheduler ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON adsnap_private.capture_scheduler FROM PUBLIC, anon, authenticated;
