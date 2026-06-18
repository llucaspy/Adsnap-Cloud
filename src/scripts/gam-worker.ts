import '../lib/env'
import { getPrisma } from '../lib/prisma'
import { processPendingGamJobs } from '../lib/gamJobProcessor'

async function main() {
    console.log('[Nexus GAM] Worker dedicado iniciado.')
    const count = await processPendingGamJobs(5, process.env.GAM_JOB_ID || undefined)
    console.log(`[Nexus GAM] Worker finalizado com ${count} job(s) encontrado(s).`)
}

main()
    .catch(error => {
        console.error('[Nexus GAM] Worker interrompido:', error)
        process.exitCode = 1
    })
    .finally(async () => {
        await getPrisma().$disconnect()
    })
