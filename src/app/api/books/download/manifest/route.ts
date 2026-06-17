import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type BannerFormat = {
    id?: string
    label?: string
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseDateParam(value: string | null, paramName: string) {
    if (!value || !DATE_PARAM_PATTERN.test(value)) {
        throw new Error(`Parametro ${paramName} invalido`)
    }

    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))

    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        throw new Error(`Parametro ${paramName} invalido`)
    }

    return { date, value }
}

function getBrtDayBounds(dateStr: string) {
    const { date } = parseDateParam(dateStr, 'date')
    const start = new Date(date.getTime() + BRT_OFFSET_MS)
    const end = new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1)

    return { start, end }
}

function getBrtDateKey(date: Date) {
    return new Date(date.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10)
}

function getBrtTimeKey(date: Date) {
    return new Date(date.getTime() - BRT_OFFSET_MS).toISOString().slice(11, 19).replace(/:/g, '-')
}

function sanitizePathSegment(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, '').trim()
}

function parseBannerFormats(value: string | null | undefined): BannerFormat[] {
    if (!value) return []

    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')

    if (!startDateStr || !endDateStr) {
        return NextResponse.json({ error: 'Informe startDate e endDate' }, { status: 400 })
    }

    try {
        const { value: startValue } = parseDateParam(startDateStr, 'startDate')
        const { value: endValue } = parseDateParam(endDateStr, 'endDate')
        const startBounds = getBrtDayBounds(startValue)
        const endBounds = getBrtDayBounds(endValue)

        if (startBounds.start.getTime() > endBounds.end.getTime()) {
            return NextResponse.json({ error: 'A data inicial nao pode ser maior que a data final' }, { status: 400 })
        }

        const [captures, settings] = await Promise.all([
            prisma.capture.findMany({
                where: {
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                    createdAt: { gte: startBounds.start, lte: endBounds.end },
                    campaign: { isArchived: false }
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
                            format: true
                        }
                    }
                },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.settings.findFirst()
        ])

        const formats = parseBannerFormats(settings?.bannerFormats)
        const files = captures.map((capture) => {
            const campaign = capture.campaign
            const foundFormat = formats.find((format) =>
                format.id?.trim().toLowerCase() === campaign.format?.trim().toLowerCase()
            )
            const formatLabel = foundFormat?.label
                ? foundFormat.label
                : (campaign.format?.includes('x') ? campaign.format : 'Indefinido')
            const safeFormatLabel = sanitizePathSegment(formatLabel) || 'Indefinido'
            const safeClient = sanitizePathSegment(campaign.client)
            const safeCampaign = sanitizePathSegment(campaign.campaignName)
            const dateFolder = getBrtDateKey(capture.createdAt)
            const piFolder = `PI ${campaign.pi} - ${safeClient}${safeCampaign ? ` - ${safeCampaign}` : ''}`
            const timeStr = getBrtTimeKey(capture.createdAt)
            const fileName = `${safeFormatLabel}_${timeStr}_${capture.id.slice(0, 8)}.png`
            const proxyUrl = `/api/captures/${capture.id}`

            return {
                id: capture.id,
                url: capture.screenshotPath.startsWith('http') ? capture.screenshotPath : proxyUrl,
                fallbackUrl: proxyUrl,
                zipPath: `${dateFolder}/${piFolder}/${fileName}`
            }
        })

        return NextResponse.json(
            {
                zipFilename: `prints-${startValue}_a_${endValue}.zip`,
                count: files.length,
                files
            },
            {
                headers: {
                    'Cache-Control': 'no-store'
                }
            }
        )
    } catch (error) {
        console.error('[ZIP Manifest Error]', error)
        return NextResponse.json({ error: 'Erro ao preparar lista de prints' }, { status: 500 })
    }
}
