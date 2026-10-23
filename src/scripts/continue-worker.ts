import '../lib/env'
import prisma from '../lib/prisma'
import { pendingCaptureCampaignIds, dispatchWorkerContinuation } from '../lib/workerContinuation'

async function main() {
    const scope = (process.env.TARGET_CAMPAIGN_IDS || '').split(',').map(id => id.trim()).filter(Boolean)
    const ids = await pendingCaptureCampaignIds(prisma, scope)
    const dispatched = await dispatchWorkerContinuation({ ids, scope,
        repository: process.env.GITHUB_REPOSITORY || '', token: process.env.WORKER_DISPATCH_TOKEN || '',
        ref: process.env.GITHUB_REF_NAME || '', depth: Number(process.env.CONTINUATION_DEPTH || 0),
    })
    console.log(`[Nexus Worker] ${ids.length} campanha(s) pendente(s); retomada ${dispatched ? 'solicitada' : 'desnecessaria'}.`)
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Falha na retomada'); process.exitCode = 1 })
    .finally(() => prisma.$disconnect())
