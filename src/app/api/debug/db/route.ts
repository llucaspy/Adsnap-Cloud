import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const [campaigns, captures, logs] = await Promise.all([
            prisma.campaign.findMany({
                where: { status: { not: 'PENDING' } },
                orderBy: { updatedAt: 'desc' },
                take: 10
            }),
            prisma.capture.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            prisma.nexusLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20
            })
        ]);

        return NextResponse.json({
            campaigns,
            captures,
            logs,
            dbUrlPresent: !!process.env.DATABASE_URL,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, { status: 500 });
    }
}
