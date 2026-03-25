
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const all = await prisma.campaign.findMany({ where: { isArchived: false } })
    console.log('Total Active:', all.length)
    console.log('Null Auth:', all.filter(c => c.externalAuthUrl === null).length)
    console.log('Empty Auth:', all.filter(c => c.externalAuthUrl === '').length)
    console.log('Populated Auth:', all.filter(c => c.externalAuthUrl && c.externalAuthUrl !== '').length)
    process.exit(0)
}
main()
