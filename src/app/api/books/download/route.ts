import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import fs from 'fs'
import JSZip from 'jszip'
import type { Prisma } from '@prisma/client'

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
    const dateStr = searchParams.get('date')
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const pi = searchParams.get('pi')
    const hasDateRange = Boolean(startDateStr || endDateStr)

    if (!dateStr && !pi && !hasDateRange) {
        return NextResponse.json({ error: 'Nenhum parametro (date, pi ou intervalo) fornecido' }, { status: 400 })
    }

    try {
        let whereClause: Prisma.CaptureWhereInput = {
            status: 'SUCCESS',
            screenshotPath: { not: '' },
            campaign: { isArchived: false }
        }
        let zipFilename = 'prints.zip'
        let isRangeDownload = false

        if (pi) {
            whereClause = { ...whereClause, campaign: { isArchived: false, pi } }
            zipFilename = `campanha-PI-${pi}.zip`
        } else if (hasDateRange) {
            if (!startDateStr || !endDateStr) {
                return NextResponse.json({ error: 'Informe startDate e endDate para baixar por intervalo' }, { status: 400 })
            }

            const { value: startValue } = parseDateParam(startDateStr, 'startDate')
            const { value: endValue } = parseDateParam(endDateStr, 'endDate')
            const startBounds = getBrtDayBounds(startValue)
            const endBounds = getBrtDayBounds(endValue)

            if (startBounds.start.getTime() > endBounds.end.getTime()) {
                return NextResponse.json({ error: 'A data inicial nao pode ser maior que a data final' }, { status: 400 })
            }

            whereClause = {
                ...whereClause,
                createdAt: { gte: startBounds.start, lte: endBounds.end }
            }
            zipFilename = `prints-${startValue}_a_${endValue}.zip`
            isRangeDownload = true
        } else if (dateStr) {
            const { value } = parseDateParam(dateStr, 'date')
            const { start, end } = getBrtDayBounds(value)
            whereClause = {
                ...whereClause,
                createdAt: { gte: start, lte: end }
            }
            zipFilename = `prints-${value}.zip`
        }

        const [captures, settings] = await Promise.all([
            prisma.capture.findMany({
                where: whereClause,
                include: { campaign: true },
                orderBy: { createdAt: 'asc' }
            }),
            prisma.settings.findFirst()
        ])

        if (captures.length === 0) {
            return NextResponse.json({ error: 'Nenhum print encontrado' }, { status: 404 })
        }

        const formats = parseBannerFormats(settings?.bannerFormats)

        const zip = new JSZip()
        let addedFiles = 0

        for (const capture of captures) {
            let fileContent: Buffer | null = null;
            const isUrl = capture.screenshotPath.startsWith('http')

            try {
                if (isUrl) {
                    const response = await fetch(capture.screenshotPath);
                    if (response.ok) {
                        const arrayBuffer = await response.arrayBuffer();
                        fileContent = Buffer.from(arrayBuffer);
                    }
                } else if (fs.existsSync(capture.screenshotPath)) {
                    fileContent = fs.readFileSync(capture.screenshotPath);
                }

                if (fileContent) {
                    const campaign = capture.campaign;

                    const foundFormat = formats.find((f) =>
                        f.id?.trim().toLowerCase() === campaign.format?.trim().toLowerCase()
                    );
                    const formatLabel = foundFormat?.label
                        ? foundFormat.label
                        : (campaign.format?.includes('x') ? campaign.format : 'Indefinido');
                    const safeFormatLabel = sanitizePathSegment(formatLabel) || 'Indefinido'
                    const timeStr = getBrtTimeKey(capture.createdAt);
                    const fileName = `${safeFormatLabel}_${timeStr}_${capture.id.slice(0, 8)}.png`

                    const safeClient = sanitizePathSegment(campaign.client)
                    const safeCampaign = sanitizePathSegment(campaign.campaignName)
                    
                    let filePath = '';
                    if (pi) {
                        const dateFolder = getBrtDateKey(capture.createdAt);
                        filePath = `${dateFolder}/${fileName}`;
                    } else if (isRangeDownload) {
                        const dateFolder = getBrtDateKey(capture.createdAt);
                        const piFolder = `PI ${campaign.pi} - ${safeClient}${safeCampaign ? ` - ${safeCampaign}` : ''}`;
                        filePath = `${dateFolder}/${piFolder}/${fileName}`;
                    } else {
                        const piFolder = `PI ${campaign.pi} - ${safeClient}${safeCampaign ? ` - ${safeCampaign}` : ''}`;
                        filePath = `${piFolder}/${fileName}`;
                    }

                    zip.file(filePath, fileContent);
                    addedFiles += 1
                }
            } catch (err) {
                console.error(`[ZIP] Error processing capture ${capture.id}:`, err);
            }
        }

        if (addedFiles === 0) {
            return NextResponse.json({ error: 'Nenhum arquivo de print foi encontrado' }, { status: 404 })
        }

        const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

        return new NextResponse(new Uint8Array(zipBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=\"${zipFilename}\"`
            }
        })

    } catch (error) {
        console.error('[ZIP Download Error]', error)
        return NextResponse.json({ error: 'Erro ao gerar arquivo ZIP' }, { status: 500 })
    }
}
