import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireAuth } from '@/lib/auth'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { sanitizeLogMessage, sanitizeLogRecord } from '@/lib/logRedaction'
import { WorkerJobDetail } from '@/components/WorkerJobDetail'
import { CAPTURE_ATTEMPT_EVENT, readCaptureAttempt } from '@/lib/captureFailure'

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
    const attemptLogs = await prisma.nexusLog.findMany({
        where: { campaignId: campaign.id, message: CAPTURE_ATTEMPT_EVENT, details: { contains: JSON.stringify(job.id) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50,
    })
    const attempts = attemptLogs.flatMap(log => {
        const event = readCaptureAttempt(log.details, job.id)
        return event ? [{ ...event, at: log.createdAt.toISOString() }] : []
    })
    let pageAddress = 'Endereço indisponível'
    try { const url = new URL(campaign.url); pageAddress = `${url.origin}${url.pathname}` } catch { /* Never expose preview credentials. */ }
    const notification = await prisma.nexusLog.findUnique({ where: { id: `capture-incident-${job.id}` }, select: { level: true } })
    return <WorkerJobDetail item={{
        id: job.id, campaignId: campaign.id, campaignName: campaign.campaignName, client: campaign.client,
        pi: campaign.pi, device: campaign.device, formatLabel: resolveFormatLabel(labels, campaign.format),
        status: job.status, campaignStatus: campaign.status, runId: job.runId,
        attempts: job.attempts, maxAttempts: job.maxAttempts,
        scheduledFor: job.scheduledFor.toISOString(), startedAt: job.startedAt?.toISOString() || null,
        finishedAt: job.finishedAt?.toISOString() || null, lockedUntil: job.lockedUntil?.toISOString() || null,
        lastError: job.lastError ? sanitizeLogMessage(job.lastError) : null, isLegacy: false,
        attemptEvents: attempts, pageAddress, captureDelaySeconds: campaign.captureDelaySeconds,
        canRetry: session.role === 'admin' && job.status === 'FAILED' && !campaign.isArchived && ['FAILED', 'QUARANTINE'].includes(campaign.status),
        telegramStatus: notification?.level === 'CAPTURE_ALERT_SENT' ? 'Envio confirmado pelo Telegram' : notification?.level === 'CAPTURE_ALERT_PENDING' ? 'Pendente de envio pelo worker (confira se os alertas estão habilitados)' : 'Sem registro de notificação para esta tarefa',
        logs: logs.map(sanitizeLogRecord).map(log => ({ ...log, details: session.role === 'admin' ? log.details || null : null, createdAt: log.createdAt.toISOString() })),
    }} />
}
