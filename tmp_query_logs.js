const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    try {
        const logs = await prisma.nexusLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        })
        console.log(JSON.stringify(logs, null, 2))
    } catch (e) {
        console.error(e)
    } finally {
        await prisma.$disconnect()
    }
}

main()
