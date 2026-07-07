'use server'

import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { nexusLogStore } from '@/lib/nexusLogStore'
import type { GamImportDraft } from '@/lib/gamImportPlanner'
import type { GamImportWriteResult } from '@/lib/gamImportWriter'
import { triggerGamWorker, triggerNexusWorker } from '@/app/actions'
import { enqueueCaptureJobs } from '@/lib/workerJobs'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { GAM_AUTH_REQUIRED_LEVEL, GAM_JOB_LEVELS } from '@/lib/gamJobStatus'
import { notifyGamOrderStarted } from '@/lib/gamOrderTelegram'

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
    authWorkflowUrl?: string
    executionLogs?: Array<{ at: string; message: string; tone: 'info' | 'success' | 'error' }>
}

type NexusAssistantAction = {
    label: string
    command?: string
    href?: string
    variant?: 'primary' | 'secondary' | 'danger'
}

type NexusAssistantCard = {
    title: string
    description?: string
    meta?: string
    command?: string
    href?: string
}

export type NexusAssistantResponse = {
    text: string
    tone?: 'info' | 'success' | 'warning' | 'error'
    actions?: NexusAssistantAction[]
    cards?: NexusAssistantCard[]
}

type AssistantCampaign = {
    id: string
    pi: string
    client: string
    campaignName: string
    format: string
    device: string
    status: string
    flightStart: Date | null
    flightEnd: Date | null
}

type CampaignGroup = {
    pi: string
    client: string
    campaignName: string
    campaignIds: string[]
    formats: string[]
    status: string
}

const CAPTURE_BLOCKED_STATUSES = [
    'EXPIRED',
    'FINISHED',
    'PROCESSING',
    'QUEUED',
    'FAILED',
    'QUARANTINE',
    'AUTOCONFIG',
]

const CAPTURE_BLOCKED_ADOPS_STATUSES = [
    'CONCLUIDA',
    'PAUSADA',
    'CANCELADA',
    'ENCERRADA',
]

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
            level: { in: ['JOB_GAM_PENDING', 'JOB_GAM_RUNNING', 'JOB_GAM_REVIEW', GAM_AUTH_REQUIRED_LEVEL] },
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
        const staleRunningJob = existingJob.level === 'JOB_GAM_RUNNING'
            && existingJob.createdAt.getTime() < Date.now() - 30 * 60 * 1000
        const shouldTrigger = existingJob.level === 'JOB_GAM_PENDING' || staleRunningJob
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
            authWorkflowUrl: readDetails(existingJob.details).authWorkflowUrl || '',
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
    await notifyGamOrderStarted(job.id)
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
        authWorkflowUrl: '',
    }
}

export async function getNexusOrderJobs() {
    const jobs = await prisma.nexusLog.findMany({
        where: {
            level: { in: GAM_JOB_LEVELS },
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
            authWorkflowUrl: details.authWorkflowUrl || '',
            executionLogs: details.executionLogs || [],
        }
    })
}

function normalizeText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function extractGamOrderUrl(message: string) {
    return message.match(/https:\/\/admanager\.google\.com\/\S*order_id=\d+\S*/i)?.[0]?.replace(/[),.;]+$/, '') || null
}

function extractPi(message: string) {
    return message.match(/\b(?:pi\s*)?([0-9]{3,8})\b/i)?.[1] || null
}

function wantsCapture(message: string) {
    const normalized = normalizeText(message)
    return /\b(captur|print|screenshot|tirar)\w*/i.test(normalized)
}

function wantsGeneralCapture(message: string) {
    const normalized = normalizeText(message)
    return wantsCapture(message) && /\b(geral|todas|todos|tudo|global)\b/i.test(normalized)
}

function wantsDownload(message: string) {
    const normalized = normalizeText(message)
    return /\b(baixar|download|zip|book|comprovante)\w*/i.test(normalized)
        && /\b(print|prints|captura|capturas|book|comprovante)\w*/i.test(normalized)
}

function wantsOrderRegistration(message: string) {
    const normalized = normalizeText(message)
    return /\b(order|gam)\b/i.test(normalized)
        && /\b(cadastr|registr|import|criar)\w*/i.test(normalized)
}

function cleanupSearchText(message: string) {
    return normalizeText(message)
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\b(?:disparar|rodar|fazer|tirar|capturar|capture|prints?|screenshot|campanha|especifica|especifico|baixar|download|zip|book|comprovantes?|todos?|todas?|geral|pi|da|de|do|para|por|os|as|o|a)\b/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function groupCampaigns(campaigns: AssistantCampaign[], formatLabelMap = new Map<string, string>()): CampaignGroup[] {
    const groups = new Map<string, CampaignGroup>()

    for (const campaign of campaigns) {
        const key = campaign.pi || campaign.id
        const current = groups.get(key) || {
            pi: campaign.pi,
            client: campaign.client,
            campaignName: campaign.campaignName,
            campaignIds: [],
            formats: [],
            status: campaign.status,
        }

        current.campaignIds.push(campaign.id)
        current.formats.push(`${resolveFormatLabel(formatLabelMap, campaign.format)}${campaign.device ? `/${campaign.device}` : ''}`)
        groups.set(key, current)
    }

    return Array.from(groups.values())
}

function getBrtTodayStart(now = new Date()) {
    const brtNowStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    const brtNow = new Date(brtNowStr)
    return new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()))
}

function activeCaptureWhere(now = new Date()) {
    const today = getBrtTodayStart(now)

    return {
        isArchived: false,
        status: { notIn: CAPTURE_BLOCKED_STATUSES },
        adOpsStatus: { notIn: CAPTURE_BLOCKED_ADOPS_STATUSES },
        AND: [
            { OR: [{ flightStart: null }, { flightStart: { lte: today } }] },
            { OR: [{ flightEnd: null }, { flightEnd: { gte: today } }] },
        ],
    }
}

async function findActiveCampaigns() {
    return prisma.campaign.findMany({
        where: activeCaptureWhere(),
        select: {
            id: true,
            pi: true,
            client: true,
            campaignName: true,
            format: true,
            device: true,
            status: true,
            flightStart: true,
            flightEnd: true,
        },
        orderBy: [{ client: 'asc' }, { pi: 'asc' }, { format: 'asc' }],
    })
}

async function findCampaignGroups(message: string, activeOnly: boolean) {
    const pi = extractPi(message)
    const searchText = cleanupSearchText(message)
    const baseWhere = activeOnly ? activeCaptureWhere() : { isArchived: false }

    const campaigns = await prisma.campaign.findMany({
        where: {
            ...baseWhere,
            ...(pi
                ? { pi }
                : searchText.length >= 2
                    ? {
                        OR: [
                            { client: { contains: searchText, mode: 'insensitive' } },
                            { campaignName: { contains: searchText, mode: 'insensitive' } },
                            { agency: { contains: searchText, mode: 'insensitive' } },
                        ],
                    }
                    : {}),
        },
        select: {
            id: true,
            pi: true,
            client: true,
            campaignName: true,
            format: true,
            device: true,
            status: true,
            flightStart: true,
            flightEnd: true,
        },
        orderBy: [{ client: 'asc' }, { pi: 'asc' }, { format: 'asc' }],
        take: 80,
    })

    const formatLabelMap = await getFormatLabelMap()
    return groupCampaigns(campaigns, formatLabelMap)
}

function campaignCards(groups: CampaignGroup[], action: 'capture' | 'download'): NexusAssistantCard[] {
    return groups.slice(0, 8).map(group => ({
        title: `${group.client} | PI ${group.pi}`,
        description: group.campaignName || `${group.campaignIds.length} formato(s)`,
        meta: `${group.campaignIds.length} formato(s): ${group.formats.slice(0, 4).join(', ')}`,
        command: action === 'capture'
            ? `capturar PI ${group.pi}`
            : undefined,
        href: action === 'download'
            ? `/api/books/download?pi=${encodeURIComponent(group.pi)}`
            : undefined,
    }))
}

async function queueCampaignGroup(group: CampaignGroup, source: string) {
    const queueResult = await enqueueCaptureJobs(group.campaignIds, {
        source,
        priority: 25,
        allowTerminalStatuses: true,
    })

    const triggered = await triggerNexusWorker(queueResult.campaignIds)
    await nexusLogStore.addLog(
        `Nexus Assistant: ${queueResult.campaignIds.length} campanha(s) enfileirada(s) para PI ${group.pi}.`,
        triggered ? 'SUCCESS' : 'ERROR',
        JSON.stringify({ queueResult, triggered }),
    )

    return { queueResult, triggered }
}

async function queueAllActiveCampaigns() {
    const campaigns = await findActiveCampaigns()
    const ids = campaigns.map(campaign => campaign.id)
    const queueResult = await enqueueCaptureJobs(ids, {
        source: 'nexus-assistant-general',
        priority: 10,
        allowTerminalStatuses: true,
    })
    const triggered = await triggerNexusWorker(queueResult.campaignIds)

    await nexusLogStore.addLog(
        `Nexus Assistant: captura geral enfileirada para ${queueResult.campaignIds.length} campanha(s).`,
        triggered ? 'SUCCESS' : 'ERROR',
        JSON.stringify({ queueResult, triggered }),
    )

    return { total: campaigns.length, queueResult, triggered }
}

function capabilityResponse(): NexusAssistantResponse {
    return {
        tone: 'info',
        text: 'Posso operar o Nexus por linguagem natural. Me mande uma order do GAM, peça prints gerais, peça captura de uma campanha/PI especifico ou solicite download dos prints.',
        actions: [
            { label: 'Cadastrar order GAM', command: 'Cadastrar order GAM' },
            { label: 'Disparar prints geral', command: 'Disparar prints geral', variant: 'primary' },
            { label: 'Capturar PI especifico', command: 'Capturar PI' },
            { label: 'Baixar prints por PI', command: 'Baixar prints PI ' },
        ],
    }
}

export async function submitNexusAssistantMessage(message: string): Promise<NexusAssistantResponse> {
    const input = message.trim()
    if (!input) return capabilityResponse()

    const orderUrl = extractGamOrderUrl(input)
    if (orderUrl) {
        const result = await submitNexusOrderLink(orderUrl)
        const authRequired = result.status === GAM_AUTH_REQUIRED_LEVEL
        return {
            tone: authRequired ? 'warning' : result.existing ? 'warning' : 'success',
            text: authRequired
                ? `Essa Order ${result.orderId} esta aguardando renovacao do login Google para o Nexus entrar no GAM.`
                : result.existing
                    ? `Essa Order ${result.orderId} ja estava no fluxo Nexus. Mantive o job ${result.jobId} e tentei acionar o worker quando aplicavel.`
                : `Recebi a Order ${result.orderId}. Enfileirei o cadastro automatico e acionei o worker GAM para preparar a revisao.`,
            actions: [
                authRequired && result.authWorkflowUrl
                    ? { label: 'Renovar login Google', href: result.authWorkflowUrl, variant: 'primary' as const }
                    : { label: 'Ver revisao', href: `/campaigns?jobId=${encodeURIComponent(result.jobId)}`, variant: 'primary' as const },
                { label: 'Ver fila Nexus', command: 'mostrar jobs nexus' },
            ],
        }
    }

    if (wantsGeneralCapture(input)) {
        const result = await queueAllActiveCampaigns()
        return {
            tone: result.queueResult.campaignIds.length > 0 ? 'success' : 'warning',
            text: result.queueResult.campaignIds.length > 0
                ? `Captura geral enfileirada: ${result.queueResult.campaignIds.length} campanha(s) elegivel(is). Worker ${result.triggered ? 'acionado' : 'nao acionado automaticamente; a fila ficou pronta'}.`
                : `Nao encontrei campanhas ativas elegiveis para captura geral agora.`,
            actions: [
                { label: 'Abrir Workers', href: '/workers' },
                { label: 'Ver Monitoramento', href: '/monitoring' },
            ],
        }
    }

    if (wantsDownload(input)) {
        const groups = await findCampaignGroups(input, false)
        if (groups.length === 0) {
            return {
                tone: 'warning',
                text: 'Nao encontrei prints/campanhas para esse termo. Me mande o PI para gerar o download.',
                actions: [{ label: 'Exemplo', command: 'baixar prints PI 402716' }],
            }
        }
        if (groups.length > 1 && !extractPi(input)) {
            return {
                tone: 'info',
                text: `Encontrei ${groups.length} PIs possiveis. Escolha qual book devo baixar.`,
                cards: campaignCards(groups, 'download'),
            }
        }

        const group = groups[0]
        return {
            tone: 'success',
            text: `Pronto. Preparei o download dos prints da campanha ${group.client} | PI ${group.pi}.`,
            actions: [
                { label: 'Baixar ZIP', href: `/api/books/download?pi=${encodeURIComponent(group.pi)}`, variant: 'primary' },
                { label: 'Abrir book', href: `/books/${encodeURIComponent(group.pi)}` },
            ],
        }
    }

    if (wantsCapture(input)) {
        const selectedPi = extractPi(input)
        const hasSpecificSearch = cleanupSearchText(input).length >= 2
        const groups = await findCampaignGroups(input, true)
        if (groups.length === 0) {
            return {
                tone: 'warning',
                text: 'Nao encontrei campanha ativa e elegivel para captura com esse termo. Me mande o PI ou um nome mais especifico.',
                actions: [{ label: 'Exemplo', command: 'capturar PI 402716' }],
            }
        }
        if (!selectedPi && (!hasSpecificSearch || groups.length > 1)) {
            return {
                tone: 'info',
                text: `Encontrei ${groups.length} PI(s) ativo(s) para captura. Escolha qual devo capturar.`,
                cards: campaignCards(groups, 'capture'),
            }
        }

        const group = groups[0]
        const result = await queueCampaignGroup(group, 'nexus-assistant-specific')
        return {
            tone: result.queueResult.campaignIds.length > 0 ? 'success' : 'warning',
            text: result.queueResult.campaignIds.length > 0
                ? `Enfileirei ${result.queueResult.campaignIds.length} formato(s) da campanha ${group.client} | PI ${group.pi}. Worker ${result.triggered ? 'acionado' : 'nao acionado automaticamente; a fila ficou pronta'}.`
                : `A campanha ${group.client} | PI ${group.pi} nao tem formatos elegiveis para captura agora.`,
            actions: [
                { label: 'Abrir Workers', href: '/workers' },
                { label: 'Baixar prints desse PI', href: `/api/books/download?pi=${encodeURIComponent(group.pi)}` },
            ],
        }
    }

    if (wantsOrderRegistration(input)) {
        return {
            tone: 'info',
            text: 'Pode me mandar o link completo da Order do Google Ad Manager. Assim que eu receber, eu cadastro automaticamente e aviso por Telegram/e-mail quando estiver pronta para revisao.',
            actions: [{ label: 'Colar order GAM', command: 'Cadastrar order GAM: ' }],
        }
    }

    if (/jobs?|fila|status|orders?/i.test(normalizeText(input))) {
        const jobs = await getNexusOrderJobs()
        const authJob = jobs.find(job => job.level === GAM_AUTH_REQUIRED_LEVEL && job.authWorkflowUrl)
        return {
            tone: 'info',
            text: jobs.length > 0
                ? `Tenho ${jobs.length} job(s) GAM recentes no Nexus.`
                : 'Nao ha jobs GAM recentes no Nexus.',
            actions: authJob
                ? [{ label: 'Renovar login Google', href: authJob.authWorkflowUrl, variant: 'primary' }]
                : undefined,
            cards: jobs.slice(0, 6).map(job => ({
                title: `Order ${job.orderId || 'GAM'} | ${job.level.replace('JOB_GAM_', '')}`,
                description: job.client || job.message,
                meta: job.pi ? `PI ${job.pi} | ${job.formats} formato(s)` : `${job.formats} formato(s)`,
                href: job.level === GAM_AUTH_REQUIRED_LEVEL && job.authWorkflowUrl
                    ? job.authWorkflowUrl
                    : job.level === 'JOB_GAM_REVIEW'
                        ? `/campaigns?jobId=${encodeURIComponent(job.id)}`
                        : undefined,
            })),
        }
    }

    return capabilityResponse()
}
