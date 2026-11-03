import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { createSupportStore, SupportError, type SupportIdentity } from './supportStore'
import { getCampaignDateKey, getBrasiliaClock } from './campaignSchedule'

export function createSupportActions(db: PrismaClient, trigger: (ids: string[]) => Promise<boolean>) {
    const store = createSupportStore(db)
    async function confirm(actionId: string, identity: SupportIdentity) {
        await store.liveUser(identity)
        const result = await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "SupportAction" WHERE id = ${actionId} FOR UPDATE`
            const action = await tx.supportAction.findFirst({ where: { id: actionId, turn: { status: 'SUCCESS', conversation: { userId: identity.userId, user: { isActive: true } } } } })
            if (!action) throw new SupportError('Operação não encontrada.', 404)
            if (action.status !== 'PENDING') return { action, campaignIds: [] as string[] }
            const payload = action.payload as { campaignIds?: string[] }
            if (action.type === 'TECHNICAL_REVIEW') {
                const updated = await tx.supportAction.update({ where: { id: action.id }, data: { status: 'REVIEW_REQUIRED' } })
                await tx.nexusLog.create({ data: { level: 'SYSTEM', message: 'Suporte Adsnap: análise técnica solicitada', details: JSON.stringify({ actionId, userId: identity.userId }) } })
                return { action: updated, campaignIds: [] as string[] }
            }
            if (!['RETRY_CAPTURE', 'VERIFIED_PREVIEW'].includes(action.type)) throw new SupportError('Operação não disponível.')
            const ids = [...new Set(payload.campaignIds || [])].sort()
            if (!ids.length || ids.length > 8 || ids.some(id => !/^[a-z0-9-]{8,64}$/i.test(id))) throw new SupportError('Campanhas inválidas.')
            await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`
            const campaigns = await tx.campaign.findMany({ where: { id: { in: ids } } })
            const today = getBrasiliaClock(new Date()).dateKey
            if (campaigns.length !== ids.length || campaigns.some(c => c.isArchived || ['EXPIRED', 'FINISHED', 'PROCESSING'].includes(c.status)
                || ['PAUSADA', 'CANCELADA', 'CONCLUIDA', 'ENCERRADA'].includes(c.adOpsStatus)
                || (c.flightStart && getCampaignDateKey(c.flightStart) > today) || (c.flightEnd && getCampaignDateKey(c.flightEnd) < today))) {
                throw new SupportError('Uma campanha mudou de estado ou está fora de veiculação. Solicite um diagnóstico atualizado.', 409)
            }
            const active = await tx.workerJob.findMany({ where: { campaignId: { in: ids }, type: 'CAPTURE', status: { in: ['QUEUED', 'PROCESSING'] } }, select: { id: true, campaignId: true } })
            if (action.type === 'VERIFIED_PREVIEW') {
                if (active.length || campaigns.some(c => !['FAILED', 'QUARANTINE'].includes(c.status) || !/CREATIVE_NOT_CONFIRMED|SLOT_HAS_NO_CREATIVE/.test(c.lastWorkerError || ''))) throw new SupportError('A prévia controlada exige uma falha atual de confirmação do criativo, sem captura em andamento.', 409)
                for (const c of campaigns) {
                    const url = new URL(c.url)
                    if (url.protocol !== 'https:' || !url.searchParams.has('google_preview') || !/^\d+$/.test(url.searchParams.get('creativeId') || '') || !/^\d+$/.test(url.searchParams.get('lineItemId') || '')) throw new SupportError('Esta campanha não possui um preview GAM compatível.')
                    const composition = c.compositionBox && typeof c.compositionBox === 'object' && !Array.isArray(c.compositionBox) ? c.compositionBox : {}
                    await tx.campaign.update({ where: { id: c.id }, data: { compositionBox: { ...composition, allowVerifiedPackagePreview: true, verifiedPackagePreviewEnabledAt: new Date().toISOString(), supportActionId: action.id } } })
                }
            }
            const existingIds = new Set(active.map(j => j.campaignId))
            const jobs = ids.filter(id => !existingIds.has(id)).map(campaignId => ({ id: randomUUID(), campaignId, type: 'CAPTURE', status: 'QUEUED', priority: 20, maxAttempts: 2, payload: { source: 'support-confirmed', supportActionId: action.id, requestedAt: new Date().toISOString() } }))
            if (jobs.length) {
                await tx.workerJob.createMany({ data: jobs })
                await tx.campaign.updateMany({ where: { id: { in: jobs.map(j => j.campaignId) } }, data: { status: 'QUEUED', lastWorkerError: null } })
            }
            const updated = await tx.supportAction.update({ where: { id: action.id }, data: { status: 'QUEUED', result: { jobIds: [...active.map(j => j.id), ...jobs.map(j => j.id)], pis: [...new Set(campaigns.map(c => c.pi))], queued: ids.length, success: 0, failed: 0 } } })
            await tx.nexusLog.create({ data: { level: 'SYSTEM', message: action.type === 'VERIFIED_PREVIEW' ? 'Suporte Adsnap: prévia modificada autorizada pelo usuário' : 'Suporte Adsnap: reprocessamento autorizado pelo usuário', details: JSON.stringify({ actionId, userId: identity.userId, campaignIds: ids, mode: action.type === 'VERIFIED_PREVIEW' ? 'MODIFIED_PREVIEW' : null }) } })
            return { action: updated, campaignIds: ids }
        }, { maxWait: 10000, timeout: 15000 })
        const dispatched = result.campaignIds.length ? await trigger(result.campaignIds).catch(() => false) : null
        return { action: result.action, dispatched }
    }
    async function refresh(conversationId: string, identity: SupportIdentity) {
        await store.owned(conversationId, identity)
        const actions = await db.supportAction.findMany({ where: { status: 'QUEUED', turn: { conversationId } }, take: 40 })
        for (const action of actions) {
            const result = action.result as { jobIds?: string[]; pis?: string[] } | null
            const jobIds = result?.jobIds || []
            if (!jobIds.length) continue
            const jobs = await db.workerJob.findMany({ where: { id: { in: jobIds } }, select: { status: true } })
            const success = jobs.filter(j => j.status === 'SUCCESS').length
            const failed = jobs.filter(j => ['FAILED', 'CANCELLED'].includes(j.status)).length
            const finished = jobs.length === jobIds.length && success + failed === jobs.length
            await db.supportAction.updateMany({ where: { id: action.id, status: 'QUEUED' }, data: { status: finished ? failed ? 'FAILED' : 'SUCCESS' : 'QUEUED', result: { jobIds, pis: result?.pis || [], queued: jobIds.length, success, failed } } })
        }
    }
    return { confirm, refresh }
}
