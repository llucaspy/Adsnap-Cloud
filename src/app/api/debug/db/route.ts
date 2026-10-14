import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { sanitizeLogRecord } from '@/lib/logRedaction';

export const dynamic = 'force-dynamic';

export async function GET() {
    const session = await getSession();
    if (!session?.userId || !session.email) return NextResponse.json({ error: 'Login necessário' }, { status: 401 });
    if (session.role !== 'admin') return NextResponse.json({ error: 'Acesso restrito' }, { status: 403 });
    try {
        const [campaigns, captures, logs] = await Promise.all([
            prisma.campaign.findMany({
                where: { status: { not: 'PENDING' } },
                orderBy: { updatedAt: 'desc' },
                take: 10,
                select: { id: true, status: true, updatedAt: true }
            }),
            prisma.capture.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { id: true, campaignId: true, status: true, createdAt: true }
            }),
            prisma.nexusLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 20
            })
        ]);

        return NextResponse.json({
            campaigns,
            captures,
            logs: logs.map(sanitizeLogRecord),
            dbUrlPresent: !!process.env.DATABASE_URL,
            timestamp: new Date().toISOString()
        }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        return NextResponse.json({
            error: 'Não foi possível consultar o diagnóstico'
        }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
    }
}
