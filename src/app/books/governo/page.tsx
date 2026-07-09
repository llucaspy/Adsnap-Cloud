import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FederalBooksWorkspace, type FederalBooksWorkspaceData } from '@/components/FederalBooksWorkspace'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { getSession } from '@/lib/auth'

export const revalidate = 30

const FEDERAL_SEGMENTATION = 'GOV_FEDERAL'
const DEFAULT_RECIPIENTS = [
    'opec.gov@metropoles.com',
    'karoliny.sousa@metropoles.com',
]
const ACTIVE_STATUS_BLOCKLIST = ['EXPIRED', 'FINISHED', 'FAILED', 'QUARANTINE']

type BookCapture = Prisma.CaptureGetPayload<{
    select: {
        id: true
        createdAt: true
        screenshotPath: true
        campaign: {
            select: {
                pi: true
                client: true
                campaignName: true
            }
        }
    }
}>

type TimelineDayDraft = {
    date: Date
    dateKey: string
    weekDay: string
    fullDate: string
    dayNumber: string
    monthLabel: string
    piGroups: Record<string, {
        pi: string
        client: string
        campaignName: string
        captureCount: number
        thumbnailId: string
    }>
}

type ActiveCampaignRow = {
    id: string
    pi: string
    client: string
    agency: string
    campaignName: string
    format: string
    device: string
    status: string
    flightStart: Date | null
    flightEnd: Date | null
}

function parseRecipients(value: string | null | undefined) {
    try {
        const parsed = JSON.parse(value || '[]')
        return Array.isArray(parsed)
            ? parsed.filter(item => typeof item === 'string' && item.trim())
            : DEFAULT_RECIPIENTS
    } catch {
        return DEFAULT_RECIPIENTS
    }
}

function dispatchKey(pi: string, flightEnd: Date | null) {
    return flightEnd ? `${pi}|${flightEnd.toISOString()}` : ''
}

function groupTimeline(captures: BookCapture[]) {
    const groupedCaptures = captures.reduce<Record<string, TimelineDayDraft>>((acc, capture) => {
        const brtTime = new Date(capture.createdAt.getTime() - (3 * 60 * 60 * 1000))
        const dateKey = brtTime.toISOString().split('T')[0]

        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: brtTime,
                dateKey,
                weekDay: format(brtTime, 'EEEE', { locale: ptBR }),
                fullDate: `${brtTime.getUTCDate().toString().padStart(2, '0')}/${(brtTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${brtTime.getUTCFullYear()}`,
                dayNumber: brtTime.getUTCDate().toString().padStart(2, '0'),
                monthLabel: format(brtTime, 'MMM', { locale: ptBR }),
                piGroups: {},
            }
        }

        const pi = capture.campaign.pi
        if (!acc[dateKey].piGroups[pi]) {
            acc[dateKey].piGroups[pi] = {
                pi,
                client: capture.campaign.client,
                campaignName: capture.campaign.campaignName,
                captureCount: 0,
                thumbnailId: capture.id,
            }
        }

        acc[dateKey].piGroups[pi].captureCount += 1
        return acc
    }, {})

    return Object.values(groupedCaptures)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map(day => ({
            dateKey: day.dateKey,
            weekDay: day.weekDay,
            fullDate: day.fullDate,
            dayNumber: day.dayNumber,
            monthLabel: day.monthLabel,
            sortedPiGroups: Object.values(day.piGroups).sort((a, b) => a.pi.localeCompare(b.pi)),
        }))
}

function groupActiveCampaigns({
    rows,
    formatLabelMap,
    captureCountsByCampaign,
    dispatchesByKey,
}: {
    rows: ActiveCampaignRow[]
    formatLabelMap: Map<string, string>
    captureCountsByCampaign: Map<string, number>
    dispatchesByKey: Map<string, {
        id: string
        status: string
        triggerMode: string
        lastSentAt: Date | null
        errorMessage: string | null
        attachmentCount: number
        attachmentBytes: number
        attempts: number
    }>
}) {
    const groups = new Map<string, {
        pi: string
        client: string
        agency: string
        campaignName: string
        flightStart: Date | null
        flightEnd: Date | null
        formats: Set<string>
        devices: Set<string>
        statuses: Set<string>
        printCount: number
    }>()

    for (const row of rows) {
        const current = groups.get(row.pi) || {
            pi: row.pi,
            client: row.client,
            agency: row.agency,
            campaignName: row.campaignName,
            flightStart: row.flightStart,
            flightEnd: row.flightEnd,
            formats: new Set<string>(),
            devices: new Set<string>(),
            statuses: new Set<string>(),
            printCount: 0,
        }

        if (row.flightStart && (!current.flightStart || row.flightStart < current.flightStart)) {
            current.flightStart = row.flightStart
        }
        if (row.flightEnd && (!current.flightEnd || row.flightEnd > current.flightEnd)) {
            current.flightEnd = row.flightEnd
        }

        current.formats.add(resolveFormatLabel(formatLabelMap, row.format))
        current.devices.add(row.device || 'desktop')
        current.statuses.add(row.status)
        current.printCount += captureCountsByCampaign.get(row.id) || 0
        groups.set(row.pi, current)
    }

    return Array.from(groups.values())
        .map(group => {
            const dispatch = dispatchesByKey.get(dispatchKey(group.pi, group.flightEnd)) || null
            return {
                pi: group.pi,
                client: group.client,
                agency: group.agency,
                campaignName: group.campaignName,
                flightStart: group.flightStart?.toISOString() || null,
                flightEnd: group.flightEnd?.toISOString() || null,
                formats: Array.from(group.formats).sort((a, b) => a.localeCompare(b)),
                devices: Array.from(group.devices).sort((a, b) => a.localeCompare(b)),
                statuses: Array.from(group.statuses).sort((a, b) => a.localeCompare(b)),
                printCount: group.printCount,
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
        })
        .sort((a, b) => (a.flightEnd || '').localeCompare(b.flightEnd || '') || a.client.localeCompare(b.client))
}

export default async function FederalBooksPage() {
    const session = await getSession()
    const canManageReports = session?.role === 'admin'
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    const now = new Date()

    const [formatLabelMap, settings, captures, allGovCampaignRows, activeCampaignRows] = await Promise.all([
        getFormatLabelMap(),
        prisma.settings.upsert({
            where: { id: 1 },
            create: { id: 1 },
            update: {},
        }),
        prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                screenshotPath: { not: '' },
                createdAt: { gte: sixtyDaysAgo },
                campaign: {
                    isArchived: false,
                    segmentation: FEDERAL_SEGMENTATION,
                },
            },
            select: {
                id: true,
                createdAt: true,
                screenshotPath: true,
                campaign: {
                    select: {
                        pi: true,
                        client: true,
                        campaignName: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.campaign.findMany({
            where: {
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
            },
            select: {
                pi: true,
                campaignName: true,
            },
        }),
        prisma.campaign.findMany({
            where: {
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
                status: { notIn: ACTIVE_STATUS_BLOCKLIST },
                flightStart: { lte: now },
                flightEnd: { gte: now },
            },
            select: {
                id: true,
                pi: true,
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                device: true,
                status: true,
                flightStart: true,
                flightEnd: true,
            },
            orderBy: [
                { flightEnd: 'asc' },
                { client: 'asc' },
            ],
        }),
    ])

    const activeCampaignIds = activeCampaignRows.map(campaign => campaign.id)
    const activePiValues = Array.from(new Set(activeCampaignRows.map(campaign => campaign.pi)))
    const [captureCounts, dispatches] = await Promise.all([
        activeCampaignIds.length > 0
            ? prisma.capture.groupBy({
                by: ['campaignId'],
                where: {
                    campaignId: { in: activeCampaignIds },
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                },
                _count: { id: true },
            })
            : Promise.resolve([]),
        activePiValues.length > 0
            ? prisma.emailDispatch.findMany({
                where: {
                    pi: { in: activePiValues },
                    flightEnd: { not: null },
                    reportScope: 'CAMPAIGN',
                },
                orderBy: { updatedAt: 'desc' },
                select: {
                    id: true,
                    pi: true,
                    flightEnd: true,
                    status: true,
                    triggerMode: true,
                    lastSentAt: true,
                    errorMessage: true,
                    attachmentCount: true,
                    attachmentBytes: true,
                    attempts: true,
                },
            })
            : Promise.resolve([]),
    ])

    const timeline = groupTimeline(captures)
    const totalFolders = timeline.reduce((sum, day) => sum + day.sortedPiGroups.length, 0)
    const totalPis = new Set(captures.map(capture => capture.campaign.pi)).size
    const registeredCampaigns = new Set(allGovCampaignRows.map(campaign => `${campaign.pi}|${campaign.campaignName}`)).size
    const captureCountsByCampaign = new Map(captureCounts.map(item => [item.campaignId, item._count.id]))
    const dispatchesByKey = new Map<string, (typeof dispatches)[number]>()

    for (const dispatch of dispatches) {
        const key = dispatchKey(dispatch.pi, dispatch.flightEnd)
        if (key && !dispatchesByKey.has(key)) dispatchesByKey.set(key, dispatch)
    }

    const activeCampaigns = groupActiveCampaigns({
        rows: activeCampaignRows,
        formatLabelMap,
        captureCountsByCampaign,
        dispatchesByKey,
    })

    const data: FederalBooksWorkspaceData = {
        timeline,
        stats: {
            prints: captures.length,
            folders: totalFolders,
            pis: totalPis,
            days: timeline.length,
            registeredCampaigns,
            activeCampaigns: activeCampaigns.length,
        },
        organization: {
            canManageReports,
            settings: {
                recipients: parseRecipients(settings.governmentReportRecipients),
                autoSend: Boolean(settings.governmentReportAutoSend),
                dispatchTime: settings.governmentReportTime || '09:00',
            },
            activeCampaigns,
        },
    }

    return <FederalBooksWorkspace data={data} />
}
