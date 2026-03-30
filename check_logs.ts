import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Fetching recent API errors ---');
    try {
        const logs = await prisma.nexusLog.findMany({
            where: { level: 'API_ERROR' },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        if (logs.length === 0) {
            console.log('No API errors found in the last 10 logs.');
        } else {
            logs.forEach(log => {
                console.log(`[${log.createdAt.toISOString()}] ${log.message}`);
                if (log.details) console.log(`Details: ${log.details.substring(0, 1000)}`);
                console.log('---');
            });
        }
    } catch (err) {
        console.error('Prisma Error:', err);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
