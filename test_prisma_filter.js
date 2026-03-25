
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            externalAuthUrl: { not: "" }
        }
    })
    console.log('Result Count:', campaigns.length)
    if (campaigns.length > 0) {
        console.log('Sample Auth URL:', campaigns[0].externalAuthUrl)
    }
    process.exit(0)
}
main()
