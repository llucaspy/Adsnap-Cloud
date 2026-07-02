import prisma from './prisma'

export const WORKER_JOB_TYPE_CAPTURE = 'CAPTURE'
export const WORKER_JOB_STATUS_QUEUED = 'QUEUED'
export const WORKER_JOB_STATUS_PROCESSING = 'PROCESSING'
export const WORKER_JOB_STATUS_SUCCESS = 'SUCCESS'
export const WORKER_JOB_STATUS_FAILED = 'FAILED'

const ACTIVE_JOB_STATUSES = [WORKER_JOB_STATUS_QUEUED, WORKER_JOB_STATUS_PROCESSING]

export type EnqueueCaptureJobsOptions = {
    source?: string
    priority?: number
    scheduledFor?: Date
    timeoutMs?: number
    maxAttempts?: number
    payload?: Record<string, unknown>
    allowTerminalStatuses?: boolean
}

export type EnqueueCaptureJobsResult = {
    campaignIds: string[]
    created: number
    skipped: number
    storageReady: boolean
}

export function isWorkerJobStorageMissing(error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : ''
    const message = error instanceof Error ? error.message : String(error)

    return code === 'P2021'
        || /relation\s+"?WorkerJob"?\s+does not exist/i.test(message)
        || /table\s+.*WorkerJob.*does not exist/i.test(message)
}

export async function enqueueCaptureJobs(
    campaignIds: string[],
    options: EnqueueCaptureJobsOptions = {},
): Promise<EnqueueCaptureJobsResult> {
    const ids = [...new Set(
        (campaignIds || [])
            .map(id => id?.trim())
            .filter((id): id is string => Boolean(id))
    )]

    if (ids.length === 0) {
        return { campaignIds: [], created: 0, skipped: 0, storageReady: true }
    }

    const blockedStatuses = options.allowTerminalStatuses
        ? ['EXPIRED', 'FINISHED', 'PROCESSING']
        : ['EXPIRED', 'FINISHED', 'PROCESSING', 'FAILED', 'QUARANTINE']

    const eligibleCampaigns = await prisma.campaign.findMany({
        where: {
            id: { in: ids },
            isArchived: false,
            status: { notIn: blockedStatuses },
        },
        select: { id: true },
    })
    const eligibleIds = eligibleCampaigns.map(campaign => campaign.id)

    if (eligibleIds.length === 0) {
        return { campaignIds: [], created: 0, skipped: ids.length, storageReady: true }
    }

    await prisma.campaign.updateMany({
        where: {
            id: { in: eligibleIds },
        },
        data: {
            status: WORKER_JOB_STATUS_QUEUED,
            lastWorkerError: null,
        },
    })

    try {
        const activeJobs = await prisma.workerJob.findMany({
            where: {
                type: WORKER_JOB_TYPE_CAPTURE,
                status: { in: ACTIVE_JOB_STATUSES },
                campaignId: { in: eligibleIds },
            },
            select: { campaignId: true },
        })
        const activeCampaignIds = new Set(
            activeJobs
                .map(job => job.campaignId)
                .filter((id): id is string => Boolean(id))
        )
        const toCreate = eligibleIds.filter(id => !activeCampaignIds.has(id))

        if (toCreate.length > 0) {
            await prisma.workerJob.createMany({
                data: toCreate.map(campaignId => ({
                    type: WORKER_JOB_TYPE_CAPTURE,
                    status: WORKER_JOB_STATUS_QUEUED,
                    campaignId,
                    priority: options.priority ?? 0,
                    scheduledFor: options.scheduledFor ?? new Date(),
                    timeoutMs: options.timeoutMs,
                    maxAttempts: options.maxAttempts ?? 2,
                    payload: {
                        source: options.source || 'unknown',
                        requestedAt: new Date().toISOString(),
                        ...(options.payload || {}),
                    },
                })),
            })
        }

        return {
            campaignIds: eligibleIds,
            created: toCreate.length,
            skipped: ids.length - toCreate.length,
            storageReady: true,
        }
    } catch (error) {
        if (isWorkerJobStorageMissing(error)) {
            return {
                campaignIds: eligibleIds,
                created: 0,
                skipped: ids.length,
                storageReady: false,
            }
        }
        throw error
    }
}
