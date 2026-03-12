
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugZip() {
  try {
    const captures = await prisma.capture.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { campaign: true }
    })

    console.log('--- Ultimas 5 Capturas ---')
    captures.forEach(c => {
      console.log(`ID: ${c.id}`)
      console.log(`screenshotPath: ${c.screenshotPath}`)
      console.log(`Existe no disco: ${require('fs').existsSync(c.screenshotPath)}`)
      console.log(`Campanha: ${c.campaign.campaignName}`)
      console.log('---')
    })
  } catch (error) {
    console.error(error)
  } finally {
    await prisma.$disconnect()
  }
}

debugZip()
