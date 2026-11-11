import '../lib/env'
import { getPrisma } from '../lib/prisma'
import { GAM_ERROR_LEVEL, GAM_PENDING_LEVEL, GAM_RUNNING_LEVEL } from '../lib/gamJobStatus'

async function main() {
    if (process.argv.includes('--record-workflow-failure')) {
        const id = process.env.GAM_JOB_ID
        const runId = process.env.GITHUB_RUN_ID
        if (!id || !runId) throw new Error('Importação e execução devem ser identificadas.')
        const db = getPrisma()
        const job = await db.nexusLog.findUnique({ where: { id } })
        if (!job || ![GAM_PENDING_LEVEL, GAM_RUNNING_LEVEL].includes(job.level)) return

        const raw = job.details || ''
        const details = raw.trim().startsWith('{') ? JSON.parse(raw) : { orderUrl: raw }
        if (job.level === GAM_RUNNING_LEVEL && details.workflowRunId !== runId) return

        const message = 'O worker de cadastro foi interrompido. Tente cadastrar a Order novamente.'
        const executionLogs = Array.isArray(details.executionLogs) ? details.executionLogs : []
        await db.nexusLog.updateMany({
            where: { id, level: job.level, details: job.details },
            data: {
                level: GAM_ERROR_LEVEL,
                message,
                details: JSON.stringify({
                    ...details,
                    executionLogs: [...executionLogs, { at: new Date().toISOString(), message, tone: 'error' }].slice(-100),
                }),
            },
        })
        return
    }

    const { processPendingGamJobs } = await import('../lib/gamJobProcessor')
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
