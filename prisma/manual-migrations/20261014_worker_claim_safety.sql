-- Optional, additive indexes for the hardened queue. No rows are changed.
-- Run outside an enclosing transaction because these indexes are concurrent.
-- The application is correct without these indexes; they improve claim checks.
create index concurrently if not exists "WorkerJob_active_campaign_idx"
on "WorkerJob" ("campaignId", "type", "status")
where "status" in ('QUEUED', 'PROCESSING') and "campaignId" is not null;

-- Inspect historical duplicates before considering any uniqueness constraint:
-- select "campaignId", "type", count(*)
-- from "WorkerJob"
-- where status in ('QUEUED', 'PROCESSING') and "campaignId" is not null
-- group by "campaignId", "type" having count(*) > 1;
--
-- Do NOT delete old jobs or add a unique index blindly. Enqueue/claim serialize
-- on Campaign rows. A future unique active-job index needs review of intentional
-- future requests, historical duplicates, and retirement of old queue writers.
