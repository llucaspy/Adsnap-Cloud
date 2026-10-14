import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { sanitizeLogMessage, sanitizeLogRecord } from '@/lib/logRedaction'
import { WorkerJobDetail } from '@/components/WorkerJobDetail'

export const dynamic = 'force-dynamic'

export default async function LegacyWorkerPage({ params }: { params: Promise<{ id: string }> }) {
    const session = await requireAuth()
    const { id } = await params
    const campaign = await prisma.campaign.findUnique({ where: { id } })
    if (!campaign) notFound()
    const [labels, logs] = await Promise.all([
        getFormatLabelMap(),
        prisma.nexusLog.findMany({ where: { campaignId: id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, select: { id: true, level: true, message: true, details: true, createdAt: true } }),
    ])
    return <WorkerJobDetail item={{
        id: campaign.id, campaignId: campaign.id, campaignName: campaign.campaignName, client: campaign.client,
        pi: campaign.pi, device: campaign.device, formatLabel: resolveFormatLabel(labels, campaign.format),
        status: campaign.status, campaignStatus: campaign.status, runId: campaign.processingRunId,
        attempts: campaign.processingAttempts, maxAttempts: null, scheduledFor: null,
        startedAt: campaign.processingStartedAt?.toISOString() || null, finishedAt: null,
        lockedUntil: campaign.lockedUntil?.toISOString() || null,
        lastError: campaign.lastWorkerError ? sanitizeLogMessage(campaign.lastWorkerError) : null,
        isLegacy: true, logs: logs.map(sanitizeLogRecord).map(log => ({ ...log, details: session.role === 'admin' ? log.details || null : null, createdAt: log.createdAt.toISOString() })),
    }} />
}
