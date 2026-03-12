import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- DIAGNÓSTICO DE LOGS TELEGRAM ---')
  try {
    const logs = await prisma.nexusLog.findMany({
      where: {
        message: {
          contains: 'Bot Telegram'
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 20
    })

    if (logs.length === 0) {
      console.log('Nenhum log de Telegram encontrado.')
    } else {
      logs.forEach(log => {
        console.log(`[${log.createdAt.toISOString()}] ${log.level}: ${log.message}`)
        if (log.details) console.log(`   Detalhes: ${log.details}`)
      })
    }
  } catch (err) {
    console.error('Erro ao consultar logs:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
