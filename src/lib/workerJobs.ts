import prisma from './prisma'

export const WORKER_JOB_TYPE_CAPTURE = 'CAPTURE'
export const WORKER_JOB_STATUS_QUEUED = 'QUEUED'
export const WORKER_JOB_STATUS_PROCESSING = 'PROCESSING'
export const WORKER_JOB_STATUS_SUCCESS = 'SUCCESS'
export const WORKER_JOB_STATUS_FAILED = 'FAILED'
const ACTIVE_JOB_STATUSES = [WORKER_JOB_STATUS_QUEUED, WORKER_JOB_STATUS_PROCESSING]

export type EnqueueCaptureJobsOptions = {
    source?: string; priority?: number; scheduledFor?: Date; timeoutMs?: number
    maxAttempts?: number; payload?: Record<string, unknown>; allowTerminalStatuses?: boolean
    requireFailureStatus?: boolean
}
export type EnqueueCaptureJobsResult = {
    campaignIds: string[]; created: number; skipped: number; storageReady: boolean
}
export function isWorkerJobStorageMissing(error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code) : ''
    const message = error instanceof Error ? error.message : String(error)
    return code === 'P2021'
        || /relation\s+"?WorkerJob"?\s+does not exist/i.test(message)
        || /table\s+.*WorkerJob.*does not exist/i.test(message)
}

/** Lock Campaign even when no job exists, serializing concurrent enqueues. */
export async function enqueueCaptureJobs(
    campaignIds: string[], options: EnqueueCaptureJobsOptions = {},
): Promise<EnqueueCaptureJobsResult> {
    const ids = [...new Set((campaignIds || []).map(id => id?.trim()).filter((id): id is string => Boolean(id)))].sort()
    if (ids.length === 0) return { campaignIds: [], created: 0, skipped: 0, storageReady: true }
    const blocked = options.allowTerminalStatuses
        ? ['EXPIRED', 'FINISHED', 'PROCESSING']
        : ['EXPIRED', 'FINISHED', 'PROCESSING', 'FAILED', 'QUARANTINE']
    try {
        return await prisma.$transaction(async tx => {
            const campaigns = await tx.$queryRawUnsafe<{ id: string }[]>(`
                select id from "Campaign"
                where id = any($1::text[]) and "isArchived" = false
                  and not (status = any($2::text[]))
                  and ($3::boolean = false or status in ('FAILED', 'QUARANTINE'))
                order by id for update
            `, ids, blocked, options.requireFailureStatus === true)
            const eligibleIds = campaigns.map(campaign => campaign.id)
            if (eligibleIds.length === 0) return { campaignIds: [], created: 0, skipped: ids.length, storageReady: true }
            const active = await tx.workerJob.findMany({
                where: { type: WORKER_JOB_TYPE_CAPTURE, status: { in: ACTIVE_JOB_STATUSES }, campaignId: { in: eligibleIds } },
                select: { campaignId: true, status: true },
            })
            const activeIds = new Set(active.map(job => job.campaignId))
            const toCreate = eligibleIds.filter(id => !activeIds.has(id))
            if (toCreate.length) {
                await tx.workerJob.createMany({ data: toCreate.map(campaignId => ({
                    type: WORKER_JOB_TYPE_CAPTURE, status: WORKER_JOB_STATUS_QUEUED, campaignId,
                    priority: Number.isSafeInteger(options.priority) ? options.priority : 0,
                    scheduledFor: options.scheduledFor ?? new Date(), timeoutMs: options.timeoutMs,
                    maxAttempts: Number.isSafeInteger(options.maxAttempts) && options.maxAttempts! > 0
                        ? Math.min(options.maxAttempts!, 10) : 2,
                    payload: { ...(options.payload || {}), source: options.source || 'unknown', requestedAt: new Date().toISOString() },
                })) })
            }
            const queuedIds = [...toCreate, ...active.filter(job => job.status === WORKER_JOB_STATUS_QUEUED)
                .map(job => job.campaignId).filter((id): id is string => Boolean(id))]
            if (queuedIds.length) await tx.campaign.updateMany({
                where: { id: { in: queuedIds }, isArchived: false, status: { notIn: blocked } },
                data: { status: WORKER_JOB_STATUS_QUEUED, lastWorkerError: null },
            })
            return { campaignIds: eligibleIds, created: toCreate.length, skipped: ids.length - toCreate.length, storageReady: true }
        }, { maxWait: 10_000, timeout: 15_000 })
    } catch (error) {
        if (!isWorkerJobStorageMissing(error)) throw error
        const queued = await prisma.campaign.updateMany({
            where: { id: { in: ids }, isArchived: false, status: { notIn: blocked, ...(options.requireFailureStatus ? { in: ['FAILED', 'QUARANTINE'] } : {}) } },
            data: { status: WORKER_JOB_STATUS_QUEUED, lastWorkerError: null },
        })
        return { campaignIds: queued.count ? ids : [], created: 0, skipped: ids.length, storageReady: false }
    }
}
