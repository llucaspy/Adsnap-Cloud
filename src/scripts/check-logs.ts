import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('--- LATEST NEXUS LOGS ---')
    const logs = await prisma.nexusLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
    })

    logs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}] [${log.level}] ${log.message}`)
        if (log.details) console.log(`   Details: ${log.details}`)
        if (log.campaignId) console.log(`   Campaign: ${log.campaignId}`)
        console.log('---')
    })

    console.log('\n--- LATEST CAPTURE ERRORS ---')
    const captures = await prisma.capture.findMany({
        where: { status: { in: ['FAILED', 'QUARANTINE'] } },
        orderBy: { createdAt: 'desc' },
        take: 5
    })

    captures.forEach(cap => {
        console.log(`[${cap.createdAt.toISOString()}] Campaign: ${cap.campaignId}`)
        console.log(`   Notes: ${cap.auditNotes}`)
        console.log('---')
    })
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
