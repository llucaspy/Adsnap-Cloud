
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function debugDashboardToday() {
    try {
        const now = new Date();

        console.log("Current Server Time (now):", now.toISOString());

        // Brazil Time "Today"
        // 00:00:00 BRT = 03:00:00 UTC
        const brtCheck = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        const dateStr = brtCheck.toISOString().split('T')[0];
        const brtStart = new Date(`${dateStr}T03:00:00.000Z`);

        console.log("Brazil 'Today' Start (aligned with current code goal):", brtStart.toISOString());

        const captures = await prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                createdAt: { gte: brtStart }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        console.log(`Captures found using brtStart (${brtStart.toISOString()}): ${captures.length}`);
        captures.forEach(c => {
            console.log(`- ${c.id} | ${c.createdAt.toISOString()}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

debugDashboardToday();
