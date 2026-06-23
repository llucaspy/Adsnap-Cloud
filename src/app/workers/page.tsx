import prisma from '@/lib/prisma'
import { WorkerLogsPanel } from '@/components/WorkerLogsPanel'

export const dynamic = 'force-dynamic'

function parseRunDetails(details: string | null) {
    if (!details?.trim().startsWith('{')) return null
    try {
        return JSON.parse(details) as Record<string, unknown>
    } catch {
        return null
    }
}

function serializeDate(value: Date | null | undefined) {
    return value ? value.toISOString() : null
}

function readBatchSize() {
    const parsed = Number(process.env.NEXUS_CAPTURE_BATCH_SIZE)
    if (!Number.isFinite(parsed) || parsed <= 0) return 5
    return Math.min(Math.floor(parsed), 20)
}

function countStatus(items: { status: string; _count: { _all: number } }[], status: string) {
    return items.find(item => item.status === status)?._count._all || 0
}

function batchesFor(items: number, batchSize: number) {
    return items > 0 ? Math.ceil(items / batchSize) : 0
}

export default async function WorkersPage() {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
        queue,
        campaignStatusCounts,
        recentLogs,
        logLevelCounts,
        captureStatusCounts,
        gamJobs,
        processingRunGroups,
    ] = await Promise.all([
        prisma.campaign.findMany({
            where: {
                isArchived: false,
                status: { in: ['QUEUED', 'PROCESSING', 'AUTOCONFIG', 'FAILED', 'QUARANTINE'] },
            },
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
            where: { isArchived: false },
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
            where: { level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW', 'JOB_GAM_ERROR', 'JOB_GAM_CANCELLED'] } },
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
    ])

    const batchSize = readBatchSize()
    const waitingItems = countStatus(campaignStatusCounts, 'QUEUED') + countStatus(campaignStatusCounts, 'AUTOCONFIG')
    const runningItems = countStatus(campaignStatusCounts, 'PROCESSING')
    const errorItems = countStatus(campaignStatusCounts, 'FAILED') + countStatus(campaignStatusCounts, 'QUARANTINE')
    const waitingBatches = batchesFor(waitingItems, batchSize)
    const runningBatches = processingRunGroups.length > 0 ? processingRunGroups.length : batchesFor(runningItems, batchSize)
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

    const campaignIds = [...new Set(recentLogs.map(log => log.campaignId).filter(Boolean))] as string[]
    const campaignsById = campaignIds.length > 0
        ? await prisma.campaign.findMany({
            where: { id: { in: campaignIds } },
            select: { id: true, pi: true, client: true, format: true, status: true },
        })
        : []
    const campaignMap = new Map(campaignsById.map(campaign => [campaign.id, campaign]))

    const workerRuns = recentLogs
        .map(log => ({ log, details: parseRunDetails(log.details) }))
        .filter(item => item.details?.runId || item.log.message.includes('Nexus Worker: Ciclo'))
        .slice(0, 10)

    return (
        <WorkerLogsPanel
            generatedAt={new Date().toISOString()}
            batchMetrics={batchMetrics}
            queue={queue.map(item => ({
                ...item,
                updatedAt: serializeDate(item.updatedAt)!,
                lastCaptureAt: serializeDate(item.lastCaptureAt),
                processingStartedAt: serializeDate(item.processingStartedAt),
                processingHeartbeatAt: serializeDate(item.processingHeartbeatAt),
                lockedUntil: serializeDate(item.lockedUntil),
                latestCaptureAt: serializeDate(item.captures[0]?.createdAt),
                latestCaptureUrl: item.captures[0]?.screenshotPath || null,
                captures: undefined,
            }))}
            campaignStatusCounts={campaignStatusCounts.map(item => ({
                status: item.status,
                count: item._count._all,
            }))}
            recentLogs={recentLogs.map(log => ({
                ...log,
                details: log.details,
                createdAt: log.createdAt.toISOString(),
                campaign: log.campaignId ? campaignMap.get(log.campaignId) || null : null,
            }))}
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
                details: item.details,
            }))}
            gamJobs={gamJobs.map(job => ({
                ...job,
                createdAt: job.createdAt.toISOString(),
            }))}
        />
    )
}
