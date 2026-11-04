import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { runCaptureScheduler, SchedulerUnauthorized } from '@/lib/captureScheduler'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
    try {
        const result = await runCaptureScheduler(prisma, request.headers.get('authorization'), {
            repository: (process.env.GITHUB_REPO || '').replace(/^https:\/\/github.com\//, '').replace(/\.git\/?$/, '').replace(/\/$/, ''),
            token: process.env.GITHUB_TOKEN || '',
        })
        return NextResponse.json(result, { status: result.decision === 'error' ? 503 : 200,
            headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
        return NextResponse.json({ error: error instanceof SchedulerUnauthorized ? 'Unauthorized' : 'Scheduler unavailable' }, {
            status: error instanceof SchedulerUnauthorized ? 401 : 503, headers: { 'Cache-Control': 'no-store' },
        })
    }
}
