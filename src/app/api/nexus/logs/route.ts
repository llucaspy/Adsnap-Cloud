import prisma from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { createNexusLogsHandler } from '@/lib/nexusLogRead';

export const dynamic = 'force-dynamic';

export const GET = createNexusLogsHandler({
    getSession,
    readLogs: () => prisma.nexusLog.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        select: { id: true, level: true, message: true, details: true, campaignId: true, createdAt: true },
    }),
});
