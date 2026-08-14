import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { deleteCaptureFile, getCaptureStorageKind } from '@/lib/captureStorage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DELETE_BATCH_SIZE = 150

type CleanupBody = {
    startDate?: string
    endDate?: string
    confirmation?: string
}

function parseDateParam(value: string | null | undefined, paramName: string) {
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

function getRangeBounds(startDate: string | null | undefined, endDate: string | null | undefined) {
    const { value: startValue } = parseDateParam(startDate, 'startDate')
    const { value: endValue } = parseDateParam(endDate, 'endDate')
    const startBounds = getBrtDayBounds(startValue)
    const endBounds = getBrtDayBounds(endValue)

    if (startBounds.start.getTime() > endBounds.end.getTime()) {
        throw new Error('A data inicial nao pode ser maior que a data final')
    }

    return {
        startValue,
        endValue,
        start: startBounds.start,
        end: endBounds.end
    }
}

function getRangeWhere(start: Date, end: Date) {
    return {
        createdAt: { gte: start, lte: end },
        screenshotPath: { not: '' }
    }
}

async function getCapturesForRange(start: Date, end: Date, take?: number) {
    return prisma.capture.findMany({
        where: getRangeWhere(start, end),
        select: {
            id: true,
            screenshotPath: true,
            campaign: {
                select: {
                    pi: true,
                    client: true
                }
            }
        },
        orderBy: { createdAt: 'asc' },
        take
    })
}

async function removeCaptureFiles(captures: Array<{ id: string; screenshotPath: string }>) {
    const deletedCaptureIds = new Set<string>()
    let failedStorageFiles = 0

    for (const capture of captures) {
        try {
            const deleted = await deleteCaptureFile(capture.screenshotPath)
            if (deleted) {
                deletedCaptureIds.add(capture.id)
            } else {
                failedStorageFiles += 1
            }
        } catch (error) {
            failedStorageFiles += 1
            console.error('[Admin Cleanup] Storage delete error:', capture.id, error)
        }
    }

    return {
        deletedStorageFiles: deletedCaptureIds.size,
        failedStorageFiles,
        deletedCaptureIds,
    }
}

export async function GET(request: NextRequest) {
    try {
        await requireAdmin()

        const { searchParams } = new URL(request.url)
        const { startValue, endValue, start, end } = getRangeBounds(
            searchParams.get('startDate'),
            searchParams.get('endDate')
        )
        const captures = await getCapturesForRange(start, end)
        const storageKinds = captures.reduce((acc, capture) => {
            const kind = getCaptureStorageKind(capture.screenshotPath)
            acc[kind] = (acc[kind] || 0) + 1
            return acc
        }, {} as Record<string, number>)
        const campaigns = new Map<string, { pi: string; client: string; count: number }>()

        captures.forEach((capture) => {
            const key = `${capture.campaign.pi}-${capture.campaign.client}`
            const current = campaigns.get(key)

            if (current) {
                current.count += 1
            } else {
                campaigns.set(key, {
                    pi: capture.campaign.pi,
                    client: capture.campaign.client,
                    count: 1
                })
            }
        })

        return NextResponse.json({
            startDate: startValue,
            endDate: endValue,
            captureCount: captures.length,
            storageFileCount: (storageKinds.supabase || 0) + (storageKinds['google-drive'] || 0),
            localFileCount: storageKinds.local || 0,
            googleDriveFileCount: storageKinds['google-drive'] || 0,
            remoteUrlFileCount: storageKinds['remote-url'] || 0,
            campaignCount: campaigns.size,
            campaigns: Array.from(campaigns.values())
                .sort((a, b) => b.count - a.count)
                .slice(0, 8)
        })
    } catch (error) {
        const message = (error as Error).message
        const status = message.includes('Unauthorized') ? 403 : 400
        return NextResponse.json({ error: message || 'Erro ao calcular limpeza' }, { status })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        await requireAdmin()

        const body = await request.json() as CleanupBody

        if (body.confirmation !== 'APAGAR') {
            return NextResponse.json({ error: 'Confirmacao invalida' }, { status: 400 })
        }

        const { startValue, endValue, start, end } = getRangeBounds(body.startDate, body.endDate)
        const captures = await getCapturesForRange(start, end, DELETE_BATCH_SIZE)

        if (captures.length === 0) {
            return NextResponse.json({
                success: true,
                deletedCaptures: 0,
                deletedStorageFiles: 0,
                failedStorageFiles: 0,
                deletedLocalFiles: 0,
                processedCaptures: 0,
                remainingCaptures: 0,
                hasMore: false,
                message: 'Nenhum print encontrado nesse periodo.'
            })
        }

        const {
            deletedStorageFiles,
            failedStorageFiles,
            deletedCaptureIds
        } = await removeCaptureFiles(captures)

        const capturesToDelete = captures.filter((capture) => deletedCaptureIds.has(capture.id))

        if (capturesToDelete.length === 0) {
            return NextResponse.json(
                { error: 'O storage recusou a exclusao dos arquivos desse lote. Nenhum registro foi removido.' },
                { status: 409 }
            )
        }

        await prisma.capture.deleteMany({
            where: {
                id: { in: capturesToDelete.map((capture) => capture.id) }
            }
        })

        const remainingCaptures = await prisma.capture.count({
            where: getRangeWhere(start, end)
        })

        if (remainingCaptures === 0) {
            revalidatePath('/books')
            revalidatePath('/admin')
            revalidatePath('/')
        }

        return NextResponse.json({
            success: true,
            startDate: startValue,
            endDate: endValue,
            deletedCaptures: capturesToDelete.length,
            deletedStorageFiles,
            failedStorageFiles,
            deletedLocalFiles: 0,
            processedCaptures: captures.length,
            remainingCaptures,
            hasMore: remainingCaptures > 0
        })
    } catch (error) {
        console.error('[Admin Cleanup] Delete error:', error)
        const message = (error as Error).message
        const status = message.includes('Unauthorized') ? 403 : 500
        return NextResponse.json({ error: message || 'Erro ao apagar prints' }, { status })
    }
}
