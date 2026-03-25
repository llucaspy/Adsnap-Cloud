
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    try {
        const count = await prisma.campaign.count({
            where: {
                isArchived: false,
                externalAuthUrl: { not: "" }
            }
        })
        console.log('Campaigns with Auth URL:', count)
    } catch (e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
        process.exit(0)
    }
}
main()
