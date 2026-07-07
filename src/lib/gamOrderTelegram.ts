import prisma from './prisma'
import { sendTelegramAlert } from './telegram'
import { GAM_PENDING_LEVEL, GAM_REVIEW_LEVEL, GAM_RUNNING_LEVEL } from './gamJobStatus'
import type { GamImportDraft } from './gamImportPlanner'
import type { GamImportWriteResult } from './gamImportWriter'
import type { CaptureCadence } from './governmentReportScope'

const DEFAULT_REVIEW_REMINDER_MINUTES = 30
const MAX_REVIEW_REMINDERS_PER_RUN = 20
const MAX_JOB_EVENTS = 100

type GamOrderNotificationState = {
    reviewUrl?: string
    telegram?: boolean
    email?: boolean
    orderStartedTelegram?: boolean
    orderStartedTelegramAt?: string
    reviewReadyAt?: string
    reviewReminderCount?: number
    reviewReminderLastAt?: string
    reviewReminderTelegram?: boolean
}

type GamOrderNotificationDetails = Partial<GamImportDraft> & {
    orderUrl?: string
    orderId?: string
    mode?: string
    requestedPi?: string
    requestedSegmentation?: string
    requestedCaptureCadence?: CaptureCadence
    autoRegisterResult?: GamImportWriteResult
    notifications?: GamOrderNotificationState
    executionLogs?: Array<{ at: string; message: string; tone: 'info' | 'success' | 'error' }>
}

type NotifyReviewOptions = {
    jobId: string
    draft: GamImportDraft
    reviewUrl: string
    writeResult?: GamImportWriteResult
}

function readReviewReminderMinutes() {
    const parsed = Number.parseInt(process.env.GAM_REVIEW_REMINDER_MINUTES || '', 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REVIEW_REMINDER_MINUTES
    return Math.max(parsed, 5)
}

function appUrl() {
    return (process.env.NEXT_PUBLIC_APP_URL || 'https://adsnap-cloud.vercel.app').replace(/\/$/, '')
}

export function buildGamReviewUrl(jobId: string) {
    return `${appUrl()}/campaigns?jobId=${encodeURIComponent(jobId)}`
}

function readDetails(details: string | null): GamOrderNotificationDetails {
    const raw = details || ''
    if (!raw.trim().startsWith('{')) return { orderUrl: raw }

    try {
        return JSON.parse(raw) as GamOrderNotificationDetails
    } catch {
        return { orderUrl: raw }
    }
}

function appendEvent(details: GamOrderNotificationDetails, message: string, tone: 'info' | 'success' | 'error' = 'info') {
    return {
        ...details,
        executionLogs: [
            ...(details.executionLogs || []),
            { at: new Date().toISOString(), message, tone },
        ].slice(-MAX_JOB_EVENTS),
    }
}

function formatOrderDetails(details: GamOrderNotificationDetails) {
    const orderId = details.orderId || details.orderUrl?.match(/order_id=(\d+)/i)?.[1] || 'GAM'
    const pi = details.requestedPi || details.pi
    const client = details.client || 'Order GAM'
    return { orderId, pi, client }
}

export async function notifyGamOrderStarted(jobId: string) {
    const job = await prisma.nexusLog.findUnique({
        where: { id: jobId },
        select: { id: true, level: true, details: true },
    })
    if (!job || ![GAM_PENDING_LEVEL, GAM_RUNNING_LEVEL].includes(job.level)) return false

    const details = readDetails(job.details)
    if (details.notifications?.orderStartedTelegramAt) return true

    const { orderId, pi, client } = formatOrderDetails(details)
    const sent = await sendTelegramAlert(
        'Order GAM iniciada',
        `${client} entrou no fluxo do Nexus para leitura/cadastro no GAM.`,
        `Order ${orderId}${pi ? ` | PI ${pi}` : ''} | Job ${job.id}`,
        undefined,
        { label: 'Abrir fila Nexus', url: `${appUrl()}/nexus` },
        { dedupeKey: `gam-order-started:${job.id}` },
    )

    if (sent) {
        const nextDetails = appendEvent(
            {
                ...details,
                notifications: {
                    ...(details.notifications || {}),
                    orderStartedTelegram: true,
                    orderStartedTelegramAt: new Date().toISOString(),
                },
            },
            'Telegram avisou que a Order GAM foi iniciada',
            'success',
        )

        await prisma.nexusLog.updateMany({
            where: { id: job.id, level: { in: [GAM_PENDING_LEVEL, GAM_RUNNING_LEVEL] } },
            data: { details: JSON.stringify(nextDetails) },
        })
    }

    return sent
}

export async function notifyGamOrderReadyForReview(options: NotifyReviewOptions) {
    const { jobId, draft, reviewUrl, writeResult } = options
    return sendTelegramAlert(
        'Order pronta para revisao',
        writeResult
            ? `${draft.client} foi cadastrada automaticamente e precisa de conferencia.`
            : `${draft.client} esta pronta para conferencia antes do cadastro.`,
        writeResult
            ? `Order ${draft.orderId} | PI ${draft.pi} | ${writeResult.created} criada(s) | ${writeResult.skipped} existente(s) | ${writeResult.blocked} pendente(s)`
            : `Order ${draft.orderId} | PI ${draft.pi} | ${draft.mediaEntries.length} formato(s) | ${draft.blockedItems.length} bloqueado(s)`,
        undefined,
        { label: 'Abrir revisao', url: reviewUrl },
        { dedupeKey: `gam-order-ready:${jobId}` },
    )
}

export async function sendPendingGamReviewReminders(limit = MAX_REVIEW_REMINDERS_PER_RUN) {
    const reminderMinutes = readReviewReminderMinutes()
    const dueBefore = new Date(Date.now() - reminderMinutes * 60 * 1000)
    const jobs = await prisma.nexusLog.findMany({
        where: { level: GAM_REVIEW_LEVEL },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: { id: true, message: true, details: true, createdAt: true },
    })

    let sentCount = 0
    for (const job of jobs) {
        const details = readDetails(job.details)
        const notifications = details.notifications || {}
        const lastReminder = notifications.reviewReminderLastAt
            || notifications.reviewReadyAt
            || job.createdAt.toISOString()

        if (new Date(lastReminder) > dueBefore) continue

        const reviewUrl = notifications.reviewUrl || buildGamReviewUrl(job.id)
        const nextCount = (notifications.reviewReminderCount || 0) + 1
        const { orderId, pi, client } = formatOrderDetails(details)
        const sent = await sendTelegramAlert(
            'Revisao GAM pendente',
            `${client} ainda esta aguardando revisao operacional no Nexus.`,
            `Lembrete ${nextCount} | Order ${orderId}${pi ? ` | PI ${pi}` : ''} | aberta ha mais de ${reminderMinutes} min`,
            undefined,
            { label: 'Abrir revisao', url: reviewUrl },
            {
                dedupeMinutes: 0,
                dedupeKey: `gam-review-reminder:${job.id}:${nextCount}`,
            },
        )

        if (!sent) continue

        const nextDetails = appendEvent(
            {
                ...details,
                notifications: {
                    ...notifications,
                    reviewUrl,
                    reviewReminderTelegram: true,
                    reviewReminderCount: nextCount,
                    reviewReminderLastAt: new Date().toISOString(),
                },
            },
            `Telegram enviou lembrete de revisao pendente (${nextCount})`,
            'success',
        )

        const updated = await prisma.nexusLog.updateMany({
            where: { id: job.id, level: GAM_REVIEW_LEVEL },
            data: { details: JSON.stringify(nextDetails) },
        })
        sentCount += updated.count
    }

    return { checked: jobs.length, sent: sentCount, reminderMinutes }
}
