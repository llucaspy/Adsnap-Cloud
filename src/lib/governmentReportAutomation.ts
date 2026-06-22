import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'
import { sendCampaignReport } from './emailService'
import { getCampaignDateKey } from './campaignSchedule'
import {
    campaignReportScopeKey,
    dailyReportScopeKey,
    getBrasiliaDayRange,
} from './governmentReportScope'

const FEDERAL_SEGMENTATION = 'GOV_FEDERAL'
const MAX_AUTOMATIC_ATTEMPTS = 3
const REPORTS_PER_CYCLE = 3
const DAILY_REPORT_TIME = '08:00'

function parseRecipients(value: string | null | undefined): string[] {
    try {
        const recipients = JSON.parse(value || '[]')
        return Array.isArray(recipients) ? recipients.filter(item => typeof item === 'string' && item.includes('@')) : []
    } catch {
        return []
    }
}

function getBrtDateKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

function getBrtTime(date: Date) {
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    }).format(date)
}

export function isGovernmentReportDue(now: Date, flightEnd: Date, dispatchTime: string) {
    const today = getBrtDateKey(now)
    const finalDay = getCampaignDateKey(flightEnd)
    return today > finalDay && getBrtTime(now) >= dispatchTime
}

async function queueDueAutomaticReports(now: Date) {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings?.governmentReportAutoSend) return 0

    const recipients = parseRecipients(settings.governmentReportRecipients)
    if (recipients.length === 0) {
        await nexusLogStore.addLog('Relatorio Governo Federal: envio automatico sem destinatarios configurados', 'ERROR')
        return 0
    }

    const campaigns = await prisma.campaign.findMany({
        where: {
            segmentation: FEDERAL_SEGMENTATION,
            captureCadence: 'BOUNDARY',
            isArchived: false,
            flightEnd: { not: null, lt: now },
            ...(settings.governmentReportAutoSince
                ? { flightEnd: { not: null, lt: now, gte: settings.governmentReportAutoSince } }
                : {}),
        },
        select: { pi: true, flightEnd: true },
    })

    const finalDateByPi = new Map<string, Date>()
    for (const campaign of campaigns) {
        if (!campaign.pi || !campaign.flightEnd) continue
        const current = finalDateByPi.get(campaign.pi)
        if (!current || campaign.flightEnd > current) finalDateByPi.set(campaign.pi, campaign.flightEnd)
    }

    let queued = 0
    for (const [pi, flightEnd] of finalDateByPi) {
        if (!isGovernmentReportDue(now, flightEnd, settings.governmentReportTime || '09:00')) continue
        const scopeKey = campaignReportScopeKey(pi, flightEnd)

        const dispatch = await prisma.emailDispatch.upsert({
            where: { scopeKey },
            create: {
                pi,
                flightEnd,
                scopeKey,
                reportScope: 'CAMPAIGN',
                recipients: JSON.stringify(recipients),
                dispatchTime: settings.governmentReportTime || '09:00',
                triggerMode: 'AUTO',
                status: 'QUEUED_AUTO',
                isActive: true,
            },
            update: {
                recipients: JSON.stringify(recipients),
                dispatchTime: settings.governmentReportTime || '09:00',
                isActive: true,
            },
        })

        if (dispatch.status === 'QUEUED_AUTO') {
            queued += 1
            continue
        }

        if (dispatch.status === 'FAILED' && dispatch.triggerMode === 'AUTO' && dispatch.attempts < MAX_AUTOMATIC_ATTEMPTS) {
            const retry = await prisma.emailDispatch.updateMany({
                where: { id: dispatch.id, status: 'FAILED', attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } },
                data: { status: 'QUEUED_AUTO', errorMessage: null },
            })
            queued += retry.count
        }
    }

    return queued
}

async function queueDueDailyReports(now: Date) {
    const settings = await prisma.settings.findUnique({ where: { id: 1 } })
    if (!settings || getBrtTime(now) < DAILY_REPORT_TIME) return 0

    const recipients = parseRecipients(settings.governmentReportRecipients)
    if (recipients.length === 0) return 0

    const today = getBrtDateKey(now)
    const campaigns = await prisma.campaign.findMany({
        where: {
            segmentation: FEDERAL_SEGMENTATION,
            captureCadence: 'DAILY',
            isScheduled: true,
            isArchived: false,
            flightStart: { not: null },
            flightEnd: { not: null },
        },
        select: { id: true, pi: true, flightStart: true, flightEnd: true },
    })

    const activeByPi = new Map<string, typeof campaigns>()
    for (const campaign of campaigns) {
        if (!campaign.pi || !campaign.flightStart || !campaign.flightEnd) continue
        const startKey = getCampaignDateKey(campaign.flightStart)
        const endKey = getCampaignDateKey(campaign.flightEnd)
        if (today < startKey || today > endKey) continue
        activeByPi.set(campaign.pi, [...(activeByPi.get(campaign.pi) || []), campaign])
    }

    const dayRange = getBrasiliaDayRange(today)
    let queued = 0
    for (const [pi, piCampaigns] of activeByPi) {
        const campaignIds = piCampaigns.map(campaign => campaign.id)
        const captures = await prisma.capture.findMany({
            where: {
                campaignId: { in: campaignIds },
                status: 'SUCCESS',
                screenshotPath: { not: '' },
                createdAt: { gte: dayRange.start, lte: dayRange.end },
            },
            select: { campaignId: true },
            distinct: ['campaignId'],
        })

        const capturedIds = new Set(captures.map(capture => capture.campaignId))
        const missingIds = campaignIds.filter(id => !capturedIds.has(id))
        if (missingIds.length > 0) {
            const recovered = await prisma.campaign.updateMany({
                where: {
                    id: { in: missingIds },
                    status: { notIn: ['QUEUED', 'PROCESSING'] },
                },
                data: { status: 'QUEUED' },
            })
            if (recovered.count > 0) {
                await nexusLogStore.addLog(
                    `Relatorio diario: ${recovered.count} formato(s) faltante(s) da PI ${pi} reenfileirado(s)`,
                    'SYSTEM',
                )
            }
            continue
        }

        const flightEnd = piCampaigns.reduce((latest, campaign) =>
            !latest || (campaign.flightEnd && campaign.flightEnd > latest) ? campaign.flightEnd : latest,
        null as Date | null)
        if (!flightEnd) continue

        const scopeKey = dailyReportScopeKey(pi, today)
        const existing = await prisma.emailDispatch.findUnique({ where: { scopeKey } })
        if (existing?.status === 'SENT' || existing?.status === 'PROCESSING' || existing?.status === 'QUEUED_AUTO') continue

        if (existing) {
            if (existing.status !== 'FAILED' || existing.attempts >= MAX_AUTOMATIC_ATTEMPTS) continue
            const retry = await prisma.emailDispatch.updateMany({
                where: { id: existing.id, status: 'FAILED', attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } },
                data: { status: 'QUEUED_AUTO', errorMessage: null },
            })
            queued += retry.count
            continue
        }

        await prisma.emailDispatch.create({
            data: {
                pi,
                flightEnd,
                reportDate: dayRange.start,
                reportScope: 'DAY',
                scopeKey,
                recipients: JSON.stringify(recipients),
                dispatchTime: DAILY_REPORT_TIME,
                triggerMode: 'AUTO_DAILY',
                status: 'QUEUED_AUTO',
                isActive: true,
            },
        })
        queued += 1
    }

    return queued
}

async function recoverStaleReports() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    const stale = await prisma.emailDispatch.updateMany({
        where: {
            status: 'PROCESSING',
            updatedAt: { lt: oneHourAgo },
            flightEnd: { not: null },
        },
        data: {
            status: 'FAILED',
            errorMessage: 'Worker interrompido durante o envio',
        },
    })

    if (stale.count > 0) {
        await nexusLogStore.addLog(`Relatorio Governo Federal: ${stale.count} envio(s) travado(s) liberado(s)`, 'SYSTEM')
    }
}

export async function processGovernmentReportQueue(now = new Date()) {
    await recoverStaleReports()
    const automaticQueued = await queueDueAutomaticReports(now)
    const dailyQueued = await queueDueDailyReports(now)

    const reports = await prisma.emailDispatch.findMany({
        where: {
            status: { in: ['QUEUED_MANUAL', 'QUEUED_AUTO'] },
            isActive: true,
            flightEnd: { not: null },
        },
        orderBy: [{ triggerMode: 'asc' }, { updatedAt: 'asc' }],
        take: REPORTS_PER_CYCLE,
    })

    let processed = 0
    for (const report of reports) {
        const claim = await prisma.emailDispatch.updateMany({
            where: {
                id: report.id,
                status: { in: ['QUEUED_MANUAL', 'QUEUED_AUTO'] },
            },
            data: {
                status: 'PROCESSING',
                attempts: { increment: 1 },
                errorMessage: null,
            },
        })

        if (claim.count === 0) continue

        const federalCampaign = await prisma.campaign.findFirst({
            where: { pi: report.pi, segmentation: FEDERAL_SEGMENTATION, isArchived: false },
            select: { id: true },
        })

        if (!federalCampaign) {
            await prisma.emailDispatch.update({
                where: { id: report.id },
                data: { status: 'FAILED', errorMessage: 'PI nao elegivel: campanha nao e Governo Federal' },
            })
            continue
        }

        const recipients = parseRecipients(report.recipients)
        if (recipients.length === 0) {
            await prisma.emailDispatch.update({
                where: { id: report.id },
                data: { status: 'FAILED', errorMessage: 'Nenhum destinatario valido' },
            })
            continue
        }

        await sendCampaignReport({
            pi: report.pi,
            recipients,
            dispatchId: report.id,
            reportDate: report.reportScope === 'DAY' && report.reportDate
                ? getBrtDateKey(report.reportDate)
                : null,
        })
        processed += 1
    }

    if (automaticQueued > 0 || dailyQueued > 0 || processed > 0) {
        console.log(`[Government Report] ${automaticQueued} final(is), ${dailyQueued} diario(s) enfileirado(s), ${processed} processado(s).`)
    }

    return { automaticQueued, dailyQueued, processed }
}
