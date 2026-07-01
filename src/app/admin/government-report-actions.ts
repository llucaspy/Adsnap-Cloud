'use server'

import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { nexusLogStore } from '@/lib/nexusLogStore'
import { revalidatePath } from 'next/cache'
import { sendCampaignReport } from '@/lib/emailService'
import {
    campaignReportScopeKey,
    dailyReportScopeKey,
    getBrasiliaDayRange,
} from '@/lib/governmentReportScope'

const FEDERAL_SEGMENTATION = 'GOV_FEDERAL'
const DEFAULT_RECIPIENTS = [
    'opec.gov@metropoles.com',
    'karoliny.sousa@metropoles.com',
]
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function parseRecipients(value: string | null | undefined) {
    try {
        const parsed = JSON.parse(value || '[]')
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : DEFAULT_RECIPIENTS
    } catch {
        return DEFAULT_RECIPIENTS
    }
}

function normalizeRecipients(recipients: string[]) {
    const unique = new Map<string, string>()
    for (const recipient of recipients) {
        const clean = recipient.trim()
        if (!clean) continue
        if (!EMAIL_PATTERN.test(clean)) throw new Error(`E-mail invalido: ${clean}`)
        unique.set(clean.toLowerCase(), clean)
    }

    const normalized = Array.from(unique.values())
    if (normalized.length === 0) throw new Error('Informe pelo menos um destinatario')
    return normalized
}

async function getOrCreateSettings() {
    return prisma.settings.upsert({
        where: { id: 1 },
        create: { id: 1 },
        update: {},
    })
}

export async function getGovernmentReportDashboard() {
    await requireAdmin()

    const [settings, campaigns] = await Promise.all([
        getOrCreateSettings(),
        prisma.campaign.findMany({
            where: {
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
                flightEnd: { not: null },
            },
            select: {
                id: true,
                pi: true,
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                flightStart: true,
                flightEnd: true,
            },
            orderBy: { flightEnd: 'desc' },
        }),
    ])

    const campaignIds = campaigns.map(campaign => campaign.id)
    const piValues = Array.from(new Set(campaigns.map(campaign => campaign.pi)))
    const [captureCounts, dispatches] = await Promise.all([
        campaignIds.length > 0
            ? prisma.capture.groupBy({
                by: ['campaignId'],
                where: {
                    campaignId: { in: campaignIds },
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                },
                _count: { id: true },
            })
            : Promise.resolve([]),
        piValues.length > 0
            ? prisma.emailDispatch.findMany({
                where: { pi: { in: piValues }, flightEnd: { not: null }, reportScope: 'CAMPAIGN' },
                orderBy: { updatedAt: 'desc' },
            })
            : Promise.resolve([]),
    ])

    const capturesByCampaign = new Map(captureCounts.map(item => [item.campaignId, item._count.id]))
    const dispatchByKey = new Map<string, (typeof dispatches)[number]>()
    for (const dispatch of dispatches) {
        const key = `${dispatch.pi}|${dispatch.flightEnd?.toISOString()}`
        if (!dispatchByKey.has(key)) dispatchByKey.set(key, dispatch)
    }

    const grouped = new Map<string, typeof campaigns>()
    for (const campaign of campaigns) {
        const current = grouped.get(campaign.pi) || []
        current.push(campaign)
        grouped.set(campaign.pi, current)
    }

    const reportCampaigns = Array.from(grouped.entries()).map(([pi, items]) => {
        const flightEnd = items.reduce((latest, item) =>
            !latest || (item.flightEnd && item.flightEnd > latest) ? item.flightEnd : latest, null as Date | null)
        const flightStart = items.reduce((earliest, item) =>
            !earliest || (item.flightStart && item.flightStart < earliest) ? item.flightStart : earliest, null as Date | null)
        const dispatch = flightEnd ? dispatchByKey.get(`${pi}|${flightEnd.toISOString()}`) : null
        const first = items[0]

        return {
            pi,
            client: first.client,
            agency: first.agency,
            campaignName: first.campaignName,
            flightStart: flightStart?.toISOString() || null,
            flightEnd: flightEnd?.toISOString() || null,
            formats: Array.from(new Set(items.map(item => item.format))),
            printCount: items.reduce((total, item) => total + (capturesByCampaign.get(item.id) || 0), 0),
            dispatch: dispatch ? {
                id: dispatch.id,
                status: dispatch.status,
                triggerMode: dispatch.triggerMode,
                lastSentAt: dispatch.lastSentAt?.toISOString() || null,
                errorMessage: dispatch.errorMessage,
                attachmentCount: dispatch.attachmentCount,
                attachmentBytes: dispatch.attachmentBytes,
                attempts: dispatch.attempts,
            } : null,
        }
    }).sort((a, b) => (b.flightEnd || '').localeCompare(a.flightEnd || ''))

    return {
        settings: {
            recipients: parseRecipients(settings.governmentReportRecipients),
            autoSend: Boolean(settings.governmentReportAutoSend),
            dispatchTime: settings.governmentReportTime || '09:00',
        },
        campaigns: reportCampaigns,
    }
}

export async function updateGovernmentReportSettings(data: {
    recipients: string[]
    autoSend: boolean
    dispatchTime: string
}) {
    await requireAdmin()
    const recipients = normalizeRecipients(data.recipients)
    if (!TIME_PATTERN.test(data.dispatchTime)) throw new Error('Horario invalido')

    const current = await getOrCreateSettings()
    const enablingAutomation = data.autoSend && !current.governmentReportAutoSend

    await prisma.settings.update({
        where: { id: 1 },
        data: {
            governmentReportRecipients: JSON.stringify(recipients),
            governmentReportAutoSend: Boolean(data.autoSend),
            governmentReportTime: data.dispatchTime,
            ...(enablingAutomation ? { governmentReportAutoSince: new Date() } : {}),
        },
    })

    await nexusLogStore.addLog(
        `Relatorio Governo Federal: configuracao atualizada (${data.autoSend ? 'automatico' : 'manual'})`,
        'SYSTEM',
        `Destinatarios: ${recipients.join(', ')}`,
    )
    revalidatePath('/admin')
    return { success: true, recipients }
}

export async function queueGovernmentReportManual(pi: string) {
    await requireAdmin()
    const cleanPi = pi.trim()
    if (!cleanPi) return { success: false, error: 'PI obrigatoria' }

    const [settings, campaigns] = await Promise.all([
        getOrCreateSettings(),
        prisma.campaign.findMany({
            where: {
                pi: cleanPi,
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
                flightEnd: { not: null },
            },
            select: { id: true, flightEnd: true },
        }),
    ])

    if (campaigns.length === 0) {
        return { success: false, error: 'Esta PI nao e uma campanha elegivel de Governo Federal' }
    }

    const recipients = normalizeRecipients(parseRecipients(settings.governmentReportRecipients))
    const flightEnd = campaigns.reduce((latest, campaign) =>
        !latest || (campaign.flightEnd && campaign.flightEnd > latest) ? campaign.flightEnd : latest, null as Date | null)
    if (!flightEnd) return { success: false, error: 'Campanha sem data final' }
    const scopeKey = campaignReportScopeKey(cleanPi, flightEnd)

    const existing = await prisma.emailDispatch.findUnique({
        where: { scopeKey },
    })

    if (existing?.status === 'PROCESSING') {
        return { success: true, queued: true, message: 'O relatorio ja esta sendo enviado' }
    }

    let dispatchId: string
    if (existing) {
        const dispatch = await prisma.emailDispatch.update({
            where: { id: existing.id },
            data: {
                recipients: JSON.stringify(recipients),
                scopeKey,
                reportScope: 'CAMPAIGN',
                dispatchTime: settings.governmentReportTime || '09:00',
                triggerMode: 'MANUAL',
                status: 'PROCESSING',
                isActive: true,
                errorMessage: null,
                emailMessageId: null,
                attachmentCount: 0,
                attachmentBytes: 0,
                attempts: { increment: 1 },
                sendVersion: { increment: 1 },
            },
        })
        dispatchId = dispatch.id
    } else {
        const dispatch = await prisma.emailDispatch.create({
            data: {
                pi: cleanPi,
                flightEnd,
                scopeKey,
                reportScope: 'CAMPAIGN',
                recipients: JSON.stringify(recipients),
                dispatchTime: settings.governmentReportTime || '09:00',
                triggerMode: 'MANUAL',
                status: 'PROCESSING',
                isActive: true,
                attempts: 1,
            },
        })
        dispatchId = dispatch.id
    }

    await nexusLogStore.addLog(`Relatorio Governo Federal: PI ${cleanPi} envio manual iniciado`, 'SYSTEM')
    const result = await sendCampaignReport({
        pi: cleanPi,
        recipients,
        dispatchId,
        reportDate: null,
    })
    revalidatePath('/admin')
    revalidatePath(`/books/${cleanPi}`)

    if (!result.success) return { success: false, error: result.error || 'Falha ao enviar relatorio' }

    return { success: true, sent: true, message: 'Relatorio enviado por e-mail' }
}

export async function queueGovernmentBookDayEmail(pi: string, dateKey: string) {
    await requireAdmin()
    const cleanPi = pi.trim()
    if (!cleanPi) return { success: false, error: 'PI obrigatoria' }

    const dayRange = getBrasiliaDayRange(dateKey)
    const [settings, campaigns] = await Promise.all([
        getOrCreateSettings(),
        prisma.campaign.findMany({
            where: {
                pi: cleanPi,
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
            },
            select: { id: true, flightEnd: true },
        }),
    ])

    if (campaigns.length === 0) {
        return { success: false, error: 'Este Book nao pertence a uma campanha de Governo Federal' }
    }

    const printCount = await prisma.capture.count({
        where: {
            campaignId: { in: campaigns.map(campaign => campaign.id) },
            status: 'SUCCESS',
            screenshotPath: { not: '' },
            createdAt: { gte: dayRange.start, lte: dayRange.end },
        },
    })
    if (printCount === 0) return { success: false, error: 'Este Book nao possui prints validos nesse dia' }

    const recipients = normalizeRecipients(parseRecipients(settings.governmentReportRecipients))
    const flightEnd = campaigns.reduce((latest, campaign) =>
        !latest || (campaign.flightEnd && campaign.flightEnd > latest) ? campaign.flightEnd : latest,
    null as Date | null)
    if (!flightEnd) return { success: false, error: 'Campanha sem data final' }

    const scopeKey = dailyReportScopeKey(cleanPi, dateKey)
    const existing = await prisma.emailDispatch.findUnique({ where: { scopeKey } })
    if (existing?.status === 'PROCESSING') {
        return { success: true, queued: true, message: 'Os prints deste dia ja estao sendo enviados' }
    }

    let dispatchId: string
    if (existing) {
        const dispatch = await prisma.emailDispatch.update({
            where: { id: existing.id },
            data: {
                recipients: JSON.stringify(recipients),
                triggerMode: 'MANUAL_DAY',
                status: 'PROCESSING',
                isActive: true,
                errorMessage: null,
                emailMessageId: null,
                attachmentCount: 0,
                attachmentBytes: 0,
                attempts: { increment: 1 },
                sendVersion: { increment: 1 },
                flightEnd,
                reportDate: dayRange.start,
                reportScope: 'DAY',
                scopeKey,
            },
        })
        dispatchId = dispatch.id
    } else {
        const dispatch = await prisma.emailDispatch.create({
            data: {
                pi: cleanPi,
                flightEnd,
                reportDate: dayRange.start,
                reportScope: 'DAY',
                scopeKey,
                recipients: JSON.stringify(recipients),
                dispatchTime: '08:00',
                triggerMode: 'MANUAL_DAY',
                status: 'PROCESSING',
                isActive: true,
                attempts: 1,
            },
        })
        dispatchId = dispatch.id
    }

    await nexusLogStore.addLog(`Relatorio Governo Federal: PI ${cleanPi}, dia ${dateKey}, envio manual iniciado`, 'SYSTEM')
    const result = await sendCampaignReport({
        pi: cleanPi,
        recipients,
        dispatchId,
        reportDate: dateKey,
    })
    revalidatePath(`/books/${cleanPi}`)
    revalidatePath(`/books/${cleanPi}?date=${dateKey}`)

    if (!result.success) return { success: false, error: result.error || 'Falha ao enviar prints do dia' }

    return { success: true, sent: true, message: 'Prints do dia enviados por e-mail' }
}
