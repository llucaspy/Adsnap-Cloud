import type { PrismaClient } from '@prisma/client'
import type { GamImportDraft } from './gamImportPlanner'
import { createCampaignsFromGamDraft } from './gamImportWriter'
import { orderRegistrationPolicy } from './gamRegistrationPolicy'

function validDate(value: string | null) {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}

/** Campaigns and the completed job commit together; cancelling a job cannot save campaigns afterwards. */
export async function finalizeAutomaticGamOrder(db: PrismaClient, jobId: string, inferred: GamImportDraft) {
    return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "NexusLog" WHERE id = ${jobId} FOR UPDATE`
        const job = await tx.nexusLog.findUnique({ where: { id: jobId } })
        if (!job || job.level !== 'JOB_GAM_RUNNING') throw new Error('GAM_JOB_CANCELLED')
        const details = JSON.parse(job.details || '{}')
        const policy = orderRegistrationPolicy(details.requestedSegmentation || 'PRIVADO')
        const draft: GamImportDraft = { ...inferred, ...policy, pi: details.requestedPi || inferred.pi, isScheduled: true, scheduledTimes: inferred.scheduledTimes || '["08:00","18:00"]' }
        if (!validDate(draft.flightStart) || !validDate(draft.flightEnd) || draft.flightStart! > draft.flightEnd!) throw new Error('GAM_PERIODO_INVALIDO: informe início e fim válidos antes de ativar a captura automática.')
        const writeResult = await createCampaignsFromGamDraft(tx, draft)
        const saved = writeResult.campaignIds.length > 0 && writeResult.blocked === 0
        const level = saved ? 'JOB_GAM_SAVED' : 'JOB_GAM_REVIEW'
        const completedDetails = { ...details, ...draft, mode: 'AUTO_REGISTER', requestedPi: draft.pi, requestedSegmentation: policy.segmentation, requestedCaptureCadence: policy.captureCadence, autoRegisterResult: writeResult, automaticallySaved: saved,
            executionLogs: [...(Array.isArray(details.executionLogs) ? details.executionLogs : []), { at: new Date().toISOString(), message: saved ? `Campanhas salvas e agendadas automaticamente (${policy.segmentation}, ${policy.captureCadence})` : `Campanhas válidas salvas; ${writeResult.blocked} item(ns) precisam de correção`, tone: saved ? 'success' : 'info' }].slice(-100) }
        await tx.nexusLog.update({ where: { id: jobId }, data: { level, message: saved ? `Cadastro GAM salvo: ${draft.client} (${writeResult.created} criada(s), ${writeResult.skipped} existente(s))` : `Cadastro GAM parcial: ${draft.client} (${writeResult.blocked} item(ns) pendente(s))`, details: JSON.stringify(completedDetails) } })
        return { draft, writeResult, completedDetails, level, saved }
    }, { maxWait: 10000, timeout: 20000 })
}
