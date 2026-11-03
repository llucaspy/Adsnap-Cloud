import type { PrismaClient } from '@prisma/client'
import { parseGamOrderUrl } from './gamOrderUrl'
import { GAM_AUTH_REQUIRED_LEVEL } from './gamJobStatus'

export async function registerGamOrder(db: PrismaClient, value: string, trigger: (jobId: string) => Promise<boolean>, notify: (jobId: string) => Promise<unknown> = async () => {}) {
    const order = parseGamOrderUrl(value)
    if (!order) throw new Error('Envie a URL completa e válida da Order do Google Ad Manager.')
    const result = await db.$transaction(async tx => {
        // All entry points share this lock: browser commands and the Nexus tool cannot duplicate a pending order.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`gam-order:${order.network}:${order.orderId}`}))`
        const jobs = await tx.nexusLog.findMany({ where: { level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW', GAM_AUTH_REQUIRED_LEVEL] }, details: { contains: order.orderId }, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } }, orderBy: { createdAt: 'desc' } })
        const existing = jobs.find(job => {
            try {
                const details = JSON.parse(job.details || '{}')
                const link = parseGamOrderUrl(details.orderUrl || '')
                return link?.url === order.url && (job.level !== 'JOB_GAM_REVIEW' || /^(auto_register|auto-register|autoregister|nexus-order-autoregister)$/i.test(details.mode || ''))
            } catch { return false }
        })
        if (existing) {
            const details = JSON.parse(existing.details || '{}')
            const requested = Date.parse(details.dispatchRequestedAt || '')
            const eligible = existing.level === 'JOB_GAM_PENDING' || (existing.level === 'JOB_GAM_RUNNING' && existing.createdAt.getTime() < Date.now() - 30 * 60000)
            const shouldTrigger = eligible && (!Number.isFinite(requested) || Date.now() - requested > 60000)
            if (shouldTrigger) await tx.nexusLog.update({ where: { id: existing.id }, data: { details: JSON.stringify({ ...details, dispatchRequestedAt: new Date().toISOString() }) } })
            return { job: existing, existing: true, shouldTrigger, authWorkflowUrl: details.authWorkflowUrl || '' }
        }
        const job = await tx.nexusLog.create({ data: { level: 'JOB_GAM_PENDING', message: `Nexus: Order ${order.orderId} recebida para cadastro automático`, details: JSON.stringify({ orderUrl: order.url, orderId: order.orderId, mode: 'AUTO_REGISTER', source: 'nexus-order-registration', requestedSegmentation: 'PRIVADO', requestedCaptureCadence: 'DAILY', dispatchRequestedAt: new Date().toISOString(), executionLogs: [{ at: new Date().toISOString(), message: `Order ${order.orderId} recebida para cadastro automático`, tone: 'info' }] }) } })
        return { job, existing: false, shouldTrigger: true, authWorkflowUrl: '' }
    }, { maxWait: 10000, timeout: 15000 })
    const triggered = result.shouldTrigger ? await trigger(result.job.id).catch(() => false) : false
    if (!result.existing) await notify(result.job.id).catch(() => {})
    return { success: true, existing: result.existing, triggered, jobId: result.job.id, orderId: order.orderId, status: result.job.level, authWorkflowUrl: result.authWorkflowUrl }
}

/** Host-only capability: fixed workflow, configured repository; credentials never enter the model environment. */
export async function dispatchGamImport(jobId: string) {
    const token = process.env.GITHUB_TOKEN
    const repo = (process.env.GITHUB_REPO || '').replace(/^https:\/\/github.com\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '')
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return false
    try {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/gam-import.yml/dispatches`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Adsnap-Nexus' }, body: JSON.stringify({ ref: 'main', inputs: { job_id: jobId } }), signal: AbortSignal.timeout(15000) })
        return response.ok
    } catch { return false }
}
