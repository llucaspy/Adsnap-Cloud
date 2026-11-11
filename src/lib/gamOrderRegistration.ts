import type { PrismaClient } from '@prisma/client'
import prisma from './prisma'
import { dispatchGamWorkflow, reconcileGamJob } from './gamWorkflow'
import { parseGamOrderUrl } from './gamOrderUrl'
import { GAM_AUTH_REQUIRED_LEVEL } from './gamJobStatus'
import { orderRegistrationPolicy, type OrderCampaignType } from './gamRegistrationPolicy'

export async function registerGamOrder(db: PrismaClient, value: string, trigger: (jobId: string) => Promise<boolean>, notify: (jobId: string) => Promise<unknown> = async () => {}, campaignType: OrderCampaignType = 'PRIVADO') {
    if (!['PRIVADO', 'GOV_FEDERAL'].includes(campaignType)) throw new Error('Tipo de campanha inválido.')
    const policy = orderRegistrationPolicy(campaignType)
    const order = parseGamOrderUrl(value)
    if (!order) throw new Error('Envie a URL completa e válida da Order do Google Ad Manager.')
    const active = await db.nexusLog.findMany({
        where: { level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING'] }, details: { contains: order.orderId } },
        orderBy: { createdAt: 'desc' }, take: 10,
    })
    await Promise.all(active.map(job => reconcileGamJob(db, job)))
    const result = await db.$transaction(async tx => {
        // All entry points share this lock: browser commands and the Nexus tool cannot duplicate a pending order.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gam-order:${order.network}:${order.orderId}`}))`
        const jobs = await tx.nexusLog.findMany({ where: { level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW', 'JOB_GAM_SAVED', GAM_AUTH_REQUIRED_LEVEL] }, details: { contains: order.orderId }, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, orderBy: { createdAt: 'desc' } })
        const existing = jobs.find(job => {
            try {
                const details = JSON.parse(job.details || '{}')
                const link = parseGamOrderUrl(details.orderUrl || '')
                return link?.url === order.url
            } catch { return false }
        })
        if (existing) {
            await tx.$queryRaw`SELECT id FROM "NexusLog" WHERE id = ${existing.id} FOR UPDATE`
            const current = await tx.nexusLog.findUniqueOrThrow({ where: { id: existing.id } })
            const details = JSON.parse(current.details || '{}')
            const previousPolicy = orderRegistrationPolicy(details.requestedSegmentation || details.segmentation)
            const different = previousPolicy.segmentation !== policy.segmentation || previousPolicy.captureCadence !== policy.captureCadence
            if (different && current.level === 'JOB_GAM_RUNNING') throw new Error('Esta Order já está em processamento com outro tipo de campanha. Aguarde a conclusão antes de solicitar a mudança.')
            const requeue = current.level === 'JOB_GAM_REVIEW' || (current.level === 'JOB_GAM_SAVED' && different)
            const requested = Date.parse(details.dispatchRequestedAt || '')
            const eligible = requeue || current.level === 'JOB_GAM_PENDING'
            const shouldTrigger = eligible && (requeue || !Number.isFinite(requested) || Date.now() - requested > 60000)
            const updated = current.level !== 'JOB_GAM_SAVED' || requeue ? await tx.nexusLog.update({ where: { id: current.id }, data: { ...(requeue ? { level: 'JOB_GAM_PENDING' } : {}), details: JSON.stringify({ ...details, mode: 'AUTO_REGISTER', requestedSegmentation: policy.segmentation, requestedCaptureCadence: policy.captureCadence, ...(shouldTrigger ? { dispatchRequestedAt: new Date().toISOString() } : {}) }) } }) : current
            return { job: updated, existing: true, shouldTrigger, authWorkflowUrl: details.authWorkflowUrl || '' }
        }
        const job = await tx.nexusLog.create({ data: { level: 'JOB_GAM_PENDING', message: `Nexus: Order ${order.orderId} recebida para cadastro automático`, details: JSON.stringify({ orderUrl: order.url, orderId: order.orderId, mode: 'AUTO_REGISTER', source: 'nexus-order-registration', requestedSegmentation: policy.segmentation, requestedCaptureCadence: policy.captureCadence, dispatchRequestedAt: new Date().toISOString(), executionLogs: [{ at: new Date().toISOString(), message: `Order ${order.orderId} recebida para cadastro automático (${policy.segmentation}, ${policy.captureCadence})`, tone: 'info' }] }) } })
        return { job, existing: false, shouldTrigger: true, authWorkflowUrl: '' }
    }, { maxWait: 10000, timeout: 15000 })
    const triggered = result.shouldTrigger ? await trigger(result.job.id).catch(() => false) : false
    if (!result.existing) await notify(result.job.id).catch(() => {})
    const current = result.shouldTrigger && !triggered ? await db.nexusLog.findUnique({ where: { id: result.job.id } }) : result.job
    return { success: true, existing: result.existing, triggered, jobId: result.job.id, orderId: order.orderId, status: current?.level || result.job.level, authWorkflowUrl: result.authWorkflowUrl }
}

/** Host-only capability: fixed workflow, configured repository; credentials never enter the model environment. */
export async function dispatchGamImport(jobId: string) {
    return dispatchGamWorkflow(prisma, jobId)
}
