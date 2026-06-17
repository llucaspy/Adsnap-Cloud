import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { getSupabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import fs from 'fs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const STORAGE_BATCH_SIZE = 50
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

function extractStoragePath(screenshotPath: string) {
    if (!screenshotPath || !screenshotPath.startsWith('http')) return null

    try {
        const url = new URL(screenshotPath)
        const publicMarker = '/storage/v1/object/public/screenshots/'
        const objectMarker = '/storage/v1/object/screenshots/'
        const marker = url.pathname.includes(publicMarker) ? publicMarker : objectMarker
        const markerIndex = url.pathname.indexOf(marker)

        if (markerIndex === -1) return null

        const path = url.pathname.slice(markerIndex + marker.length)
        return decodeURIComponent(path)
    } catch {
        const fallback = screenshotPath.split('screenshots/')[1]?.split('?')[0]
        return fallback ? decodeURIComponent(fallback) : null
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

async function removeStoragePaths(storagePaths: string[]) {
    if (storagePaths.length === 0) {
        return {
            deletedStorageFiles: 0,
            failedStorageFiles: 0,
            deletedStoragePaths: new Set<string>()
        }
    }

    const supabase = getSupabase()
    const deletedStoragePaths = new Set<string>()
    let failedStorageFiles = 0

    for (let index = 0; index < storagePaths.length; index += STORAGE_BATCH_SIZE) {
        const batch = storagePaths.slice(index, index + STORAGE_BATCH_SIZE)
        const { error } = await supabase.storage.from('screenshots').remove(batch)

        if (!error) {
            batch.forEach((storagePath) => deletedStoragePaths.add(storagePath))
            continue
        }

        console.error('[Admin Cleanup] Storage batch delete error:', error)

        for (const storagePath of batch) {
            const { error: singleError } = await supabase.storage.from('screenshots').remove([storagePath])

            if (singleError) {
                console.error('[Admin Cleanup] Storage single delete error:', storagePath, singleError)
                failedStorageFiles += 1
            } else {
                deletedStoragePaths.add(storagePath)
            }
        }
    }

    return {
        deletedStorageFiles: deletedStoragePaths.size,
        failedStorageFiles,
        deletedStoragePaths
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
        const storagePaths = captures.map((capture) => extractStoragePath(capture.screenshotPath)).filter(Boolean)
        const localFiles = captures.filter((capture) => capture.screenshotPath && !capture.screenshotPath.startsWith('http')).length
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
            storageFileCount: storagePaths.length,
            localFileCount: localFiles,
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

        const storagePathByCaptureId = new Map<string, string>()
        captures.forEach((capture) => {
            const storagePath = extractStoragePath(capture.screenshotPath)
            if (storagePath) storagePathByCaptureId.set(capture.id, storagePath)
        })
        const storagePaths = Array.from(new Set(storagePathByCaptureId.values()))
        const localPaths = Array.from(new Set(
            captures
                .filter((capture) => capture.screenshotPath && !capture.screenshotPath.startsWith('http'))
                .map((capture) => capture.screenshotPath)
        ))

        const {
            deletedStorageFiles,
            failedStorageFiles,
            deletedStoragePaths
        } = await removeStoragePaths(storagePaths)

        let deletedLocalFiles = 0

        localPaths.forEach((filePath) => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath)
                    deletedLocalFiles += 1
                }
            } catch (error) {
                console.error('[Admin Cleanup] Local file delete error:', error)
            }
        })

        const capturesToDelete = captures.filter((capture) => {
            const storagePath = storagePathByCaptureId.get(capture.id)
            return !storagePath || deletedStoragePaths.has(storagePath)
        })

        if (capturesToDelete.length === 0) {
            return NextResponse.json(
                { error: 'O Supabase recusou a exclusao dos arquivos desse lote. Nenhum registro foi removido.' },
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
            deletedLocalFiles,
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
