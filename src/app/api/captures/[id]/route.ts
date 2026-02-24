import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params

        const capture = await prisma.capture.findUnique({
            where: { id }
        })

        if (!capture || !capture.screenshotPath) {
            return new NextResponse('Capture not found', { status: 404 })
        }

        // If screenshotPath is a URL (Supabase), redirect to it
        if (capture.screenshotPath.startsWith('http')) {
            return NextResponse.redirect(capture.screenshotPath)
        }

        // Check if local file exists
        if (!fs.existsSync(capture.screenshotPath)) {
            console.error(`[API] File not found: ${capture.screenshotPath}`)
            return new NextResponse('File not found on server', { status: 404 })
        }

        const fileBuffer = fs.readFileSync(capture.screenshotPath)

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=31536000, immutable',
            },
        })
    } catch (error) {
        console.error('[API] Error serving capture:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
