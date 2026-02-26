
import prisma from './src/lib/prisma.js';

async function findMultiDayPis() {
    try {
        const captures = await prisma.capture.findMany({
            where: { status: 'SUCCESS' },
            include: { campaign: true },
            orderBy: { createdAt: 'desc' }
        });

        const piDays = {};
        captures.forEach(c => {
            const pi = c.campaign.pi;
            // Shift by -3h to match BRT
            const brtDate = new Date(c.createdAt.getTime() - (3 * 60 * 60 * 1000)).toISOString().split('T')[0];

            if (!piDays[pi]) piDays[pi] = new Set();
            piDays[pi].add(brtDate);
        });

        console.log("PIs with captures on multiple days (BRT):");
        for (const [pi, days] of Object.entries(piDays)) {
            if (days.size > 1) {
                console.log(`- PI: ${pi} | Days: ${Array.from(days).join(', ')}`);
            }
        }

    } catch (error) {
        console.error(error);
    } finally {
        await prisma.$disconnect();
    }
}

findMultiDayPis();
