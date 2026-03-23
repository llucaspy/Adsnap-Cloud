import '../lib/env'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('[Check DB] Testando conexão com o banco de dados...')
    try {
        await prisma.$connect()
        console.log('✅ [Check DB] Conexão estabelecida com sucesso!')
        
        const { nexusLogStore } = await import('../lib/nexusLogStore')
        await nexusLogStore.addLog(`Nexus: Check-DB iniciado no GitHub Runner. Status: ${process.env.GITHUB_ACTIONS === 'true' ? 'CI' : 'LOCAL'}`, 'INFO')

        const count = await prisma.campaign.count()
        console.log(`✅ [Check DB] Banco de dados acessível. ${count} campanhas encontradas.`)
    } catch (err) {
        console.error('❌ [Check DB] Falha na conexão:', err)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

main()
