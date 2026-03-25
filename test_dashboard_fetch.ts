
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const campaigns = await prisma.campaign.findMany({ where: { isArchived: false } })
    console.log('Total Campaigns found:', campaigns.length)
    if (campaigns.length > 0) {
        console.log('Sample Campaign:', campaigns[0])
    }
    const quarantined = await prisma.campaign.count({ where: { status: 'QUARANTINE', isArchived: false } })
    console.log('Quarantined Count:', quarantined)
    process.exit(0)
}
main()
