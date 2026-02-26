
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkPaths() {
    try {
        const captures = await prisma.capture.findMany({
            where: {
                status: 'SUCCESS',
                createdAt: { gte: new Date('2026-02-26T00:00:00Z') }
            },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        console.log("Screenshot paths for today's captures:");
        captures.forEach(c => {
            console.log(`- ID: ${c.id} | Path: ${c.screenshotPath}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkPaths();
