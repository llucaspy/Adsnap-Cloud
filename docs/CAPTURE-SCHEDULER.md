# Capture scheduler recovery

The GitHub schedule remains enabled. Supabase Cron independently calls the private
`/api/cron/capture-watchdog` endpoint every two minutes. This removes dependence on
GitHub schedule event delivery and on the operator's computer. Runner availability,
startup and queue processing still affect the actual capture time.

The endpoint uses the existing campaign date/cadence rules and GitHub credential.
It launches a general worker only when a scheduled print, queued job or stale claim
needs work and no recent runner is already active or queued. It does not capture in
Vercel, approve quarantine, change campaign settings or bypass validations.

Apply `20261104_capture_watchdog.sql` first. Provision a cryptographically random
32-byte hex token in Supabase Vault as `adsnap_capture_watchdog_token`, with only
its SHA-256 hash in the private scheduler row (id 1). No browser role has access.
Deploy the endpoint, test service authentication, then apply
`20261104_capture_watchdog_cron.sql` with pg_cron and pg_net enabled. Never put the
token in SQL source, job commands, URLs, logs or client environment variables.

Inspect `adsnap_private.capture_scheduler` for the last check, dispatch, decision
and sanitized failure. Inspect `cron.job_run_details` and `net._http_response` for
delivery failures. An HTTP error is retryable on the next tick. Disable using
`select cron.unschedule('adsnap-capture-watchdog')`; this leaves GitHub's original
schedule and in-progress capture jobs intact.
