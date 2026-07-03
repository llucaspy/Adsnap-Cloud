'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { nexusLogStore } from '@/lib/nexusLogStore'
import type { GamImportDraft } from '@/lib/gamImportPlanner'
import { createCampaignsFromGamDraft as writeCampaignsFromGamDraft } from '@/lib/gamImportWriter'
import { normalizeCaptureCadence, type CaptureCadence } from '@/lib/governmentReportScope'
import { normalizeCaptureDelaySeconds } from '@/lib/captureTiming'
import { enqueueCaptureJobs, isWorkerJobStorageMissing } from '@/lib/workerJobs'

export async function getNexusActivity() {
    try {
        const logs = await prisma.nexusLog.findMany({
            take: 50,
            orderBy: { createdAt: 'desc' }
        });

        return logs.map(log => ({
            id: log.id,
            message: log.message,
            type: log.level,
            timestamp: log.createdAt.getTime(),
            details: (log as any).details || null
        })).reverse(); // Reverse to show chronological order in the feed
    } catch (error) {
        console.error('[Actions] Failed to fetch nexus activity:', error);
        return [];
    }
}


export async function runCapture(campaignId: string) {
    // On Vercel, we only queue. The GitHub worker will do the actual capture.
    const queueResult = await enqueueCaptureJobs([campaignId], {
        source: 'manual-single',
        priority: 20,
        allowTerminalStatuses: true,
    })

    nexusLogStore.addLog(
        `Nexus: Campanha individual enfileirada.`,
        'SYSTEM',
        JSON.stringify(queueResult)
    )

    // Attempt to trigger worker immediately
    const triggered = await triggerNexusWorker([campaignId])
    if (!triggered) {
        nexusLogStore.addLog('Nexus: Worker não disparado (verifique GITHUB_TOKEN e GITHUB_REPO)', 'ERROR')
    }

    revalidatePath('/')
    return { success: true, message: 'Capture queued for GitHub Worker' }
}

export async function runCaptureBatch(campaignIds: string[]) {
    if (!campaignIds || campaignIds.length === 0) return { success: true, count: 0 }

    console.log(`[Nexus] Enfileirando lote de ${campaignIds.length} capturas...`)

    const queueResult = await enqueueCaptureJobs(campaignIds, {
        source: 'manual-batch',
        priority: 15,
        allowTerminalStatuses: true,
    })

    nexusLogStore.addLog(
        `Nexus: Lote de ${campaignIds.length} campanhas enfileirado via interface.`,
        'SYSTEM',
        JSON.stringify(queueResult)
    )

    // Trigger GitHub Worker ONCE
    const triggered = await triggerNexusWorker(campaignIds)
    if (!triggered) {
        nexusLogStore.addLog('Nexus: Worker não disparado no lote (verifique chaves)', 'ERROR')
    }

    revalidatePath('/')
    revalidatePath('/monitoring')
    return { success: true, count: campaignIds.length }
}

export async function updateCampaignsCaptureDelay(campaignIds: string[], captureDelaySecondsInput: number) {
    const ids = Array.from(new Set(
        (campaignIds || []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    ))

    if (ids.length === 0) {
        throw new Error('Nenhuma campanha selecionada para atualizar o tempo do print')
    }

    const captureDelaySeconds = normalizeCaptureDelaySeconds(captureDelaySecondsInput)

    const result = await prisma.campaign.updateMany({
        where: { id: { in: ids } },
        data: { captureDelaySeconds }
    })

    await nexusLogStore.addLog(
        `Nexus: Tempo de espera do print atualizado para ${captureDelaySeconds}s em ${result.count} formato(s).`,
        'SYSTEM',
        undefined,
        ids.length === 1 ? ids[0] : undefined
    )

    revalidatePath('/')
    revalidatePath('/monitoring')
    return { success: true, count: result.count, captureDelaySeconds }
}

export async function getCampaignDetailsByPi(pi: string) {
    const campaign = await prisma.campaign.findFirst({
        where: { pi },
        orderBy: { createdAt: 'desc' },
        select: {
            agency: true,
            client: true,
            campaignName: true,
            format: true,
            url: true,
            device: true,
            segmentation: true,
            captureCadence: true,
            captureDelaySeconds: true,
            flightStart: true,
            flightEnd: true
        }
    })
    return campaign
}

export async function createCampaign(formData: FormData) {
    const agency = formData.get('agency') as string
    const client = formData.get('client') as string
    const campaignName = formData.get('campaignName') as string
    const pi = formData.get('pi') as string
    const format = formData.get('format') as string
    const url = formData.get('url') as string
    const device = (formData.get('device') as string) || 'desktop'
    const segmentation = (formData.get('segmentation') as string) || 'PRIVADO'
    const captureCadence = normalizeCaptureCadence(segmentation, formData.get('captureCadence') as string | null)
    const captureDelaySeconds = normalizeCaptureDelaySeconds(formData.get('captureDelaySeconds'))

    // Flight dates
    const flightStartStr = formData.get('flightStart') as string
    const flightEndStr = formData.get('flightEnd') as string
    const flightStart = flightStartStr ? new Date(flightStartStr) : null
    const flightEnd = flightEndStr ? new Date(flightEndStr) : null

    // Scheduling fields - now supports multiple times
    const isScheduled = formData.get('isScheduled') === 'true'
    const scheduledTimesStr = formData.get('scheduledTimes') as string
    const scheduledTimes = scheduledTimesStr || '[]'

    if (!agency || !client || !pi || !format || !url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.create({
        data: {
            agency,
            client,
            campaignName,
            pi,
            format,
            url,
            device,
            segmentation,
            captureCadence,
            captureDelaySeconds,
            flightStart,
            flightEnd,
            status: 'PENDING',
            isScheduled,
            scheduledTimes,
        },
    })

    revalidatePath('/')
    return campaign
}

export async function createMultipleCampaigns(payload: {
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    captureCadence: CaptureCadence
    captureDelaySeconds?: number
    flightStart: string | null
    flightEnd: string | null
    isScheduled: boolean
    scheduledTimes: string
    mediaEntries: {
        url: string
        device: string
        format: string
        externalChannelId?: string
        isMultiChannel?: boolean
        allowedChannels?: string
        externalCampaignId?: string
        externalAuthUrl?: string
        creativeAssetUrl?: string
    }[]
}) {
    const {
        agency, client, campaignName, pi, segmentation, captureCadence,
        captureDelaySeconds,
        flightStart: flightStartStr, flightEnd: flightEndStr,
        isScheduled, scheduledTimes, mediaEntries
    } = payload

    if (!agency || !client || !pi || mediaEntries.length === 0) {
        throw new Error('Dados da campanha e pelo menos um formato são obrigatórios')
    }

    const flightStart = flightStartStr ? new Date(`${flightStartStr}T00:00:00-03:00`) : null
    const flightEnd = flightEndStr ? new Date(`${flightEndStr}T23:59:59.999-03:00`) : null

    const results = []

    for (const entry of mediaEntries) {
        if (!entry.url || !entry.format) continue

        const campaign = await prisma.campaign.create({
            data: {
                agency,
                client,
                campaignName,
                pi,
                format: entry.format,
                url: entry.url,
                device: entry.device || 'desktop',
                segmentation,
                captureCadence: normalizeCaptureCadence(segmentation, captureCadence),
                captureDelaySeconds: normalizeCaptureDelaySeconds(captureDelaySeconds),
                flightStart,
                flightEnd,
                status: 'PENDING',
                isScheduled,
                scheduledTimes,
                externalChannelId: entry.externalChannelId || null,
                isMultiChannel: entry.isMultiChannel || false,
                allowedChannels: entry.allowedChannels || '[]',
                externalCampaignId: entry.externalCampaignId || null,
                externalAuthUrl: entry.externalAuthUrl || null,
                compositionBox: entry.creativeAssetUrl ? { creativeAssetUrl: entry.creativeAssetUrl } : undefined,
                showOnDashboard: true,
            },
        })
        results.push(campaign)
    }

    revalidatePath('/')
    revalidatePath('/monitoring')
    revalidatePath('/adops')
    return { success: true, count: results.length }
}

export async function createCampaignsFromGamDraftAction(draft: GamImportDraft, jobId?: string) {
    const result = await writeCampaignsFromGamDraft(prisma, draft)

    if (jobId) {
        await prisma.nexusLog.deleteMany({
            where: { id: jobId, level: 'JOB_GAM_REVIEW' },
        })
    }

    await nexusLogStore.addLog(
        `Nexus GAM: ${result.created} campanha(s) criada(s), ${result.skipped} duplicada(s), ${result.blocked} bloqueada(s).`,
        result.blocked > 0 ? 'INFO' : 'SUCCESS',
        JSON.stringify({ orderId: draft.orderId, campaignIds: result.campaignIds })
    )

    revalidatePath('/')
    revalidatePath('/campaigns')
    revalidatePath('/monitoring')
    revalidatePath('/adops')

    return { success: true, ...result }
}

export async function requestGamImportDraft(input: {
    orderUrl: string
    pi: string
    segmentation: string
    captureCadence: CaptureCadence
}) {
    const url = input.orderUrl.trim()
    const requestedPi = input.pi.trim()
    const requestedSegmentation = input.segmentation.trim()
    const requestedCaptureCadence = normalizeCaptureCadence(requestedSegmentation, input.captureCadence)

    if (!/^https:\/\/admanager\.google\.com\/.+order_id=\d+/i.test(url)) {
        throw new Error('Informe um link de Order valido do Google Ad Manager.')
    }
    if (!/^\d{3,8}$/.test(requestedPi)) {
        throw new Error('Informe um PI valido com 3 a 8 numeros.')
    }

    const standardSegmentations = ['GOV_FEDERAL', 'GOV_ESTADUAL', 'PRIVADO']
    const isCustomSegmentation = /^OUTRO:\s*\S.+$/i.test(requestedSegmentation)
    if (!standardSegmentations.includes(requestedSegmentation) && !isCustomSegmentation) {
        throw new Error('Selecione uma segmentacao ou descreva a opcao Outro.')
    }

    const orderId = url.match(/order_id=(\d+)/i)?.[1] || 'Unknown'

    const activeJobs = await prisma.nexusLog.findMany({
        where: { level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
    })
    const existingJob = activeJobs.find(job => {
        try {
            const details = JSON.parse(job.details || '{}') as { orderUrl?: string; orderId?: string }
            return details.orderId === orderId || details.orderUrl?.includes(`order_id=${orderId}`)
        } catch {
            return false
        }
    })

    if (existingJob) {
        const existingDetails = JSON.parse(existingJob.details || '{}') as {
            requestedPi?: string
            requestedSegmentation?: string
            requestedCaptureCadence?: CaptureCadence
        }
        if (
            (existingDetails.requestedPi && existingDetails.requestedPi !== requestedPi)
            || (existingDetails.requestedSegmentation && existingDetails.requestedSegmentation !== requestedSegmentation)
            || (existingDetails.requestedCaptureCadence && existingDetails.requestedCaptureCadence !== requestedCaptureCadence)
        ) {
            throw new Error(`Esta Order ja esta em processamento com o PI ${existingDetails.requestedPi || 'informado anteriormente'}.`)
        }
        const staleRunningJob = existingJob.level === 'JOB_GAM_RUNNING'
            && existingJob.createdAt.getTime() < Date.now() - 30 * 60 * 1000
        const triggered = existingJob.level === 'JOB_GAM_PENDING' || staleRunningJob
            ? await triggerGamWorker(existingJob.id)
            : true
        return { success: true, orderId, triggered, existing: true, jobId: existingJob.id }
    }

    const job = await prisma.nexusLog.create({
        data: {
            level: 'JOB_GAM_PENDING',
            message: `Nexus GAM: rascunho solicitado para Order ${orderId}`,
            details: JSON.stringify({
                orderUrl: url,
                orderId,
                mode: 'draft',
                requestedPi,
                requestedSegmentation,
                requestedCaptureCadence,
                executionLogs: [{
                    at: new Date().toISOString(),
                    message: `Order ${orderId} vinculada ao PI ${requestedPi} (${requestedSegmentation}, ${requestedCaptureCadence})`,
                    tone: 'info',
                }],
            }),
        },
    })

    const triggered = await triggerGamWorker(job.id)
    if (!triggered) {
        await nexusLogStore.addLog('Nexus GAM: rascunho enfileirado, mas worker nao foi disparado automaticamente.', 'INFO')
    }

    revalidatePath('/campaigns')
    return { success: true, orderId, triggered, existing: false, jobId: job.id }
}

export async function getGamImportDrafts() {
    const logs = await prisma.nexusLog.findMany({
        where: { level: { in: ['JOB_GAM_REVIEW', 'JOB_GAM_ERROR', 'JOB_GAM_RUNNING', 'JOB_GAM_PENDING', 'JOB_GAM_CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 10,
    })

    return logs.map(log => {
        let draft: GamImportDraft | null = null
        let orderUrl = ''
        let orderId = ''
        let requestedPi = ''
        let requestedSegmentation = ''
        let requestedCaptureCadence: CaptureCadence = 'DAILY'
        let executionLogs: Array<{ at: string; message: string; tone: 'info' | 'success' | 'error' }> = []
        try {
            if (log.details) {
                const details = JSON.parse(log.details) as GamImportDraft & {
                    orderUrl?: string
                    orderId?: string
                    requestedPi?: string
                    requestedSegmentation?: string
                    requestedCaptureCadence?: CaptureCadence
                    executionLogs?: Array<{ at: string; message: string; tone: 'info' | 'success' | 'error' }>
                }
                orderUrl = details.orderUrl || ''
                orderId = details.orderId || details.orderUrl?.match(/order_id=(\d+)/i)?.[1] || ''
                requestedPi = details.requestedPi || details.pi || ''
                requestedSegmentation = details.requestedSegmentation || details.segmentation || ''
                requestedCaptureCadence = normalizeCaptureCadence(
                    requestedSegmentation,
                    details.requestedCaptureCadence || details.captureCadence,
                )
                executionLogs = details.executionLogs || []
                if (log.level === 'JOB_GAM_REVIEW') draft = details
            }
        } catch {
            draft = null
        }

        return {
            id: log.id,
            level: log.level,
            message: log.message,
            createdAt: log.createdAt.toISOString(),
            orderId,
            orderUrl,
            requestedPi,
            requestedSegmentation,
            requestedCaptureCadence,
            executionLogs,
            draft,
        }
    })
}

export async function deleteGamImportDraft(jobId: string) {
    const job = await prisma.nexusLog.findUnique({ where: { id: jobId } })
    if (!job || !job.level.startsWith('JOB_GAM_')) return { success: true }
    if (job.level === 'JOB_GAM_PENDING' || job.level === 'JOB_GAM_RUNNING') {
        throw new Error('Encerre o worker antes de excluir este rascunho.')
    }

    await prisma.nexusLog.delete({ where: { id: jobId } })
    revalidatePath('/campaigns')
    return { success: true }
}

export async function cancelGamImportJob(jobId: string) {
    const job = await prisma.nexusLog.findUnique({ where: { id: jobId } })
    if (!job || !['JOB_GAM_PENDING', 'JOB_GAM_RUNNING'].includes(job.level)) {
        return { success: true, cancelledRun: false }
    }

    let details: Record<string, unknown> = {}
    try {
        details = JSON.parse(job.details || '{}') as Record<string, unknown>
    } catch {
        details = { orderUrl: job.details || '' }
    }
    const executionLogs = Array.isArray(details.executionLogs) ? details.executionLogs : []
    details.executionLogs = [
        ...executionLogs,
        { at: new Date().toISOString(), message: 'Execucao encerrada pelo usuario', tone: 'error' },
    ].slice(-100)

    await prisma.nexusLog.update({
        where: { id: jobId },
        data: {
            level: 'JOB_GAM_CANCELLED',
            message: 'Nexus GAM: execucao encerrada pelo usuario',
            details: JSON.stringify(details),
        },
    })

    const cancelledRun = await cancelGamWorkflowRun(jobId)
    revalidatePath('/campaigns')
    return { success: true, cancelledRun }
}

export async function archiveCampaign(id: string, isArchived: boolean = true) {
    await prisma.campaign.update({
        where: { id },
        data: { isArchived }
    })
    revalidatePath('/')
}

export async function deleteCampaign(id: string) {
    await prisma.campaign.delete({
        where: { id }
    })
    revalidatePath('/')
}

export async function updateCampaign(id: string, formData: FormData) {
    const agency = formData.get('agency') as string
    const client = formData.get('client') as string
    const campaignName = formData.get('campaignName') as string
    const pi = formData.get('pi') as string
    const format = formData.get('format') as string
    const url = formData.get('url') as string
    const device = (formData.get('device') as string) || 'desktop'
    const segmentation = (formData.get('segmentation') as string) || 'PRIVADO'
    const captureDelaySeconds = formData.has('captureDelaySeconds')
        ? normalizeCaptureDelaySeconds(formData.get('captureDelaySeconds'))
        : null

    // Flight dates
    const flightStartStr = formData.get('flightStart') as string
    const flightEndStr = formData.get('flightEnd') as string
    const flightStart = flightStartStr ? new Date(flightStartStr) : null
    const flightEnd = flightEndStr ? new Date(flightEndStr) : null

    // Scheduling fields - now supports multiple times
    const isScheduled = formData.get('isScheduled') === 'true'
    const scheduledTimesStr = formData.get('scheduledTimes') as string
    const scheduledTimes = scheduledTimesStr || '[]'

    if (!agency || !client || !pi || !format || !url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.update({
        where: { id },
        data: {
            agency,
            client,
            campaignName,
            pi,
            format,
            url,
            device,
            segmentation,
            ...(captureDelaySeconds ? { captureDelaySeconds } : {}),
            flightStart,
            flightEnd,
            isScheduled,
            scheduledTimes,
            externalAuthUrl: formData.get('externalAuthUrl') as string | null,
            externalCampaignId: formData.get('externalCampaignId') as string | null,
            externalChannelId: formData.get('externalChannelId') as string | null,
            isMonitoringActive: formData.get('isMonitoringActive') === 'true',
            manualDashboardUrl: formData.get('manualDashboardUrl') as string | null,
            dailyGoalThreshold: formData.get('dailyGoalThreshold') ? Number(formData.get('dailyGoalThreshold')) : null,
            showOnDashboard: formData.get('showOnDashboard') === 'true',
            isMultiChannel: formData.get('isMultiChannel') === 'true',
            allowedChannels: formData.get('allowedChannels') as string | null,
        },
    })

    revalidatePath('/')
    revalidatePath('/monitoring')
    revalidatePath('/adops')
    return campaign
}

export async function addFormatToCampaign(data: {
    agency: string
    client: string
    campaignName: string
    pi: string
    segmentation: string
    captureCadence?: CaptureCadence
    captureDelaySeconds?: number | null
    url: string
    device: string
    format: string
    flightStart: string | null
    flightEnd: string | null
    isScheduled: boolean
    scheduledTimes: string
    dailyGoalThreshold?: number | null
}) {
    if (!data.agency || !data.client || !data.pi || !data.format || !data.url) {
        throw new Error('Todos os campos são obrigatórios')
    }

    const campaign = await prisma.campaign.create({
        data: {
            agency: data.agency,
            client: data.client,
            campaignName: data.campaignName,
            pi: data.pi,
            format: data.format,
            url: data.url,
            device: data.device || 'desktop',
            segmentation: data.segmentation || 'PRIVADO',
            captureCadence: normalizeCaptureCadence(data.segmentation || 'PRIVADO', data.captureCadence),
            captureDelaySeconds: normalizeCaptureDelaySeconds(data.captureDelaySeconds),
            flightStart: data.flightStart ? new Date(data.flightStart) : null,
            flightEnd: data.flightEnd ? new Date(data.flightEnd) : null,
            status: 'PENDING',
            isScheduled: data.isScheduled || false,
            scheduledTimes: data.scheduledTimes || '[]',
            externalAuthUrl: (data as any).externalAuthUrl || null,
            externalCampaignId: (data as any).externalCampaignId || null,
            externalChannelId: (data as any).externalChannelId || null,
            isMonitoringActive: (data as any).isMonitoringActive || false,
            manualDashboardUrl: (data as any).manualDashboardUrl || null,
            dailyGoalThreshold: data.dailyGoalThreshold || null,
            showOnDashboard: (data as any).showOnDashboard !== false,
            isMultiChannel: (data as any).isMultiChannel || false,
            allowedChannels: (data as any).allowedChannels || '[]',
        },
    })

    revalidatePath('/')
    revalidatePath('/monitoring')
    revalidatePath('/adops')
    return campaign
}

// Get schedule usage stats for UI display
export async function getScheduleUsage(): Promise<Record<string, number>> {
    const campaigns = await prisma.campaign.findMany({
        where: {
            isScheduled: true,
            isArchived: false
        },
        select: { scheduledTimes: true as any }
    })

    const usage: Record<string, number> = {}

    for (const campaign of campaigns) {
        try {
            const times = JSON.parse((campaign as any).scheduledTimes) as string[]
            for (const time of times) {
                usage[time] = (usage[time] || 0) + 1
            }
        } catch {
            // Ignore invalid JSON
        }
    }

    return usage
}

export async function getQueueStatus() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            status: { in: ['QUEUED', 'PROCESSING', 'AUTOCONFIG'] },
            isArchived: false
        },
        select: {
            id: true,
            client: true,
            status: true,
            campaignName: true as any,
            updatedAt: true,
            lastWorkerError: true,
        },
        orderBy: { updatedAt: 'asc' },
        take: 25,
    }) as any
    return campaigns
}

export async function runAllCaptures() {
    console.log('[Nexus] Starting manual global capture process...')

    // Generate BRT-normalized "today" at 00:00 UTC for consistent date comparison
    const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brtNow = new Date(brtNowStr);
    const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));

    // Find only campaigns currently in their airing period
    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            status: { notIn: ['EXPIRED', 'FINISHED'] },
            OR: [
                // Currently in flight (flightEnd includes the full last day until 23:59)
                {
                    flightStart: { lte: today },
                    flightEnd: { gte: today }
                },
                // Legacy campaigns without flight dates
                {
                    flightStart: null,
                    flightEnd: null
                }
            ]
        } as any
    })

    if (campaigns.length === 0) return { success: true, count: 0 }

    nexusLogStore.addLog(`Nexus: Lote de ${campaigns.length} capturas enfileirado manualmente.`, 'SYSTEM')

    await enqueueCaptureJobs(campaigns.map((c: any) => c.id), {
        source: 'manual-active-all',
        priority: 10,
        allowTerminalStatuses: true,
    })

    // Trigger GitHub Worker
    const triggered = await triggerNexusWorker(campaigns.map(campaign => campaign.id))
    if (!triggered) {
        nexusLogStore.addLog('Nexus: Worker não disparado (verifique GITHUB_TOKEN e GITHUB_REPO)', 'ERROR')
    }

    revalidatePath('/')
    return { success: true, count: campaigns.length }
}

/**
 * Triggers the GitHub Actions worker immediately via workflow_dispatch.
 * Requires GITHUB_TOKEN and GITHUB_REPO to be set in Vercel.
 */
export async function triggerNexusWorker(campaignIds: string[] = []) {
    const token = process.env.GITHUB_TOKEN
    let repo = process.env.GITHUB_REPO // Expected: "owner/repo"

    if (!token || !repo) {
        const missing = [];
        if (!token) missing.push('GITHUB_TOKEN');
        if (!repo) missing.push('GITHUB_REPO');

        console.warn(`[Nexus] Missing environment variables: ${missing.join(', ')}. Skipping manual trigger.`);
        nexusLogStore.addLog(`Nexus: Gatilho manual ignorado (Faltam chaves: ${missing.join(', ')})`, 'INFO');
        return false
    }

    // Diagnostic log: show first 7 chars of token to verify if it's the correct one
    const tokenPrefix = token.substring(0, 10);
    console.log(`[Nexus] Using GITHUB_TOKEN starting with: ${tokenPrefix}`);
    nexusLogStore.addLog(`Nexus: Usando GITHUB_TOKEN (${tokenPrefix}...)`, 'INFO');

    // Sanitize repo if it's a full URL
    if (repo.includes('github.com/')) {
        repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }

    try {
        console.log(`[Nexus] Triggering GitHub worker for ${repo}...`)
        const targetIds = [...new Set(campaignIds.map(id => id.trim()).filter(Boolean))]
        
        // Timeout de 15 segundos para evitar travamento da Server Action
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)

        const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/nexus-worker.yml/dispatches`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'Adsnap-Nexus-Agent'
                },
                body: JSON.stringify({
                    ref: 'main',
                    inputs: { campaign_ids: targetIds.join(',') }
                }),
                signal: controller.signal
            }
        )

        clearTimeout(timeoutId)

        if (response.ok) {
            console.log('[Nexus] GitHub worker triggered successfully.')
            nexusLogStore.addLog('Nexus: Worker disparado com sucesso no GitHub', 'SUCCESS')
            return true
        } else {
            const error = await response.text()
            console.error('[Nexus] GitHub trigger failed:', error)
            nexusLogStore.addLog(`Nexus: Falha ao disparar GitHub Worker (${response.status}): ${error.substring(0, 100)}`, 'ERROR')
            return false
        }
    } catch (err) {
        console.error('[Nexus] Exception in triggerNexusWorker:', err)
        nexusLogStore.addLog(`Nexus: Erro crítico ao disparar Worker: ${(err as Error).message}`, 'ERROR')
        return false
    }
}

export async function triggerGamWorker(jobId?: string) {
    const token = process.env.GITHUB_TOKEN
    let repo = process.env.GITHUB_REPO

    if (!token || !repo) {
        console.warn('[Nexus GAM] GITHUB_TOKEN ou GITHUB_REPO ausente; job mantido na fila.')
        return false
    }

    if (repo.includes('github.com/')) {
        repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }

    try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/gam-import.yml/dispatches`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'Adsnap-GAM-Agent',
                },
                body: JSON.stringify({
                    ref: 'main',
                    inputs: jobId ? { job_id: jobId } : {},
                }),
                signal: controller.signal,
            },
        )
        clearTimeout(timeoutId)

        if (response.ok) return true

        console.error('[Nexus GAM] Falha ao disparar worker dedicado:', response.status, await response.text())
        return false
    } catch (error) {
        console.error('[Nexus GAM] Erro ao disparar worker dedicado:', error)
        return false
    }
}

async function cancelGamWorkflowRun(jobId: string) {
    const token = process.env.GITHUB_TOKEN
    let repo = process.env.GITHUB_REPO
    if (!token || !repo) return false

    if (repo.includes('github.com/')) {
        repo = repo.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Adsnap-GAM-Agent',
    }

    try {
        const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/gam-import.yml/runs?per_page=50`,
            { headers, cache: 'no-store' },
        )
        if (!response.ok) return false

        const data = await response.json() as {
            workflow_runs?: Array<{ id: number; display_title?: string; status?: string }>
        }
        const runs = (data.workflow_runs || []).filter(run =>
            run.status !== 'completed' && run.display_title?.includes(jobId),
        )

        const results = await Promise.all(runs.map(run => fetch(
            `https://api.github.com/repos/${repo}/actions/runs/${run.id}/cancel`,
            { method: 'POST', headers },
        )))
        return results.some(result => result.ok)
    } catch (error) {
        console.error('[Nexus GAM] Erro ao encerrar workflow:', error)
        return false
    }
}

export async function bulkCreateCampaigns(campaigns: any[]) {
    console.log(`[Nexus] Bulk creating ${campaigns.length} campaigns...`)

    const results = []

    for (const data of campaigns) {
        try {
            const campaign = await prisma.campaign.create({
                data: {
                    agency: data.agency || 'Adsnap',
                    client: data.client || 'Sem Cliente',
                    campaignName: data.campaignName || data.client || 'Nova Campanha',
                    pi: data.pi || '000',
                    format: data.format || 'Display',
                    url: data.url,
                    device: data.device || 'desktop',
                    segmentation: data.segmentation || 'PRIVADO',
                    captureCadence: normalizeCaptureCadence(data.segmentation || 'PRIVADO', data.captureCadence),
                    captureDelaySeconds: normalizeCaptureDelaySeconds(data.captureDelaySeconds),
                    flightStart: data.flightStart ? new Date(data.flightStart) : null,
                    flightEnd: data.flightEnd ? new Date(data.flightEnd) : null,
                    status: 'PENDING',
                    isScheduled: false,
                    scheduledTimes: '[]',
                    externalAuthUrl: data.externalAuthUrl || null,
                    externalCampaignId: data.externalCampaignId || null,
                    externalChannelId: data.externalChannelId || null,
                    isMonitoringActive: data.isMonitoringActive || false,
                    manualDashboardUrl: data.manualDashboardUrl || null,
                    showOnDashboard: data.showOnDashboard !== false,
                    isMultiChannel: data.isMultiChannel || false,
                    allowedChannels: data.allowedChannels || '[]',
                }
            })
            results.push({ success: true, id: campaign.id })
        } catch (err) {
            console.error('Bulk item error:', err)
            results.push({ success: false, error: (err as Error).message })
        }
    }

    revalidatePath('/')
    revalidatePath('/monitoring')
    revalidatePath('/adops')

    return {
        success: true,
        createdCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length
    }
}

// --- NEXUS CONTROL ACTIONS ---

export async function stopAllCaptures() {
    let stoppedJobs = 0
    try {
        const jobs = await prisma.workerJob.updateMany({
            where: {
                type: 'CAPTURE',
                status: { in: ['QUEUED', 'PROCESSING'] },
            },
            data: {
                status: 'FAILED',
                finishedAt: new Date(),
                lockedUntil: null,
                lastError: 'Interrompido manualmente pelo painel',
            },
        })
        stoppedJobs = jobs.count
    } catch (error) {
        if (!isWorkerJobStorageMissing(error)) throw error
    }

    // Reset all QUEUED and PROCESSING campaigns to PENDING
    const result = await prisma.campaign.updateMany({
        where: {
            status: { in: ['QUEUED', 'PROCESSING'] },
            isArchived: false
        },
        data: { status: 'PENDING' }
    })

    nexusLogStore.addLog(`Nexus: Interrupção forçada. ${result.count} campanha(s) resetada(s).`, 'SYSTEM')
    nexusLogStore.addLog(`Nexus WorkerJob: ${stoppedJobs} job(s) encerrado(s) manualmente.`, 'SYSTEM')
    revalidatePath('/')
    revalidatePath('/workers')

    return { success: true, stoppedCount: result.count, stoppedJobs }
}

export async function scheduleAllCampaigns(time: string) {
    // Validate time format (HH:mm)
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
        return { success: false, error: 'Formato de horário inválido. Use HH:mm (ex: 14:30)' }
    }

    // Get all active (non-archived) campaigns
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: false }
    })

    let updatedCount = 0

    for (const campaign of campaigns) {
        let currentTimes: string[] = []
        try {
            currentTimes = JSON.parse(campaign.scheduledTimes || '[]')
        } catch {
            currentTimes = []
        }

        // Add time if not already present
        if (!currentTimes.includes(time)) {
            currentTimes.push(time)
            currentTimes.sort() // Keep times sorted
        }

        await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
                isScheduled: true,
                scheduledTimes: JSON.stringify(currentTimes)
            }
        })
        updatedCount++
    }

    nexusLogStore.addLog(`Nexus: ${updatedCount} campanha(s) agendada(s) para ${time}.`, 'SUCCESS')
    revalidatePath('/')

    return { success: true, updatedCount, time }
}

// --- SETTINGS ACTIONS ---

export async function getSettings() {
    let settings = await prisma.settings.findUnique({
        where: { id: 1 }
    })

    if (!settings) {
        // Create initial default settings
        settings = await prisma.settings.create({
            data: { id: 1 }
        })
    }

    return settings
}

export async function updateSettings(data: any) {
    const settings = await prisma.settings.update({
        where: { id: 1 },
        data: {
            nexusMaxRetries: Number(data.nexusMaxRetries),
            nexusTimeout: Number(data.nexusTimeout),
            nexusDelay: Number(data.nexusDelay),
            autoCleanupDays: Number(data.autoCleanupDays),
            webhookUrl: data.webhookUrl,
            performanceMode: Boolean(data.performanceMode),
            feedPollingRate: Number(data.feedPollingRate),
            maintenanceMode: Boolean(data.maintenanceMode),
            bannerFormats: data.bannerFormats,
            telegramChatId: data.telegramChatId || null,
        } as any
    })

    nexusLogStore.addLog('Nexus: Configurações globais atualizadas.', 'SYSTEM')
    revalidatePath('/')
    return settings
}

export async function testTelegramNotification() {
    const { sendTelegramAlert } = await import('@/lib/telegram')
    const success = await sendTelegramAlert(
        'Teste de Notificação',
        'Se você está recebendo esta mensagem, a integração Telegram está funcionando corretamente!',
        'Adsnap Cloud — Nexus Engine'
    )
    return { success }
}

export async function deleteCapture(id: string) {
    console.log(`[Nexus] Requesting deletion of capture ${id}...`);
    try {
        const capture = await prisma.capture.findUnique({
            where: { id },
            select: { screenshotPath: true }
        });

        if (capture && capture.screenshotPath) {
            // 1. If it's a Supabase URL, remove from Storage
            if (capture.screenshotPath.startsWith('http')) {
                const { supabase } = await import('@/lib/supabase')
                // Extract part after 'screenshots/'
                const path = capture.screenshotPath.split('screenshots/')[1]
                if (path) {
                    const { error } = await supabase.storage.from('screenshots').remove([path])
                    if (error) console.error('[Nexus Storage] Delete error:', error)
                    else console.log(`[Nexus Storage] File removed: ${path}`)
                }
            }
            // 2. Legacy fallback for local files
            else {
                const fs = require('fs');
                try {
                    if (fs.existsSync(capture.screenshotPath)) {
                        fs.unlinkSync(capture.screenshotPath);
                        console.log(`[Nexus] Local file deleted: ${capture.screenshotPath}`);
                    }
                } catch (e) {
                    console.error('[Nexus] Local file delete fail:', e);
                }
            }
        }


        await prisma.capture.delete({
            where: { id }
        });

        revalidatePath('/');
        revalidatePath('/books');

        nexusLogStore.addLog(`Nexus: Evidência ${id} removida permanentemente.`, 'SYSTEM');
        return { success: true };
    } catch (error) {
        console.error('[Delete Capture Error]', error);
        return { success: false, error: (error as Error).message };
    }
}

export async function getStorageUsage() {
    try {
        const result = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]
        const bytesUsed = Number(result[0]?.total_size || 0)
        const totalLimit = 1024 * 1024 * 1024 // 1GB
        const percentage = (bytesUsed / totalLimit) * 100
        return {
            used: bytesUsed,
            limit: totalLimit,
            percentage: Math.min(percentage, 100),
            formattedUsed: (bytesUsed / (1024 * 1024)).toFixed(2) + ' MB'
        }
    } catch (error) {
        console.error('[Actions] Error fetching storage usage:', error)
        return { used: 0, limit: 1024 * 1024 * 1024, percentage: 0, formattedUsed: '0 MB' }
    }
}

export async function getAdminMetrics() {
    try {
        // 1. Supabase Storage (already implemented logic)
        const storageResult = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]
        const storageBytes = Number(storageResult[0]?.total_size || 0)

        // 2. Supabase Database Size
        const dbResult = await (prisma as any).$queryRawUnsafe(
            `SELECT pg_database_size(current_database()) as total_size`
        ) as any[]
        const dbBytes = Number(dbResult[0]?.total_size || 0)

        // 3. Resend Email Usage (Tracked via NexusLogs)
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

        const [dailyEmails, monthlyEmails] = await Promise.all([
            prisma.nexusLog.count({
                where: {
                    level: 'SYSTEM',
                    message: { contains: '[ALERTA STORAGE]' }, // For now, alerts are the only emails
                    createdAt: { gte: today }
                }
            }),
            prisma.nexusLog.count({
                where: {
                    level: 'SYSTEM',
                    message: { contains: '[ALERTA STORAGE]' },
                    createdAt: { gte: firstDayOfMonth }
                }
            })
        ])

        // 4. Telegram Bot Status
        let telegramStatus = {
            isConnected: false,
            botInfo: null as any,
            webhook: null as any,
            chatIdConfigured: false
        }

        const botToken = process.env.NexusTelegram
        const envChatId = process.env.chatidtelegram

        let settings = await prisma.settings.findFirst() // Fetch settings once for reuse

        if (botToken) {
            try {
                const [meRes, webhookRes] = await Promise.all([
                    fetch(`https://api.telegram.org/bot${botToken}/getMe`),
                    fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
                ])

                const meData = await meRes.json()
                const webhookData = await webhookRes.json()

                if (meData.ok) {
                    telegramStatus.isConnected = true
                    telegramStatus.botInfo = meData.result
                }

                if (webhookData.ok) {
                    telegramStatus.webhook = webhookData.result
                }

                // Check if chatId is configured in settings if not in env
                telegramStatus.chatIdConfigured = !!(envChatId || settings?.telegramChatId)

            } catch (err) {
                console.error('[Actions] Telegram health check failed:', err)
            }
        }

        // 5. Storage Health
        const lastRun = settings?.storageCheckLastRun

        return {
            storage: {
                used: storageBytes,
                limit: 1024 * 1024 * 1024, // 1GB
                percentage: (storageBytes / (1024 * 1024 * 1024)) * 100,
                formatted: (storageBytes / (1024 * 1024)).toFixed(2) + ' MB'
            },
            database: {
                used: dbBytes,
                limit: 500 * 1024 * 1024, // 500MB free tier
                percentage: (dbBytes / (500 * 1024 * 1024)) * 100,
                formatted: (dbBytes / (1024 * 1024)).toFixed(2) + ' MB'
            },
            resend: {
                dailyUsed: dailyEmails,
                dailyLimit: 100,
                monthlyUsed: monthlyEmails,
                monthlyLimit: 3000,
                percentage: (dailyEmails / 100) * 100
            },
            telegram: telegramStatus,
            health: {
                lastRun: lastRun,
                isHealthy: lastRun ? (new Date().getTime() - lastRun.getTime() < 24 * 60 * 60 * 1000) : false
            }
        }
    } catch (error) {
        console.error('[Actions] Error fetching dashboard metrics:', error)
        throw error
    }
}

export async function runVisionAudit(captureId: string) {
    console.log(`[Nexus Vision] Iniciando auditoria para: ${captureId}`);
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        const response = await fetch(`${supabaseUrl}/functions/v1/nexus-vision`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${anonKey}`
            },
            body: JSON.stringify({ captureId })
        });

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[Nexus Vision Action Error]', error);
        return { success: false, error: String(error) };
    }
}

export async function getLatestCaptureId(campaignId: string) {
    try {
        const capture = await prisma.capture.findFirst({
            where: { campaignId, status: 'SUCCESS' },
            orderBy: { createdAt: 'desc' },
            select: { id: true }
        });
        return capture?.id || null;
    } catch (error) {
        console.error('[Actions] Failed to get latest capture:', error);
        return null;
    }
}

// --- EMAIL DISPATCH ACTIONS ---

export async function getEmailDispatches() {
    const dispatches = await (prisma as any).emailDispatch.findMany({
        orderBy: { createdAt: 'desc' },
    })

    // For each dispatch, fetch all campaigns with the same PI
    const results = []
    for (const d of dispatches) {
        const pi = d.pi || ''
        let campaigns: any[] = []

        if (pi) {
            campaigns = await prisma.campaign.findMany({
                where: { pi, segmentation: 'GOV_FEDERAL', isArchived: false },
                select: {
                    id: true, client: true, agency: true, campaignName: true,
                    format: true, pi: true, device: true,
                    flightStart: true, flightEnd: true, status: true,
                },
                orderBy: { createdAt: 'asc' }
            })
        } else if (d.campaignId) {
            // Legacy fallback
            const campaign = await prisma.campaign.findUnique({
                where: { id: d.campaignId },
                select: {
                    id: true, client: true, agency: true, campaignName: true,
                    format: true, pi: true, device: true,
                    flightStart: true, flightEnd: true, status: true,
                }
            })
            if (campaign) campaigns = [campaign]
        }

        // Resolve format labels
        let settings: any = null
        try { settings = await prisma.settings.findUnique({ where: { id: 1 } }) } catch { }
        const bannerFormats = settings ? JSON.parse((settings as any).bannerFormats || '[]') : []

        const formatsResolved = campaigns.map((c: any) => {
            const match = bannerFormats.find((f: any) => f.id === c.format)
            return {
                ...c,
                formatLabel: match ? (match.label || `${match.width}x${match.height}`) : c.format,
                flightStart: c.flightStart?.toISOString() || null,
                flightEnd: c.flightEnd?.toISOString() || null,
            }
        })

        const firstCampaign = formatsResolved[0] || null

        results.push({
            ...d,
            createdAt: d.createdAt.toISOString(),
            updatedAt: d.updatedAt.toISOString(),
            lastSentAt: d.lastSentAt?.toISOString() || null,
            pi: d.pi || firstCampaign?.pi || '',
            campaign: firstCampaign,
            campaigns: formatsResolved,
            formatCount: formatsResolved.length,
        })
    }

    return results
}

export async function getCampaignsForDispatch() {
    const campaigns = await prisma.campaign.findMany({
        where: {
            isArchived: false,
            segmentation: 'GOV_FEDERAL',
            flightEnd: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true, client: true, agency: true, campaignName: true,
            format: true, pi: true, device: true,
            flightStart: true, flightEnd: true, status: true,
            emailDispatches: { select: { id: true } } as any
        }
    })

    // Resolve format labels
    let settings: any = null
    try { settings = await prisma.settings.findUnique({ where: { id: 1 } }) } catch { }
    const bannerFormats = settings ? JSON.parse((settings as any).bannerFormats || '[]') : []

    // Group campaigns by PI
    const grouped: Record<string, any[]> = {}
    for (const c of campaigns) {
        const key = c.pi || c.id
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(c)
    }

    // Check which PIs already have dispatches
    const existingDispatches = await (prisma as any).emailDispatch.findMany({
        select: { pi: true }
    })
    const dispatchedPis = new Set(existingDispatches.map((d: any) => d.pi).filter(Boolean))

    // Return grouped campaigns
    return Object.entries(grouped).map(([pi, cams]) => {
        const first = cams[0]
        const formats = cams.map((c: any) => {
            const match = bannerFormats.find((f: any) => f.id === c.format)
            return {
                id: c.id,
                format: c.format,
                formatLabel: match ? (match.label || `${match.width}x${match.height}`) : c.format,
                device: c.device,
            }
        })

        return {
            pi,
            client: first.client,
            agency: first.agency,
            campaignName: first.campaignName,
            flightStart: first.flightStart?.toISOString() || null,
            flightEnd: first.flightEnd?.toISOString() || null,
            status: first.status,
            formats,
            formatCount: formats.length,
            hasDispatch: dispatchedPis.has(pi),
        }
    })
}

export async function createEmailDispatch(data: {
    pi: string
    recipients: string[]
    dispatchTime: string
}) {
    if (!data.pi || data.recipients.length === 0) {
        throw new Error('Campanha e pelo menos um destinatário são obrigatórios')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const email of data.recipients) {
        if (!emailRegex.test(email.trim())) {
            throw new Error(`E-mail inválido: ${email}`)
        }
    }

    const eligibleCampaign = await prisma.campaign.findFirst({
        where: { pi: data.pi, segmentation: 'GOV_FEDERAL', isArchived: false },
        select: { id: true },
    })
    if (!eligibleCampaign) {
        throw new Error('Somente campanhas de Governo Federal podem receber relatorios automaticos')
    }

    const dispatch = await (prisma as any).emailDispatch.create({
        data: {
            pi: data.pi,
            recipients: JSON.stringify(data.recipients.map(e => e.trim())),
            dispatchTime: data.dispatchTime || '09:00',
            isActive: true,
            status: 'PENDING',
        }
    })

    nexusLogStore.addLog(`Email Dispatch: Configuração criada para PI ${data.pi}`, 'SYSTEM')
    revalidatePath('/email-dispatch')
    return dispatch
}

export async function updateEmailDispatch(id: string, data: {
    recipients?: string[]
    dispatchTime?: string
    isActive?: boolean
}) {
    const updateData: any = {}

    if (data.recipients !== undefined) {
        updateData.recipients = JSON.stringify(data.recipients.map(e => e.trim()))
    }
    if (data.dispatchTime !== undefined) {
        updateData.dispatchTime = data.dispatchTime
    }
    if (data.isActive !== undefined) {
        updateData.isActive = data.isActive
    }

    const dispatch = await (prisma as any).emailDispatch.update({
        where: { id },
        data: updateData
    })

    revalidatePath('/email-dispatch')
    return dispatch
}

export async function deleteEmailDispatch(id: string) {
    await (prisma as any).emailDispatch.delete({ where: { id } })
    nexusLogStore.addLog(`Email Dispatch: Configuração removida`, 'SYSTEM')
    revalidatePath('/email-dispatch')
    return { success: true }
}

export async function sendTestEmail(dispatchId: string) {
    const dispatch = await (prisma as any).emailDispatch.findUnique({
        where: { id: dispatchId },
    })

    if (!dispatch) {
        return { success: false, error: 'Disparo não encontrado' }
    }

    const recipients = JSON.parse(dispatch.recipients) as string[]
    if (recipients.length === 0) {
        return { success: false, error: 'Nenhum destinatário configurado' }
    }

    // Send only to the first recipient as a test
    const { sendCampaignReport } = await import('@/lib/emailService')
    const result = await sendCampaignReport({
        pi: dispatch.pi,
        recipients: [recipients[0]],
        dispatchId: dispatch.id,
    })

    // Reset status back to PENDING after test
    if (result.success) {
        await (prisma as any).emailDispatch.update({
            where: { id: dispatchId },
            data: { status: 'PENDING' }
        })
    }

    revalidatePath('/email-dispatch')
    return result
}

// --- TELEGRAM DIAGNOSTIC ACTIONS ---

export async function testTelegramConnection() {
    const botToken = process.env.NexusTelegram
    if (!botToken) return { success: false, error: 'Token não configurado no env.' }

    try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`)
        const data = await res.json()
        
        if (data.ok) {
            return { 
                success: true, 
                bot: data.result,
                message: `Conectado como @${data.result.username}` 
            }
        }
        return { success: false, error: data.description || 'Erro desconhecido na API do Telegram.' }
    } catch (error) {
        return { success: false, error: 'Falha na requisição ao Telegram.' }
    }
}

export async function simulateMonthlyCleanup() {
    const botToken = process.env.NexusTelegram
    let chatId = process.env.chatidtelegram
    
    // Get credentials
    if (!botToken || !chatId) {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        if (!chatId) chatId = settings?.telegramChatId || ''
        // Re-check botToken if it was only in env but might be in db (unlikely based on current code but for safety)
        if (!botToken && (settings as any)?.telegramBotToken) {
             // If we had it in DB we'd use it, but actions logic currently expects it in env for connectivity
        }
    }

    const finalToken = botToken // Currently expects token in ENV for the BOT API calls

    if (!finalToken || !chatId) {
        return { success: false, error: 'Credenciais incompletas (Token ou ChatID).' }
    }

    try {
        const { subMonths, startOfMonth, endOfMonth, format } = await import('date-fns')
        const previousMonth = subMonths(new Date(), 1)
        const startDate = startOfMonth(previousMonth)
        const endDate = endOfMonth(previousMonth)
        const monthLabel = format(previousMonth, 'MMMM-yyyy')

        const captures = await prisma.capture.findMany({
            where: {
                createdAt: { gte: startDate, lte: endDate },
                status: 'SUCCESS'
            },
            include: { campaign: true },
            take: 20 // Sample size for test
        })

        if (captures.length === 0) {
            return { success: false, error: `Nenhuma captura encontrada para ${monthLabel}.` }
        }

        const JSZip = (await import('jszip')).default
        const zip = new JSZip()

        // Process a few captures to test dispatch
        for (const capture of captures) {
            if (!capture.screenshotPath || !capture.screenshotPath.startsWith('http')) continue
            try {
                const response = await fetch(capture.screenshotPath)
                if (!response.ok) continue
                const buffer = await response.arrayBuffer()
                const agency = (capture.campaign.agency || 'Sem_Agencia').replace(/\W/g, '_')
                const client = (capture.campaign.client || 'Sem_Cliente').replace(/\W/g, '_')
                const pi = (capture.campaign.pi || 'Sem_PI').replace(/\W/g, '_')
                const fileName = `${capture.campaign.campaignName.replace(/\W/g, '_') || 'Captura'}_${capture.id}.png`
                zip.file(`${agency}/${client}/${pi}/${fileName}`, buffer)
            } catch (e) {
                console.error('Error adding to test zip:', e)
            }
        }

        const zipData = await zip.generateAsync({ type: 'uint8array' })
        const fileName = `TESTE_BACKUP_${monthLabel}.zip`
        const caption = `🧪 <b>TESTE DE BACKUP REAL</b>\n\nEste teste gerou um ZIP com ${captures.length} capturas de ${monthLabel}.\n\n✅ Se você recebeu este arquivo, a integração do sistema está 100% operacional.\n\n⚠️ <i>Nenhum dado foi deletado durante este teste.</i>`

        // Send to Telegram
        const url = `https://api.telegram.org/bot${finalToken}/sendDocument`
        const formData = new FormData()
        formData.append('chat_id', chatId)
        formData.append('caption', caption)
        formData.append('parse_mode', 'HTML')
        
        const blob = new Blob([zipData as any], { type: 'application/zip' })
        formData.append('document', blob, fileName)

        const res = await fetch(url, { method: 'POST', body: formData })
        const result = await res.json()

        if (result.ok) {
            return { 
                success: true, 
                message: `Sucesso! O backup de teste (${captures.length} imagens) foi enviado para o Telegram.`
            }
        } else {
            return { success: false, error: `Falha no envio: ${result.description}` }
        }
    } catch (error) {
        console.error('Simulate error:', error)
        return { success: false, error: 'Erro ao processar simulação de backup.' }
    }
}


