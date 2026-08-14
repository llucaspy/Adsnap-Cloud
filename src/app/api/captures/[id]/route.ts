import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { loadCaptureFile } from '@/lib/captureStorage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CACHE_HEADER = 'public, max-age=31536000, immutable'

function getLocalContentType(path: string) {
    const normalized = path.split('?')[0].toLowerCase()
    if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
    if (normalized.endsWith('.webp')) return 'image/webp'
    if (normalized.endsWith('.avif')) return 'image/avif'
    return 'image/png'
}

function imageHeaders(contentType: string, contentLength?: string | number | null) {
    const headers = new Headers({
        'Content-Type': contentType,
        'Cache-Control': CACHE_HEADER,
        'X-Content-Type-Options': 'nosniff',
    })

    if (contentLength) {
        headers.set('Content-Length', String(contentLength))
    }

    return headers
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const capture = await prisma.capture.findUnique({
            where: { id },
            select: { screenshotPath: true }
        })

        if (!capture || !capture.screenshotPath) {
            return new NextResponse('Capture not found', { status: 404 })
        }

        const fileBuffer = await loadCaptureFile(capture.screenshotPath)

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: imageHeaders(getLocalContentType(capture.screenshotPath), fileBuffer.byteLength),
        })
    } catch (error) {
        console.error('[API] Error serving capture:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
