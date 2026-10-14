import prisma from '@/lib/prisma'
import { WorkerLogsPanel } from '@/components/WorkerLogsPanel'
import { isWorkerJobStorageMissing, WORKER_JOB_TYPE_CAPTURE } from '@/lib/workerJobs'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { GAM_JOB_LEVELS } from '@/lib/gamJobStatus'
import { Prisma } from '@prisma/client'
import { sanitizeLogMessage, sanitizeLogRecord } from '@/lib/logRedaction'
import { groupWorkerRunLogs, readWorkerBatchSize } from '@/lib/workerPresentation'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

function serializeDate(value: Date | null | undefined) {
    return value ? value.toISOString() : null
}

function countStatus(items: { status: string; _count: { _all: number } }[], status: string) {
    return items.find(item => item.status === status)?._count._all || 0
}

function batchesFor(items: number, batchSize: number) {
    return items > 0 ? Math.ceil(items / batchSize) : 0
}

export default async function WorkersPage() {
    const session = await requireAuth()
    const formatLabels = await getFormatLabelMap()
    return prisma.$transaction(async (prisma) => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const legacyWhere: Prisma.CampaignWhereInput = {
        isArchived: false,
        OR: [
            { status: { in: ['QUEUED', 'PROCESSING', 'AUTOCONFIG'] }, workerJobs: { none: { type: WORKER_JOB_TYPE_CAPTURE, status: { in: ['QUEUED', 'PROCESSING'] } } } },
            { status: { in: ['FAILED', 'QUARANTINE'] }, workerJobs: { none: { type: WORKER_JOB_TYPE_CAPTURE } } },
        ],
    }

    const [
        formatLabelMap,
        queue,
        campaignStatusCounts,
        recentLogs,
        logLevelCounts,
        captureStatusCounts,
        gamJobs,
        processingRunGroups,
        recentErrors,
    ] = await Promise.all([
        Promise.resolve(formatLabels),
        prisma.campaign.findMany({
            where: legacyWhere,
            orderBy: [{ status: 'asc' }, { updatedAt: 'asc' }],
            take: 80,
            select: {
                id: true,
                pi: true,
                client: true,
                campaignName: true,
                format: true,
                device: true,
                status: true,
                updatedAt: true,
                lastCaptureAt: true,
                processingStartedAt: true,
                processingHeartbeatAt: true,
                processingRunId: true,
                processingAttempts: true,
                lastWorkerError: true,
                lockedUntil: true,
                captures: {
                    where: { status: 'SUCCESS' },
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                    select: { createdAt: true, screenshotPath: true, status: true },
                },
            },
        }),
        prisma.campaign.groupBy({
            by: ['status'],
            where: legacyWhere,
            _count: { _all: true },
        }),
        prisma.nexusLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 180,
            select: {
                id: true,
                level: true,
                message: true,
                details: true,
                campaignId: true,
                createdAt: true,
            },
        }),
        prisma.nexusLog.groupBy({
            by: ['level'],
            where: { createdAt: { gte: dayAgo } },
            _count: { _all: true },
        }),
        prisma.capture.groupBy({
            by: ['status'],
            where: { createdAt: { gte: dayAgo } },
            _count: { _all: true },
        }),
        prisma.nexusLog.findMany({
            where: { level: { in: GAM_JOB_LEVELS } },
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: { id: true, level: true, message: true, details: true, createdAt: true },
        }),
        prisma.campaign.groupBy({
            by: ['processingRunId'],
            where: {
                isArchived: false,
                status: 'PROCESSING',
                processingRunId: { not: null },
            },
            _count: { _all: true },
        }),
        prisma.nexusLog.findMany({
            where: { level: { in: ['ERROR', 'API_ERROR', 'FAILED'] }, createdAt: { gte: dayAgo } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 12,
            select: { id: true, level: true, message: true, details: true, campaignId: true, createdAt: true },
        }),
    ])

    const batchSize = readWorkerBatchSize(process.env.NEXUS_CAPTURE_BATCH_SIZE)
    type QueueRow = (typeof queue)[number] & { jobId?: string | null }
    let workerJobQueue: QueueRow[] = []
    let workerJobStatusCounts: { status: string; _count: { _all: number } }[] = []
    let workerJobRunGroups: { runId: string | null; _count: { _all: number } }[] = []

    try {
        const [jobQueue, jobStatusCounts, jobRunGroups] = await Promise.all([
            prisma.workerJob.findMany({
                where: {
                    type: WORKER_JOB_TYPE_CAPTURE,
                    status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] },
                    campaign: { is: { isArchived: false } },
                },
                orderBy: [{ status: 'desc' }, { priority: 'desc' }, { scheduledFor: 'asc' }],
                take: 80,
                include: {
                    campaign: {
                        select: {
                            id: true,
                            pi: true,
                            client: true,
                            campaignName: true,
                            format: true,
                            device: true,
                            status: true,
                            updatedAt: true,
                            lastCaptureAt: true,
                            processingStartedAt: true,
                            processingHeartbeatAt: true,
                            processingRunId: true,
                            processingAttempts: true,
                            lastWorkerError: true,
                            lockedUntil: true,
                            captures: {
                                where: { status: 'SUCCESS' },
                                orderBy: { createdAt: 'desc' },
                                take: 1,
                                select: { createdAt: true, screenshotPath: true, status: true },
                            },
                        },
                    },
                },
            }),
            prisma.workerJob.groupBy({
                by: ['status'],
                where: {
                    type: WORKER_JOB_TYPE_CAPTURE,
                    status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] },
                    campaign: { is: { isArchived: false } },
                },
                _count: { _all: true },
            }),
            prisma.workerJob.groupBy({
                by: ['runId'],
                where: {
                    type: WORKER_JOB_TYPE_CAPTURE,
                    status: 'PROCESSING',
                    runId: { not: null },
                    campaign: { is: { isArchived: false } },
                },
                _count: { _all: true },
            }),
        ])

        workerJobQueue = jobQueue
            .filter(job => job.campaign)
            .map(job => ({
                ...job.campaign!,
                jobId: job.id,
                status: job.status,
                updatedAt: job.updatedAt,
                processingStartedAt: job.startedAt,
                processingHeartbeatAt: job.claimedAt,
                processingRunId: job.runId,
                processingAttempts: job.attempts,
                lastWorkerError: job.lastError || job.campaign!.lastWorkerError,
                lockedUntil: job.lockedUntil,
            }))
        workerJobStatusCounts = jobStatusCounts
        workerJobRunGroups = jobRunGroups
    } catch (error) {
        if (!isWorkerJobStorageMissing(error)) throw error
    }

    const hasWorkerJobMetrics = workerJobStatusCounts.length > 0 || workerJobQueue.length > 0
    const mergedCounts = new Map<string, number>()
    for (const item of [...campaignStatusCounts, ...workerJobStatusCounts]) mergedCounts.set(item.status, (mergedCounts.get(item.status) || 0) + item._count._all)
    const statusSource = [...mergedCounts].map(([status, count]) => ({ status, _count: { _all: count } }))
    const waitingItems = countStatus(statusSource, 'QUEUED') + countStatus(statusSource, 'AUTOCONFIG')
    const runningItems = countStatus(statusSource, 'PROCESSING')
    const errorItems = countStatus(statusSource, 'FAILED') + countStatus(statusSource, 'QUARANTINE')
    const waitingBatches = batchesFor(waitingItems, batchSize)
    const runningGroups = hasWorkerJobMetrics ? workerJobRunGroups : processingRunGroups
    const runningBatches = runningGroups.length > 0 ? runningGroups.length : batchesFor(runningItems, batchSize)
    const errorBatches = batchesFor(errorItems, batchSize)
    const batchMetrics = {
        batchSize,
        total: waitingBatches + runningBatches + errorBatches,
        running: runningBatches,
        waiting: waitingBatches,
        errors: errorBatches,
        totalItems: waitingItems + runningItems + errorItems,
        runningItems,
        waitingItems,
        errorItems,
    }

    const campaignIds = [...new Set([...recentLogs, ...recentErrors].map(log => log.campaignId).filter(Boolean))] as string[]
    const campaignsById = campaignIds.length > 0
        ? await prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, pi: true, client: true, format: true, status: true },
        })
        : []
    const campaignMap = new Map(campaignsById.map(campaign => [campaign.id, campaign]))

    const safeLogs = recentLogs.map(sanitizeLogRecord)
    const workerRuns = groupWorkerRunLogs(safeLogs)
    const displayLogs = (logs: typeof recentLogs) => logs.map(sanitizeLogRecord).map(log => ({
        ...log,
        details: session.role === 'admin' ? log.details : null,
        createdAt: log.createdAt.toISOString(),
        campaign: log.campaignId
            ? (() => { const campaign = campaignMap.get(log.campaignId); return campaign ? { ...campaign, formatLabel: resolveFormatLabel(formatLabelMap, campaign.format) } : null })()
            : null,
    }))

    return (
        <WorkerLogsPanel
            generatedAt={new Date().toISOString()}
            batchMetrics={batchMetrics}
            queue={([...workerJobQueue, ...queue] as QueueRow[]).map(item => ({
                ...item,
                lastWorkerError: item.lastWorkerError ? sanitizeLogMessage(item.lastWorkerError) : null,
                formatLabel: resolveFormatLabel(formatLabelMap, item.format),
                updatedAt: serializeDate(item.updatedAt)!,
                lastCaptureAt: serializeDate(item.lastCaptureAt),
                processingStartedAt: serializeDate(item.processingStartedAt),
                processingHeartbeatAt: serializeDate(item.processingHeartbeatAt),
                lockedUntil: serializeDate(item.lockedUntil),
                latestCaptureAt: serializeDate(item.captures[0]?.createdAt),
                latestCaptureUrl: item.captures[0]?.screenshotPath || null,
                captures: undefined,
            }))}
            campaignStatusCounts={statusSource.map(item => ({
                status: item.status,
                count: item._count._all,
            }))}
            recentLogs={displayLogs(recentLogs)}
            recentErrors={displayLogs(recentErrors)}
            logLevelCounts={logLevelCounts.map(item => ({
                level: item.level,
                count: item._count._all,
            }))}
            captureStatusCounts={captureStatusCounts.map(item => ({
                status: item.status,
                count: item._count._all,
            }))}
            workerRuns={workerRuns.map(item => ({
                id: item.log.id,
                level: item.log.level,
                message: item.log.message,
                createdAt: item.log.createdAt.toISOString(),
                details: session.role === 'admin' ? item.details : null,
            }))}
            gamJobs={gamJobs.map(job => ({
                ...sanitizeLogRecord(job),
                details: session.role === 'admin' ? sanitizeLogRecord(job).details : null,
                createdAt: job.createdAt.toISOString(),
            }))}
        />
    )
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 })
}
