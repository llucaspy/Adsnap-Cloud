import prisma from './prisma'
import { sendTelegramAlert } from './telegram'
import { describeCaptureFailure } from './captureFailure'
import { sanitizeLogMessage } from './logRedaction'

const INCIDENT_MESSAGE = 'Nexus: ocorrência de captura'
const PENDING = 'CAPTURE_ALERT_PENDING'
const SENT = 'CAPTURE_ALERT_SENT'

/** Durable notification record. Its deterministic ID prevents repeated alerts per job.
 * Reconciled from terminal jobs so a crash after the failure commit cannot lose the alert. */
export async function reconcileCaptureIncidents() {
    const missing = await prisma.$queryRaw<{ id: string }[]>`
        select j.id from "WorkerJob" j
        join "Campaign" c on c.id = j."campaignId"
        where j.type = 'CAPTURE' and j.status = 'FAILED'
          and j."finishedAt" >= (now() at time zone 'UTC') - interval '7 days'
          and not exists (select 1 from "NexusLog" n where n.id = 'capture-incident-' || j.id)
        order by j."finishedAt" desc limit 20
    `
    for (const { id } of missing) {
        const job = await prisma.workerJob.findUnique({ where: { id }, include: { campaign: true } })
        if (!job?.campaign || job.status !== 'FAILED') continue
        const campaign = job.campaign
        const diagnosis = describeCaptureFailure(job.lastError || campaign.lastWorkerError)
        const data = { jobId: id, campaignId: campaign.id, client: sanitizeLogMessage(campaign.client).slice(0, 160),
            pi: sanitizeLogMessage(campaign.pi).slice(0, 80), campaignName: sanitizeLogMessage(campaign.campaignName).slice(0, 160),
            format: sanitizeLogMessage(campaign.format).slice(0, 120), device: sanitizeLogMessage(campaign.device).slice(0, 40),
            attempts: job.attempts, maxAttempts: job.maxAttempts, error: diagnosis.reason.slice(0, 700),
            category: diagnosis.category, occurredAt: job.finishedAt?.toISOString(),
            status: campaign.status === 'QUARANTINE' ? 'QUARANTINE' : 'FAILED' }
        await prisma.nexusLog.upsert({ where: { id: `capture-incident-${id}` }, update: {},
            create: { id: `capture-incident-${id}`, level: PENDING, message: INCIDENT_MESSAGE,
                campaignId: campaign.id, details: JSON.stringify(data) } })
    }
}

/** Bounded sends, with failures left pending for the next worker cycle. */
export async function dispatchCaptureIncidentAlerts() {
    const deadlineAt = Date.now() + 40_000
    const settings = await prisma.settings.findUnique({ where: { id: 1 }, select: { telegramAlertsEnabled: true } })
    if (settings?.telegramAlertsEnabled === false) return
    const pending = await prisma.nexusLog.findMany({ where: { level: PENDING, message: INCIDENT_MESSAGE },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 5 })
    for (const incident of pending) {
        if (Date.now() + 20_000 > deadlineAt) break
        let data
        try { data = JSON.parse(incident.details || '') } catch { continue }
        if (typeof data.jobId !== 'string') continue
        const base = new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://adsnap-cloud.vercel.app')
        if (base.protocol !== 'https:') throw new Error('O link do diagnóstico exige HTTPS')
        const url = new URL(`/quarantine/${encodeURIComponent(data.jobId)}`, base.origin).toString()
        const sent = await sendTelegramAlert(
            data.status === 'QUARANTINE' ? 'Captura em quarentena' : 'Captura falhou após as tentativas',
            `${data.client} · PI ${data.pi}\n${data.campaignName}\n${data.format} · ${data.device}\nTentativas: ${data.attempts}/${data.maxAttempts}`,
            `${data.category}: ${data.error}\nOcorrência: ${data.occurredAt || 'horário indisponível'}`,
            incident.campaignId || undefined, { label: 'Analisar captura', url },
            { dedupeKey: incident.id, dedupeMinutes: 7 * 24 * 60 },
        )
        if (sent) await prisma.nexusLog.updateMany({ where: { id: incident.id, level: PENDING }, data: { level: SENT } })
    }
}
