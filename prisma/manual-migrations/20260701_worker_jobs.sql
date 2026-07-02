create table if not exists "WorkerJob" (
    "id" text primary key,
    "type" text not null default 'CAPTURE',
    "status" text not null default 'QUEUED',
    "priority" integer not null default 0,
    "campaignId" text,
    "runId" text,
    "payload" jsonb,
    "scheduledFor" timestamp(3) not null default current_timestamp,
    "claimedAt" timestamp(3),
    "startedAt" timestamp(3),
    "finishedAt" timestamp(3),
    "lockedUntil" timestamp(3),
    "attempts" integer not null default 0,
    "maxAttempts" integer not null default 2,
    "timeoutMs" integer,
    "lastError" text,
    "createdAt" timestamp(3) not null default current_timestamp,
    "updatedAt" timestamp(3) not null default current_timestamp,
    constraint "WorkerJob_campaignId_fkey"
        foreign key ("campaignId")
        references "Campaign"("id")
        on delete set null
        on update cascade
);

create index if not exists "WorkerJob_capture_queue_idx"
on "WorkerJob" ("priority" desc, "scheduledFor", "createdAt")
where "type" = 'CAPTURE'
  and "status" = 'QUEUED';

create index if not exists "WorkerJob_processing_lock_idx"
on "WorkerJob" ("lockedUntil")
where "status" = 'PROCESSING';

create index if not exists "WorkerJob_campaign_status_created_idx"
on "WorkerJob" ("campaignId", "status", "createdAt" desc)
where "campaignId" is not null;

create index if not exists "WorkerJob_run_idx"
on "WorkerJob" ("runId")
where "runId" is not null;
