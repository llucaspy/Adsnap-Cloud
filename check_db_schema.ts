
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    try {
        const campaign = await prisma.campaign.findFirst({
            select: {
                id: true,
                dailyGoalThreshold: true,
                lastThresholdAlertAt: true
            }
        })
        console.log('SUCCESS: Columns found.')
        console.log('Sample:', campaign)
    } catch (e: any) {
        console.error('ERROR: Columns missing or query failed.')
        console.error(e.message)
    } finally {
        await prisma.$disconnect()
    }
}

main()
