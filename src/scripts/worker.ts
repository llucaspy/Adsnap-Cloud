import '../lib/env'
import { randomUUID } from 'node:crypto'
import prisma from '../lib/prisma'
import { assertCaptureOwnership, CaptureOwnershipLostError, type CaptureOwnership } from '../lib/captureOwnership'
import { processCampaign, processComposition } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'
import {
    getBrasiliaDayRangeFor,
    isCampaignFinalDayToday,
    isFederalCampaignBoundaryToday,
    shouldQueueScheduledCampaign,
} from '../lib/campaignSchedule'
import {
    enqueueCaptureJobs,
    isWorkerJobStorageMissing,
    WORKER_JOB_STATUS_FAILED,
    WORKER_JOB_STATUS_PROCESSING,
    WORKER_JOB_STATUS_QUEUED,
    WORKER_JOB_STATUS_SUCCESS,
    WORKER_JOB_TYPE_CAPTURE,
} from '../lib/workerJobs'
import { normalizeCaptureDelaySeconds } from '../lib/captureTiming'

const DEFAULT_CAPTURE_BATCH_SIZE = 5
const MAX_CAPTURE_BATCH_SIZE = 20
const DEFAULT_CAPTURE_CONCURRENCY = 2
const MAX_CAPTURE_CONCURRENCY = 4
// Includes browser preparation and bounded remote storage, not just screenshot delay.
const DEFAULT_CAPTURE_OVERHEAD_MS = 120 * 1000
const MAX_DERIVED_CAPTURE_TIMEOUT_MS = 180 * 1000
const DEFAULT_CAPTURE_LEASE_MINUTES = 15
const MAX_WORKER_RUNTIME_MS = 45 * 60 * 1000
const WORKER_SHUTDOWN_RESERVE_MS = 60 * 1000

type WorkerCampaign = {
    id: string
    status: string
    client: string
    pi: string
    format: string
    segmentation: string
    captureCadence: string
    lastCaptureAt: Date | null
    processingAttempts?: number
}

type WorkerJobCampaign = WorkerCampaign & {
    runId: string
    jobId: string
    jobStatus: string
    priority: number
    attempts: number
    maxAttempts: number
    timeoutMs: number | null
    captureDelaySeconds: number | null
}

type WorkerCycleOptions = {
    drainQueue?: boolean
}

function readPositiveInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback
    return Math.min(parsed, max)
}

function readOptionalPositiveInt(value: string | undefined, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed) || parsed <= 0) return null
    return Math.min(parsed, max)
}

function readBooleanFlag(value: string | undefined, fallback: boolean) {
    if (!value) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function deriveCaptureTimeoutMs(captureDelaySeconds: number | null | undefined, configuredTimeoutMs: number | null) {
    const leaseMs = readPositiveInt(process.env.NEXUS_CAPTURE_LEASE_MINUTES, DEFAULT_CAPTURE_LEASE_MINUTES, 120) * 60_000
    const allowedMs = Math.max(1000, leaseMs - 30_000)
    if (configuredTimeoutMs && configuredTimeoutMs > 0) return Math.min(configuredTimeoutMs, allowedMs)
    const delayMs = normalizeCaptureDelaySeconds(captureDelaySeconds ?? undefined) * 1000
    return Math.min(MAX_DERIVED_CAPTURE_TIMEOUT_MS, delayMs + DEFAULT_CAPTURE_OVERHEAD_MS, allowedMs)
}

function createWorkerRunId() {
    const githubRun = process.env.GITHUB_RUN_ID || process.env.GITHUB_RUN_NUMBER
    return `${githubRun ? `gh-${githubRun}` : 'local'}-${randomUUID()}`
}

async function runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    worker: (item: T, index: number) => Promise<void>,
) {
    let cursor = 0
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (cursor < items.length) {
            const index = cursor
            cursor += 1
            await worker(items[index], index)
        }
    })
    const outcomes = await Promise.allSettled(runners)
    const failed = outcomes.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (failed) throw failed.reason
}

async function claimWorkerJobBatch(
    runId: string, limit: number, cutoff: Date, targetedCampaignIds: string[] = [],
) {
    if (limit <= 0) return [] as WorkerJobCampaign[]
    const leaseMinutes = readPositiveInt(process.env.NEXUS_CAPTURE_LEASE_MINUTES, DEFAULT_CAPTURE_LEASE_MINUTES, 120)
    try {
        return await prisma.$transaction(async tx => {
            // Campaign is the shared mutex for enqueue, claims and commits.
            const campaigns = await tx.$queryRawUnsafe<{ id: string }[]>(
                `select c.id from "Campaign" c
                 join lateral (
                     select j.priority, j."scheduledFor", j."createdAt"
                     from "WorkerJob" j
                     where j."campaignId" = c.id and j.type = 'CAPTURE'
                       and j.status = 'QUEUED' and j."scheduledFor" <= ($1::timestamptz at time zone 'UTC')
                       and j.attempts < j."maxAttempts"
                     order by j.priority desc, j."scheduledFor", j."createdAt", j.id limit 1
                 ) due on true
                 where c."isArchived" = false and c.status = 'QUEUED'
                   and (cardinality($3::text[]) = 0 or c.id = any($3::text[]))
                   and not exists (select 1 from "WorkerJob" active
                       where active."campaignId" = c.id and active.type = 'CAPTURE' and active.status = 'PROCESSING')
                 order by due.priority desc, due."scheduledFor", due."createdAt", c.id
                 limit $2 for update of c skip locked`, cutoff, limit, targetedCampaignIds)
            const result: WorkerJobCampaign[] = []
            for (const campaign of campaigns) {
                const jobs = await tx.$queryRawUnsafe<WorkerJobCampaign[]>(
                    `update "WorkerJob" j set status = 'PROCESSING', "runId" = $2,
                        "claimedAt" = (now() at time zone 'UTC'), "startedAt" = (now() at time zone 'UTC'), "finishedAt" = null,
                        "lockedUntil" = (now() at time zone 'UTC') + ($3::int * interval '1 minute'),
                        attempts = j.attempts + 1, "lastError" = null, "updatedAt" = (now() at time zone 'UTC')
                     from "Campaign" c
                     where c.id = $1 and j.id = (
                         select id from "WorkerJob" where "campaignId" = $1 and type = 'CAPTURE'
                           and status = 'QUEUED' and "scheduledFor" <= ($4::timestamptz at time zone 'UTC') and attempts < "maxAttempts"
                         order by priority desc, "scheduledFor", "createdAt", id limit 1 for update skip locked
                     )
                     returning j.id as "jobId", j.status as "jobStatus", j."runId", j.priority,
                       j.attempts, j."maxAttempts", j."timeoutMs", c.id, c.status, c.client, c.pi,
                       c.format, c.segmentation, c."captureCadence", c."lastCaptureAt", c."captureDelaySeconds"`,
                    campaign.id, runId, leaseMinutes, cutoff)
                if (!jobs.length) continue
                const updated = await tx.campaign.updateMany({
                    where: { id: campaign.id, isArchived: false, status: 'QUEUED' },
                    data: { status: 'PROCESSING', processingStartedAt: new Date(), processingHeartbeatAt: new Date(),
                        processingRunId: runId, processingAttempts: { increment: 1 },
                        lockedUntil: new Date(Date.now() + leaseMinutes * 60_000), lastWorkerError: null },
                })
                if (updated.count !== 1) throw new CaptureOwnershipLostError()
                result.push(jobs[0])
            }
            return result
        }, { maxWait: 10_000, timeout: 15_000 })
    } catch (error) {
        if (isWorkerJobStorageMissing(error)) return [] as WorkerJobCampaign[]
        throw error
    }
}

async function claimCampaignBatch(candidateIds: string[], runId: string, limit: number, statuses: string[] = ['QUEUED', 'AUTOCONFIG']) {
    if (candidateIds.length === 0 || limit <= 0) return [] as WorkerCampaign[]
    const leaseMinutes = readPositiveInt(process.env.NEXUS_CAPTURE_LEASE_MINUTES, DEFAULT_CAPTURE_LEASE_MINUTES, 120)

    return await prisma.$queryRawUnsafe<WorkerCampaign[]>(
        `
        update "Campaign" c
        set
            status = 'PROCESSING',
            "updatedAt" = (now() at time zone 'UTC'),
            "processingStartedAt" = (now() at time zone 'UTC'),
            "processingHeartbeatAt" = (now() at time zone 'UTC'),
            "processingRunId" = $2,
            "processingAttempts" = "processingAttempts" + 1,
            "lastWorkerError" = null,
            "lockedUntil" = (now() at time zone 'UTC') + ($4::int * interval '1 minute')
        where c.id in (
            select id
            from "Campaign"
            where id = any($1::text[])
              and status = any($3::text[])
              and "isArchived" = false
              and not exists (select 1 from "WorkerJob" j where j."campaignId" = "Campaign".id
                  and j.type = 'CAPTURE' and j.status in ('QUEUED', 'PROCESSING'))
            order by array_position($1::text[], id)
            limit $5
            for update skip locked
        )
        returning
            id,
            status,
            client,
            pi,
            format,
            segmentation,
            "captureCadence",
            "lastCaptureAt",
            "processingAttempts"
        `,
        candidateIds,
        runId,
        statuses,
        leaseMinutes,
        limit
    )
}

async function processCampaignWithTimeout(campaignId: string, timeoutMs: number, ownership?: CaptureOwnership, composition = false) {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
        const seconds = Math.max(1, Math.round(timeoutMs / 1000))
        controller.abort(new Error(`Timeout de ${seconds}s`))
    }, timeoutMs)

    try {
        const options = { signal: controller.signal, ownership }
        const result: Awaited<ReturnType<typeof processCampaign>> = composition
            ? await processComposition(campaignId, options) : await processCampaign(campaignId, options)
        if (!result.success && !result.quarantined) {
            throw new Error(result.error || 'Captura finalizada sem sucesso')
        }
        return result
    } finally {
        clearTimeout(timeout)
    }
}

async function cleanupStuckWorkerJobs() {
    const now = new Date()
    try {
        const stuck = await prisma.workerJob.findMany({
            where: { type: WORKER_JOB_TYPE_CAPTURE, status: WORKER_JOB_STATUS_PROCESSING, lockedUntil: { lt: now } },
            select: { id: true, campaignId: true, runId: true, attempts: true, maxAttempts: true }, take: 200,
        })
        let recovered = 0, failed = 0
        for (const job of stuck) {
            const retry = job.attempts < job.maxAttempts
            const changed = await prisma.$transaction(async tx => {
                if (job.campaignId) await tx.$queryRawUnsafe(`select id from "Campaign" where id = $1 for update`, job.campaignId)
                const updated = await tx.workerJob.updateMany({
                    where: { id: job.id, status: 'PROCESSING', runId: job.runId, attempts: job.attempts, lockedUntil: { lt: now } },
                    data: { status: retry ? 'QUEUED' : 'FAILED', runId: null, claimedAt: null, lockedUntil: null,
                        finishedAt: retry ? null : now, lastError: retry ? 'Lease expirado; job voltou para fila' : 'Lease expirado e limite de tentativas atingido' },
                })
                if (!updated.count) return false
                if (job.campaignId) await tx.campaign.updateMany({
                    where: { id: job.campaignId, status: 'PROCESSING', processingRunId: job.runId, lockedUntil: { lt: now }, isArchived: false },
                    data: { status: retry ? 'QUEUED' : 'FAILED', processingRunId: null, processingStartedAt: null,
                        processingHeartbeatAt: null, lockedUntil: null, lastWorkerError: 'Lease expirado' },
                })
                return true
            })
            if (changed) { if (retry) recovered++; else failed++ }
        }
        if (recovered || failed) await nexusLogStore.addLog(
            'Nexus Worker: recuperacao de leases concluida', failed ? 'ERROR' : 'SYSTEM', JSON.stringify({ recovered, failed }))
    } catch (error) { if (!isWorkerJobStorageMissing(error)) throw error }
}

/**
 * Requeues campaigns that are stuck in PROCESSING for too long.
 */
async function cleanupStuckCampaigns() {
    const oneHourAgo = new Date(Date.now() - 60 * 60_000)
    const recovered = await prisma.campaign.updateMany({
        where: { status: 'PROCESSING', isArchived: false,
            workerJobs: { none: { type: 'CAPTURE', status: 'PROCESSING' } },
            OR: [{ lockedUntil: { lt: new Date() } },
                { lockedUntil: null, processingHeartbeatAt: { lt: oneHourAgo } },
                { lockedUntil: null, processingHeartbeatAt: null, updatedAt: { lt: oneHourAgo } }],
        },
        data: { status: 'QUEUED', processingStartedAt: null, processingHeartbeatAt: null,
            processingRunId: null, lockedUntil: null, lastWorkerError: 'Worker interrompido ou lease expirado' },
    })
    if (recovered.count) await nexusLogStore.addLog(
        'Nexus Worker: campanhas legadas recuperadas por lease', 'SYSTEM', JSON.stringify({ recovered: recovered.count }))
}

async function cleanupOffScheduleFederalQueue(now: Date) {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
    const queued = await prisma.campaign.findMany({
        where: {
            segmentation: 'GOV_FEDERAL',
            captureCadence: 'BOUNDARY',
            status: 'QUEUED',
            isScheduled: true,
            isArchived: false,
            updatedAt: { lt: staleBefore },
        },
    })
    const offBoundary = queued.filter(campaign => !isFederalCampaignBoundaryToday(campaign, now))
    if (offBoundary.length === 0) return

    const automaticSources = new Set(['worker-schedule', 'legacy-queue-backfill', 'worker-final-day-recovery'])
    let cancelled = 0
    for (const campaign of offBoundary) {
        cancelled += await prisma.$transaction(async tx => {
            const locked = await tx.$queryRawUnsafe<{ id: string }[]>(
                `select id from "Campaign" where id=$1 and status='QUEUED'
                 and "processingRunId" is null and ("lockedUntil" is null or "lockedUntil" < (now() at time zone 'UTC')) for update`, campaign.id)
            if (!locked.length) return 0
            const jobs = await tx.workerJob.findMany({
                where: { campaignId: campaign.id, type: WORKER_JOB_TYPE_CAPTURE, status: { in: ['QUEUED', 'PROCESSING'] } },
                select: { id: true, status: true, payload: true },
            })
            if (jobs.some(job => job.status === 'PROCESSING')) return 0
            const automatic = jobs.filter(job => {
                const payload = job.payload as Record<string, unknown> | null
                return typeof payload?.source === 'string' && automaticSources.has(payload.source)
            })
            if (automatic.length) await tx.workerJob.updateMany({
                where: { id: { in: automatic.map(job => job.id) }, status: 'QUEUED' },
                data: { status: 'CANCELLED', finishedAt: now, lastError: 'OUTSIDE_CAPTURE_BOUNDARY', runId: null, lockedUntil: null },
            })
            // Unknown and manual origins remain queued. Never cancel them by inference.
            if (jobs.length !== automatic.length) return automatic.length
            await tx.campaign.updateMany({ where: { id: campaign.id, status: 'QUEUED', processingRunId: null }, data: { status: campaign.lastCaptureAt ? 'SUCCESS' : 'PENDING' } })
            return automatic.length || 1
        })
    }
    if (cancelled) await nexusLogStore.addLog(`Nexus Worker: ${cancelled} tarefa(s) automáticas fora do início/fim foram retiradas`, 'SYSTEM')
}

async function backfillQueuedCaptureJobs(now: Date, targetedCampaignIds: string[] = []) {
    if (targetedCampaignIds.length > 0) return

    const queuedCandidates = await prisma.campaign.findMany({
        where: {
            status: 'QUEUED',
            isArchived: false,
        },
        orderBy: { updatedAt: 'asc' },
        take: 200,
        select: {
            id: true,
            segmentation: true,
            captureCadence: true,
            flightStart: true,
            flightEnd: true,
            scheduledTimes: true,
            lastCaptureAt: true,
        },
    })

    const eligibleIds = queuedCandidates
        .filter(campaign => (
            campaign.segmentation.trim().toUpperCase() !== 'GOV_FEDERAL'
            || campaign.captureCadence.trim().toUpperCase() === 'DAILY'
            || isFederalCampaignBoundaryToday(campaign, now)
        ))
        .map(campaign => campaign.id)

    if (eligibleIds.length === 0) return

    const queueResult = await enqueueCaptureJobs(eligibleIds, {
        source: 'legacy-queue-backfill',
        priority: 1,
    })

    if (queueResult.storageReady && queueResult.created > 0) {
        await nexusLogStore.addLog(
            `Nexus Worker: ${queueResult.created} campanha(s) legadas convertidas para WorkerJob`,
            'SYSTEM',
            JSON.stringify(queueResult)
        )
    }
}

async function queueFinalDayRecoveryCaptures(now: Date) {
    const range = getBrasiliaDayRangeFor(now)
    // Include civil dates formerly saved at UTC midnight, then verify the single
    // canonical date in JS. This bounds the query before pagination.
    const legacyStart = new Date(range.start.getTime() - 3 * 60 * 60 * 1000)
    let cursor: string | undefined
    let requested = 0
    let queued = 0
    while (true) {
    const candidates = await prisma.campaign.findMany({
        where: {
            isScheduled: true,
            isArchived: false,
            flightEnd: { gte: legacyStart, lt: range.end },
            status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED', 'FAILED', 'QUARANTINE'] },
            NOT: {
                captures: {
                    some: {
                        status: 'SUCCESS',
                        createdAt: {
                            gte: range.start,
                            lt: range.end,
                        },
                    },
                },
            },
        },
        select: {
            id: true,
            pi: true,
            client: true,
            segmentation: true,
            captureCadence: true,
            flightStart: true,
            flightEnd: true,
            scheduledTimes: true,
            lastCaptureAt: true,
            status: true,
            isScheduled: true,
        },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: 250,
    })

    const recoveryIds = candidates
        .filter(campaign => campaign.isScheduled && !['FAILED', 'QUARANTINE'].includes(campaign.status)
            && isCampaignFinalDayToday(campaign, now) && shouldQueueScheduledCampaign(campaign, now))
        .map(campaign => campaign.id)

    if (recoveryIds.length > 0) {
    const queueResult = await enqueueCaptureJobs(recoveryIds, {
        source: 'worker-final-day-recovery',
        priority: 20,
        allowTerminalStatuses: false,
    })
    requested += recoveryIds.length
    queued += queueResult.created
    }
    if (candidates.length < 250) break
    cursor = candidates[candidates.length - 1].id
    }
    if (requested) await nexusLogStore.addLog(`Nexus Worker: recuperação de fechamento enfileirou ${queued} formato(s) no horário devido`, 'SYSTEM',
        JSON.stringify({ rangeStart: range.start.toISOString(), rangeEnd: range.end.toISOString(), requested, created: queued }))
}

type CaptureSummary = {
    claimed: number
    success: number
    failed: number
    timeout: number
    quarantine: number
    batchesClaimed: number
    drainPasses: number
    stoppedByDeadline: boolean
    jobsClaimed: number
    legacyClaimed: number
    requeued: number
    deadletter: number
    ownershipLost: number
    cycleErrors: number
    unconfirmed: number
    deferred: number
}

function captureCycleStatus(summary: CaptureSummary) {
    if (summary.failed > 0 || summary.cycleErrors > 0 || summary.ownershipLost > 0) return 'FAILED'
    if (summary.stoppedByDeadline || summary.requeued > 0 || summary.deferred > 0) return 'DEFERRED'
    return summary.claimed ? 'SUCCESS' : 'IDLE'
}

/** Return a reservation that never reached the browser, without using an attempt.
 * A lease may have expired while logging, so release checks the exact owner and
 * attempt under locks, rather than requiring an unexpired processing lease.
 */
async function releaseUnstartedWorkerJob(job: WorkerJobCampaign) {
    try {
        return await prisma.$transaction(async tx => {
            const campaigns = await tx.$queryRawUnsafe<{ id: string }[]>(`
                select id from "Campaign" where id = $1 and status = 'PROCESSING'
                  and "processingRunId" = $2 for update
            `, job.id, job.runId)
            if (campaigns.length !== 1) throw new CaptureOwnershipLostError()
            const released = await tx.workerJob.updateMany({
                where: { id: job.jobId, campaignId: job.id, status: 'PROCESSING', runId: job.runId, attempts: job.attempts },
                data: { status: 'QUEUED', attempts: { decrement: 1 }, runId: null, claimedAt: null,
                    startedAt: null, finishedAt: null, lockedUntil: null,
                    lastError: 'Captura adiada antes de iniciar: orcamento do ciclo atingido' },
            })
            if (released.count !== 1) throw new CaptureOwnershipLostError()
            const campaign = await tx.campaign.updateMany({
                where: { id: job.id, status: 'PROCESSING', processingRunId: job.runId },
                data: { status: 'QUEUED', processingAttempts: { decrement: 1 }, processingStartedAt: null,
                    processingHeartbeatAt: null, processingRunId: null, lockedUntil: null,
                    lastWorkerError: 'Captura adiada antes de iniciar: orcamento do ciclo atingido' },
            })
            if (campaign.count !== 1) throw new CaptureOwnershipLostError()
            return true
        })
    } catch (error) {
        if (error instanceof CaptureOwnershipLostError) return false
        throw error
    }
}

async function releaseUnstartedLegacyCampaign(campaign: WorkerCampaign, runId: string, composition: boolean) {
    const released = await prisma.campaign.updateMany({
        where: { id: campaign.id, status: 'PROCESSING', processingRunId: runId },
        data: { status: composition ? 'AUTOCONFIG' : 'QUEUED', processingAttempts: { decrement: 1 },
            processingStartedAt: null, processingHeartbeatAt: null, processingRunId: null, lockedUntil: null,
            lastWorkerError: 'Captura adiada antes de iniciar: orcamento do ciclo atingido' },
    })
    return released.count === 1
}

async function finishWorkerJob(job: WorkerJobCampaign, status: string, lastError?: string | null) {
    const updated = await prisma.workerJob.updateMany({
        where: { id: job.jobId, status: 'PROCESSING', runId: job.runId, attempts: job.attempts, lockedUntil: { gt: new Date() } },
        data: { status, finishedAt: new Date(), lockedUntil: null, lastError: lastError || null },
    })
    if (updated.count === 1) return
    const terminal = await prisma.workerJob.findFirst({
        where: { id: job.jobId, runId: job.runId, attempts: job.attempts, status }, select: { id: true },
    })
    if (!terminal) throw new CaptureOwnershipLostError()
}

async function retryOrFailWorkerJob(job: WorkerJobCampaign, message: string, summary: CaptureSummary) {
    const canRetry = job.attempts < job.maxAttempts
    const nextScheduledFor = new Date(Date.now() + Math.min(15 * 60_000, Math.max(30_000, job.attempts * 45_000)))
    try {
        await prisma.$transaction(async tx => {
            await assertCaptureOwnership(tx, { campaignId: job.id, jobId: job.jobId, runId: job.runId, attempt: job.attempts })
            const updated = await tx.workerJob.updateMany({
                where: { id: job.jobId, status: 'PROCESSING', runId: job.runId, attempts: job.attempts },
                data: { status: canRetry ? 'QUEUED' : 'FAILED', runId: null, claimedAt: null, lockedUntil: null,
                    finishedAt: canRetry ? null : new Date(), scheduledFor: nextScheduledFor, lastError: message },
            })
            if (updated.count !== 1) throw new CaptureOwnershipLostError()
            const campaign = await tx.campaign.updateMany({
                where: { id: job.id, status: 'PROCESSING', processingRunId: job.runId },
                data: { status: canRetry ? 'QUEUED' : 'FAILED', processingStartedAt: null,
                    processingHeartbeatAt: null, processingRunId: null, lockedUntil: null, lastWorkerError: message },
            })
            if (campaign.count !== 1) throw new CaptureOwnershipLostError()
        })
        if (canRetry) summary.requeued++
        else { summary.failed++; summary.deadletter++ }
    } catch (error) {
        if (!(error instanceof CaptureOwnershipLostError)) throw error
        summary.ownershipLost++
        await nexusLogStore.addLog('Nexus Worker: resultado antigo descartado por perda de posse', 'ERROR',
            JSON.stringify({ jobId: job.jobId, runId: job.runId, attempt: job.attempts }), job.id)
    }
}

async function processWorkerCaptureJob(job: WorkerJobCampaign, configuredCaptureTimeoutMs: number | null, summary: CaptureSummary, budgetMs = Number.MAX_SAFE_INTEGER) {
    const timeoutMs = Math.max(1, Math.min(budgetMs, deriveCaptureTimeoutMs(job.captureDelaySeconds, job.timeoutMs || configuredCaptureTimeoutMs)))
    const ownership = { campaignId: job.id, jobId: job.jobId, runId: job.runId, attempt: job.attempts }
    let captureCompleted = false
    try {
        const result = await processCampaignWithTimeout(job.id, timeoutMs, ownership)
        captureCompleted = result.success || Boolean(result.quarantined)
        if (result.success) {
            await finishWorkerJob(job, WORKER_JOB_STATUS_SUCCESS)
            summary.success++
        } else if (result.quarantined) {
            await finishWorkerJob(job, WORKER_JOB_STATUS_FAILED, result.error || 'Campanha em quarentena')
            summary.failed++; summary.quarantine++
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (captureCompleted) {
            // Never repeat browser/storage side effects just because the ACK could not be read.
            summary.cycleErrors++; summary.unconfirmed++
            await nexusLogStore.addLog('Nexus Worker: resultado persistido, confirmacao do job indisponivel', 'ERROR',
                JSON.stringify({ jobId: job.jobId, runId: job.runId, error: message }), job.id)
            return
        }
        if (message.toLowerCase().includes('timeout')) summary.timeout++
        await retryOrFailWorkerJob(job, message, summary)
    }
}

async function processLegacyCampaign(
    campaign: WorkerCampaign, autoconfigIds: Set<string>, configuredCaptureTimeoutMs: number | null,
    summary: CaptureSummary, runId: string, budgetMs = Number.MAX_SAFE_INTEGER,
) {
    const composition = autoconfigIds.has(campaign.id)
    try {
        const result = await processCampaignWithTimeout(campaign.id, Math.max(1, Math.min(budgetMs, deriveCaptureTimeoutMs(null, configuredCaptureTimeoutMs))),
            { campaignId: campaign.id, runId }, composition)
        if (result.success) summary.success++
        else if (result.quarantined) { summary.failed++; summary.quarantine++ }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const exhausted = (campaign.processingAttempts ?? 1) >= 3
        const updated = await prisma.campaign.updateMany({
            where: { id: campaign.id, status: 'PROCESSING', processingRunId: runId, lockedUntil: { gt: new Date() } },
            data: { status: exhausted ? 'FAILED' : composition ? 'AUTOCONFIG' : 'QUEUED', processingStartedAt: null,
                processingHeartbeatAt: null, processingRunId: null, lockedUntil: null, lastWorkerError: message },
        })
        if (!updated.count) summary.ownershipLost++
        else if (exhausted) { summary.failed++; summary.deadletter++ }
        else summary.requeued++
        if (message.toLowerCase().includes('timeout')) summary.timeout++
    }
}

/**
 * Main worker logic cycle
 */
async function runWorkerCycle(options: WorkerCycleOptions = {}) {
    console.log('[Nexus Worker] Iniciando ciclo de processamento...')
    const runId = createWorkerRunId()
    const cycleStartedAt = Date.now()
    const captureBatchSize = readPositiveInt(process.env.NEXUS_CAPTURE_BATCH_SIZE, DEFAULT_CAPTURE_BATCH_SIZE, MAX_CAPTURE_BATCH_SIZE)
    const captureConcurrency = readPositiveInt(process.env.NEXUS_CAPTURE_CONCURRENCY, DEFAULT_CAPTURE_CONCURRENCY, MAX_CAPTURE_CONCURRENCY)
    const configuredCaptureTimeoutMs = readOptionalPositiveInt(process.env.NEXUS_CAPTURE_TIMEOUT_MS, 20 * 60 * 1000)
    const captureTimeoutMs = deriveCaptureTimeoutMs(null, configuredCaptureTimeoutMs)
    const maxRuntimeMs = readPositiveInt(process.env.NEXUS_WORKER_MAX_RUNTIME_MS, MAX_WORKER_RUNTIME_MS, MAX_WORKER_RUNTIME_MS)
    const deadlineAt = cycleStartedAt + maxRuntimeMs - Math.min(WORKER_SHUTDOWN_RESERVE_MS, Math.floor(maxRuntimeMs / 5))
    const drainQueue = options.drainQueue ?? false
    const captureSummary: CaptureSummary = {
        claimed: 0,
        success: 0,
        failed: 0,
        timeout: 0,
        quarantine: 0,
        batchesClaimed: 0,
        drainPasses: 0,
        stoppedByDeadline: false,
        jobsClaimed: 0,
        legacyClaimed: 0,
        requeued: 0,
        deadletter: 0,
        ownershipLost: 0,
        cycleErrors: 0,
        unconfirmed: 0,
        deferred: 0,
    }
    const recordCycleError = async (stage: string, error: unknown) => {
        captureSummary.cycleErrors++
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[Nexus Worker] Falha em ${stage}:`, error)
        await nexusLogStore.addLog(`Nexus Worker: falha operacional em ${stage}`, 'ERROR', JSON.stringify({ runId, stage, error: message }))
    }
    await nexusLogStore.addLog(
        'Nexus Worker: Ciclo iniciado no servidor.',
        'SYSTEM',
        JSON.stringify({ runId, captureBatchSize, captureConcurrency, configuredCaptureTimeoutMs, drainQueue, maxRuntimeMs })
    )
    const targetedCampaignIds = [...new Set(
        (process.env.TARGET_CAMPAIGN_IDS || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean)
    )]

    const now = new Date()
    // 0. Cleanup
    try {
        await cleanupStuckWorkerJobs()
        await cleanupStuckCampaigns()
        if (targetedCampaignIds.length === 0) await cleanupOffScheduleFederalQueue(now)
    } catch (error) { await recordCycleError('recuperacao de tarefas', error) }

    if (targetedCampaignIds.length > 0) {
        try {
            await enqueueCaptureJobs(targetedCampaignIds, {
                source: 'worker-targeted-dispatch', priority: 25, allowTerminalStatuses: true,
            })
        } catch (error) { await recordCycleError('enfileiramento direcionado', error) }
    }

    // A targeted request must not schedule unrelated campaigns.
    if (targetedCampaignIds.length === 0) try {
        const scheduledCampaigns = await prisma.campaign.findMany({
            where: {
                isScheduled: true,
                isArchived: false,
                status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED', 'FAILED', 'QUARANTINE'] },
            }
        })

        const toQueueIds = scheduledCampaigns
            .filter(campaign => shouldQueueScheduledCampaign(campaign, now))
            .map(campaign => campaign.id)

        if (toQueueIds.length > 0) {
            const queueResult = await enqueueCaptureJobs(toQueueIds, {
                source: 'worker-schedule',
                priority: 5,
            })
            await nexusLogStore.addLog(
                `Nexus Worker: ${toQueueIds.length} campanhas agendadas enfileiradas automaticamente`,
                'SYSTEM',
                JSON.stringify(queueResult)
            )
        }
    } catch (err) {
        await recordCycleError('agendamento', err)
    }

    try {
        await backfillQueuedCaptureJobs(now, targetedCampaignIds)
    } catch (err) {
        await recordCycleError('conversao da fila legada', err)
    }

    if (targetedCampaignIds.length === 0) {
        try {
            await queueFinalDayRecoveryCaptures(now)
        } catch (err) {
            await recordCycleError('recuperacao de fechamento', err)
        }
    }

    // GAM imports run exclusively in gam-worker.ts / gam-import.yml.

    // 8. Campaign Capture (movido para o final)
    try {
        const captureCutoff = new Date()
        let batchNumber = 0

        while (true) {
            if (Date.now() + Math.min(captureTimeoutMs, 1000) >= deadlineAt) {
                captureSummary.stoppedByDeadline = true
                await nexusLogStore.addLog(
                    `Nexus Worker: drenagem interrompida por limite de runtime apos ${captureSummary.batchesClaimed} lote(s)`,
                    'SYSTEM',
                    JSON.stringify({ runId, captureCutoff, maxRuntimeMs, captureSummary })
                )
                break
            }

            captureSummary.drainPasses++
            batchNumber++

            // Reserve only slots that can start immediately; no idle jobs consume a lease.
            const claimCapacity = Math.min(captureBatchSize, captureConcurrency)
            const workerJobs = await claimWorkerJobBatch(runId, claimCapacity, captureCutoff, targetedCampaignIds)
            captureSummary.claimed += workerJobs.length
            captureSummary.jobsClaimed += workerJobs.length

            if (workerJobs.length > 0) {
                captureSummary.batchesClaimed++
                if (targetedCampaignIds.length > 0) {
                    await nexusLogStore.addLog(
                        `Nexus Worker: captura direcionada por WorkerJob para ${workerJobs.length} de ${targetedCampaignIds.length} item(ns)`,
                        'SYSTEM',
                        JSON.stringify({ runId, batchNumber, captureCutoff })
                    )
                }
                console.log(`[Nexus Worker] Lote ${batchNumber}: ${workerJobs.length} job(s) de captura para processar.`)
                await nexusLogStore.addLog(
                    `Nexus Worker: Processando lote ${batchNumber} com ${workerJobs.length} job(s) estruturados`,
                    'SYSTEM',
                    JSON.stringify({ runId, batchNumber, captureCutoff, drainQueue, captureBatchSize, captureConcurrency })
                )

                await runWithConcurrency(workerJobs, captureConcurrency, async job => {
                    const remainingMs = deadlineAt - Date.now()
                    const timeoutMs = deriveCaptureTimeoutMs(job.captureDelaySeconds, job.timeoutMs || configuredCaptureTimeoutMs)
                    if (remainingMs < timeoutMs) {
                        captureSummary.stoppedByDeadline = true
                        if (await releaseUnstartedWorkerJob(job)) captureSummary.deferred++
                        else captureSummary.ownershipLost++
                        return
                    }
                    await processWorkerCaptureJob(job, configuredCaptureTimeoutMs, captureSummary, remainingMs)
                })

                if (!drainQueue || captureSummary.stoppedByDeadline) break
                continue
            }

        const queuedCandidates = await prisma.campaign.findMany({
            where: {
                status: 'QUEUED',
                isArchived: false,
                updatedAt: { lte: captureCutoff },
                ...(targetedCampaignIds.length > 0 ? { id: { in: targetedCampaignIds } } : {})
            },
            orderBy: { updatedAt: 'asc' },
            take: 100
        })
        const boundaryFederal = targetedCampaignIds.length > 0
            ? []
            : queuedCandidates.filter(campaign => isFederalCampaignBoundaryToday(campaign, now))
        const regularQueue = targetedCampaignIds.length > 0
            ? queuedCandidates
            : queuedCandidates.filter(campaign => (
                campaign.segmentation.trim().toUpperCase() !== 'GOV_FEDERAL'
                || campaign.captureCadence.trim().toUpperCase() === 'DAILY'
            ))
        const queuedCampaigns = targetedCampaignIds.length > 0
            ? regularQueue
            : [...boundaryFederal, ...regularQueue.slice(0, Math.max(0, captureBatchSize - boundaryFederal.length))]

        const autoconfigCampaigns = targetedCampaignIds.length > 0 || queuedCampaigns.length >= captureBatchSize ? [] : await prisma.campaign.findMany({
            where: {
                status: 'AUTOCONFIG',
                isArchived: false,
                updatedAt: { lte: captureCutoff },
            },
            orderBy: { updatedAt: 'asc' },
            take: captureBatchSize - queuedCampaigns.length
        })

        const autoconfigIds = new Set(autoconfigCampaigns.map(campaign => campaign.id))
        const candidateIds = [...queuedCampaigns, ...autoconfigCampaigns].map(campaign => campaign.id)
        const campaigns = await claimCampaignBatch(candidateIds, runId, claimCapacity)
        captureSummary.claimed += campaigns.length
        captureSummary.legacyClaimed += campaigns.length
        if (campaigns.length > 0) captureSummary.batchesClaimed++

        if (campaigns.length > 0) {
            if (targetedCampaignIds.length > 0) {
                await nexusLogStore.addLog(
                    `Nexus Worker: captura manual direcionada para ${campaigns.length} de ${targetedCampaignIds.length} item(ns)`,
                    'SYSTEM',
                    JSON.stringify({ runId, batchNumber, captureCutoff })
                )
            }
            console.log(`[Nexus Worker] Lote ${batchNumber}: ${campaigns.length} campanhas/montagens para processar.`)
            await nexusLogStore.addLog(
                `Nexus Worker: Processando lote ${batchNumber} com ${campaigns.length} itens`,
                'SYSTEM',
                JSON.stringify({ runId, batchNumber, captureCutoff, drainQueue, captureBatchSize })
            )

            await runWithConcurrency(campaigns, captureConcurrency, async campaign => {
                const remainingMs = deadlineAt - Date.now()
                if (remainingMs < captureTimeoutMs) {
                    captureSummary.stoppedByDeadline = true
                    if (await releaseUnstartedLegacyCampaign(campaign, runId, autoconfigIds.has(campaign.id))) captureSummary.deferred++
                    else captureSummary.ownershipLost++
                    return
                }
                await processLegacyCampaign(campaign, autoconfigIds, configuredCaptureTimeoutMs, captureSummary, runId, remainingMs)
            })
        }


            if (campaigns.length === 0 || !drainQueue || captureSummary.stoppedByDeadline) break
        }
    } catch (err) {
        await recordCycleError('captura', err)
    }

    const durationMs = Date.now() - cycleStartedAt
    const cycleStatus = captureCycleStatus(captureSummary)
    const failed = cycleStatus === 'FAILED'
    await nexusLogStore.addLog(
        `Nexus Worker: Ciclo finalizado (${captureSummary.success} sucesso, ${captureSummary.failed} falha, ${captureSummary.requeued} aguardando nova tentativa)`,
        failed ? 'ERROR' : cycleStatus === 'SUCCESS' ? 'SUCCESS' : 'SYSTEM',
        JSON.stringify({ runId, cycleStatus, durationMs, captureSummary, captureBatchSize, captureConcurrency, captureTimeoutMs, configuredCaptureTimeoutMs, drainQueue, maxRuntimeMs })
    )
    if (failed) throw new Error(`Nexus Worker: ciclo ${runId} terminou com falhas; consulte os logs`)
}

/**
 * Entry point
 */
async function startWorker() {
    const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.NODE_ENV === 'production'
    const drainQueue = readBooleanFlag(process.env.NEXUS_WORKER_DRAIN_QUEUE, isCI)
    console.log(`[Nexus Worker] Iniciado em modo ${isCI ? 'CI/PROD' : 'LOCAL'}`)

    if (isCI) {
        try {
            await runWorkerCycle({ drainQueue })
        } finally {
            await prisma.$disconnect()
        }
        process.exit(0)
    } else {
        while (true) {
            await runWorkerCycle({ drainQueue })
            await new Promise(r => setTimeout(r, 60000))
        }
    }
}

startWorker().catch(err => {
    console.error('[Nexus Worker] Erro fatal:', err)
    process.exit(1)
})
