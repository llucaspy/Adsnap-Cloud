alter table "Campaign"
    add column if not exists "processingStartedAt" timestamp(3),
    add column if not exists "processingHeartbeatAt" timestamp(3),
    add column if not exists "processingRunId" text,
    add column if not exists "processingAttempts" integer not null default 0,
    add column if not exists "lastWorkerError" text,
    add column if not exists "lockedUntil" timestamp(3);

create index concurrently if not exists "Campaign_worker_queue_idx"
on "Campaign" (status, "isArchived", "updatedAt")
where "isArchived" = false
  and status in ('QUEUED', 'AUTOCONFIG', 'PROCESSING');

create index concurrently if not exists "Campaign_schedule_idx"
on "Campaign" ("isScheduled", "isArchived", status, "updatedAt")
where "isScheduled" = true
  and "isArchived" = false;

create index concurrently if not exists "Campaign_federal_boundary_idx"
on "Campaign" (segmentation, "captureCadence", status, "updatedAt")
where "isArchived" = false;

create index concurrently if not exists "Campaign_processing_run_idx"
on "Campaign" ("processingRunId")
where "processingRunId" is not null;

create index concurrently if not exists "Capture_campaign_status_created_idx"
on "Capture" ("campaignId", status, "createdAt" desc);

create index concurrently if not exists "NexusLog_level_created_idx"
on "NexusLog" (level, "createdAt" desc);

create index concurrently if not exists "NexusLog_campaign_created_idx"
on "NexusLog" ("campaignId", "createdAt" desc)
where "campaignId" is not null;
