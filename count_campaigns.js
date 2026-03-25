
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const n = await prisma.campaign.count({ where: { isArched: false } }).catch(() => prisma.campaign.count())
    console.log('Campaign Count:', n)
    process.exit(0)
}
main()
