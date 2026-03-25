import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const logs = await prisma.nexusLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    })
    console.log('--- LATEST LOGS ---')
    console.log(JSON.stringify(logs, null, 2))

    const stats = await prisma.campaign.groupBy({
        by: ['status'],
        _count: { id: true }
    })
    console.log('--- STATS ---')
    console.log(JSON.stringify(stats, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
