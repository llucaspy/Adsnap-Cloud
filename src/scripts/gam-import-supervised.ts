import '../lib/env'
import { PrismaClient } from '@prisma/client'
import { gamCrawler } from '../lib/gamCrawlerService'
import { buildGamImportDraft } from '../lib/gamImportPlanner'
import { createCampaignsFromGamDraft } from '../lib/gamImportWriter'

function hasFlag(name: string) {
    return process.argv.includes(name)
}

async function main() {
    const orderUrl = process.argv.find(arg => arg.startsWith('http'))
    if (!orderUrl) {
        throw new Error('Uso: npx tsx src/scripts/gam-import-supervised.ts <GAM_ORDER_URL> [--apply]')
    }

    const prisma = new PrismaClient()
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        const bannerFormats = JSON.parse(settings?.bannerFormats || '[]')
        const order = await gamCrawler.startIngestion(orderUrl)
        const draft = buildGamImportDraft(order, bannerFormats)

        console.log(JSON.stringify(draft, null, 2))

        if (hasFlag('--apply')) {
            const result = await createCampaignsFromGamDraft(prisma, draft)
            console.log(JSON.stringify(result, null, 2))
        } else {
            console.log('Rascunho gerado. Rode novamente com --apply somente depois da revisao humana.')
        }
    } finally {
        await prisma.$disconnect()
    }
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
