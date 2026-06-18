import prisma from './prisma'
import { gamCrawler } from './gamCrawlerService'
import { buildGamImportDraft } from './gamImportPlanner'

const STALE_JOB_MINUTES = 30

function parseOrderUrl(details: string | null) {
    const raw = details || ''
    const parsed = raw.trim().startsWith('{')
        ? JSON.parse(raw) as { orderUrl?: string; url?: string }
        : { orderUrl: raw }
    return parsed.orderUrl || parsed.url || raw
}

export async function processPendingGamJobs(limit = 5) {
    const staleBefore = new Date(Date.now() - STALE_JOB_MINUTES * 60 * 1000)
    const recovered = await prisma.nexusLog.updateMany({
        where: {
            level: 'JOB_GAM_RUNNING',
            createdAt: { lt: staleBefore },
        },
        data: {
            level: 'JOB_GAM_PENDING',
            message: 'Nexus GAM: retomando uma execucao interrompida',
        },
    })

    if (recovered.count > 0) {
        console.log(`[Nexus GAM] ${recovered.count} job(s) interrompido(s) voltaram para a fila.`)
    }

    const jobs = await prisma.nexusLog.findMany({
        where: { level: 'JOB_GAM_PENDING' },
        orderBy: { createdAt: 'asc' },
        take: limit,
    })

    for (const job of jobs) {
        const claim = await prisma.nexusLog.updateMany({
            where: { id: job.id, level: 'JOB_GAM_PENDING' },
            data: {
                level: 'JOB_GAM_RUNNING',
                message: 'Nexus GAM: iniciando o navegador',
            },
        })
        if (claim.count === 0) continue

        try {
            const url = parseOrderUrl(job.details)
            if (!url.startsWith('http')) throw new Error('URL de job invalida')

            const data = await gamCrawler.startIngestion(url, async progress => {
                await prisma.nexusLog.updateMany({
                    where: { id: job.id, level: 'JOB_GAM_RUNNING' },
                    data: { message: `Nexus GAM: ${progress}` },
                })
            })
            const settings = await prisma.settings.findUnique({ where: { id: 1 } })
            const bannerFormats = JSON.parse(settings?.bannerFormats || '[]')
            const draft = buildGamImportDraft(data, bannerFormats)

            if (draft.mediaEntries.length === 0 && draft.blockedItems.length === 0) {
                throw new Error('GAM_RASCUNHO_VAZIO: nenhum formato ou bloqueio foi identificado.')
            }

            await prisma.nexusLog.update({
                where: { id: job.id },
                data: {
                    level: 'JOB_GAM_REVIEW',
                    message: `Rascunho GAM pronto: ${draft.client} (${draft.mediaEntries.length} formato(s), ${draft.blockedItems.length} bloqueado(s))`,
                    details: JSON.stringify(draft),
                },
            })
        } catch (error) {
            console.error('[Nexus GAM] Falha no job:', error)
            await prisma.nexusLog.update({
                where: { id: job.id },
                data: {
                    level: 'JOB_GAM_ERROR',
                    message: `Erro: ${error instanceof Error ? error.message : String(error)}`,
                },
            })
        }
    }

    return jobs.length
}
