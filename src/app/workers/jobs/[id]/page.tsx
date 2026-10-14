import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { sanitizeLogMessage, sanitizeLogRecord } from '@/lib/logRedaction'
import { WorkerJobDetail } from '@/components/WorkerJobDetail'

export const dynamic = 'force-dynamic'

export default async function WorkerJobPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth()
    const { id } = await params
    const job = await prisma.workerJob.findUnique({ where: { id }, include: { campaign: true } })
    if (!job?.campaign || job.type !== 'CAPTURE') notFound()
    const campaign = job.campaign
    const logs = await prisma.nexusLog.findMany({
        where: { campaignId: campaign.id, createdAt: { gte: job.createdAt, ...(job.finishedAt ? { lte: job.finishedAt } : {}) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100,
        select: { id: true, level: true, message: true, details: true, createdAt: true },
    })
    const labels = await getFormatLabelMap()
    return <WorkerJobDetail item={{
        id: job.id, campaignId: campaign.id, campaignName: campaign.campaignName, client: campaign.client,
        pi: campaign.pi, device: campaign.device, formatLabel: resolveFormatLabel(labels, campaign.format),
        status: job.status, campaignStatus: campaign.status, runId: job.runId,
        attempts: job.attempts, maxAttempts: job.maxAttempts,
        scheduledFor: job.scheduledFor.toISOString(), startedAt: job.startedAt?.toISOString() || null,
        finishedAt: job.finishedAt?.toISOString() || null, lockedUntil: job.lockedUntil?.toISOString() || null,
        lastError: job.lastError ? sanitizeLogMessage(job.lastError) : null, isLegacy: false,
        logs: logs.map(sanitizeLogRecord).map(log => ({ ...log, details: session.role === 'admin' ? log.details || null : null, createdAt: log.createdAt.toISOString() })),
    }} />
}
