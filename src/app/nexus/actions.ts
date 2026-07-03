'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { nexusLogStore } from '@/lib/nexusLogStore'
import type { GamImportDraft } from '@/lib/gamImportPlanner'
import type { GamImportWriteResult } from '@/lib/gamImportWriter'
import { triggerGamWorker } from '@/app/actions'

type NexusOrderDetails = Partial<GamImportDraft> & {
    orderUrl?: string
    orderId?: string
    mode?: string
    source?: string
    autoRegisterResult?: GamImportWriteResult
    notifications?: {
        reviewUrl?: string
        telegram?: boolean
        email?: boolean
    }
    executionLogs?: Array<{ at: string; message: string; tone: 'info' | 'success' | 'error' }>
}

function readDetails(details: string | null): NexusOrderDetails {
    const raw = details || ''
    if (!raw.trim().startsWith('{')) return { orderUrl: raw }

    try {
        return JSON.parse(raw) as NexusOrderDetails
    } catch {
        return { orderUrl: raw }
    }
}

function normalizeOrderUrl(value: string) {
    const url = value.trim()

    if (!/^https:\/\/admanager\.google\.com\/.+order_id=\d+/i.test(url)) {
        throw new Error('Cole um link valido de Order do Google Ad Manager.')
    }

    return url
}

function getOrderId(url: string) {
    return url.match(/order_id=(\d+)/i)?.[1] || 'Unknown'
}

function isAutoRegisterMode(mode?: string) {
    const normalized = (mode || '').trim().toLowerCase()
    return normalized === 'auto_register'
        || normalized === 'auto-register'
        || normalized === 'autoregister'
        || normalized === 'nexus-order-autoregister'
}

export async function submitNexusOrderLink(orderUrl: string) {
    const url = normalizeOrderUrl(orderUrl)
    const orderId = getOrderId(url)
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const recentJobs = await prisma.nexusLog.findMany({
        where: {
            level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW'] },
            createdAt: { gte: recentCutoff },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })
    const existingJob = recentJobs.find(job => {
        const details = readDetails(job.details)
        const sameOrder = details.orderId === orderId || details.orderUrl?.includes(`order_id=${orderId}`)
        if (!sameOrder) return false
        if (job.level === 'JOB_GAM_REVIEW') return isAutoRegisterMode(details.mode)
        return true
    })

    if (existingJob) {
        const shouldTrigger = existingJob.level === 'JOB_GAM_PENDING' || existingJob.level === 'JOB_GAM_RUNNING'
        const triggered = shouldTrigger ? await triggerGamWorker(existingJob.id) : false

        revalidatePath('/nexus')
        revalidatePath('/campaigns')
        return {
            success: true,
            existing: true,
            triggered,
            jobId: existingJob.id,
            orderId,
            status: existingJob.level,
        }
    }

    const job = await prisma.nexusLog.create({
        data: {
            level: 'JOB_GAM_PENDING',
            message: `Nexus V2: Order ${orderId} recebida para cadastro automatico`,
            details: JSON.stringify({
                orderUrl: url,
                orderId,
                mode: 'AUTO_REGISTER',
                source: 'nexus-v2-order-link',
                executionLogs: [{
                    at: new Date().toISOString(),
                    message: `Order ${orderId} recebida pelo Nexus V2`,
                    tone: 'info',
                }],
            } satisfies NexusOrderDetails),
        },
    })

    const triggered = await triggerGamWorker(job.id)
    if (!triggered) {
        await nexusLogStore.addLog(
            `Nexus V2: Order ${orderId} entrou na fila, mas o worker nao foi disparado automaticamente.`,
            'INFO',
            JSON.stringify({ jobId: job.id, orderId }),
        )
    }

    revalidatePath('/nexus')
    revalidatePath('/campaigns')
    return {
        success: true,
        existing: false,
        triggered,
        jobId: job.id,
        orderId,
        status: job.level,
    }
}

export async function getNexusOrderJobs() {
    const jobs = await prisma.nexusLog.findMany({
        where: {
            level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW', 'JOB_GAM_ERROR', 'JOB_GAM_CANCELLED'] },
        },
        orderBy: { createdAt: 'desc' },
        take: 12,
    })

    return jobs.map(job => {
        const details = readDetails(job.details)
        return {
            id: job.id,
            level: job.level,
            message: job.message,
            createdAt: job.createdAt.toISOString(),
            orderId: details.orderId || details.orderUrl?.match(/order_id=(\d+)/i)?.[1] || '',
            orderUrl: details.orderUrl || '',
            client: details.client || '',
            campaignName: details.campaignName || '',
            pi: details.pi || '',
            formats: details.mediaEntries?.length || 0,
            blocked: details.blockedItems?.length || 0,
            autoRegisterResult: details.autoRegisterResult || null,
            notifications: details.notifications || null,
            executionLogs: details.executionLogs || [],
        }
    })
}
