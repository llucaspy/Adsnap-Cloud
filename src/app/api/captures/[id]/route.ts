import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import fs from 'fs'

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

        // If screenshotPath is a URL (Supabase), proxy it
        if (capture.screenshotPath.startsWith('http')) {
            const response = await fetch(capture.screenshotPath)
            if (!response.ok) {
                console.error(`[API] Failed to fetch from Supabase: ${capture.screenshotPath}`)
                return new NextResponse('Error fetching from storage', { status: response.status })
            }
            const arrayBuffer = await response.arrayBuffer()
            return new NextResponse(arrayBuffer, {
                headers: imageHeaders(
                    response.headers.get('Content-Type') || 'image/png',
                    response.headers.get('Content-Length')
                ),
            })
        }

        // Check if local file exists
        if (!fs.existsSync(capture.screenshotPath)) {
            console.error(`[API] File not found: ${capture.screenshotPath}`)
            return new NextResponse('File not found on server', { status: 404 })
        }

        const fileBuffer = fs.readFileSync(capture.screenshotPath)

        return new NextResponse(new Uint8Array(fileBuffer), {
            headers: imageHeaders(getLocalContentType(capture.screenshotPath), fileBuffer.byteLength),
        })
    } catch (error) {
        console.error('[API] Error serving capture:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
