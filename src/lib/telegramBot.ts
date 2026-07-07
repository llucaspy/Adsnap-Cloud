import prisma from './prisma'
import { enqueueCaptureJobs, WORKER_JOB_TYPE_CAPTURE } from './workerJobs'
import { getFormatLabelMap, resolveFormatLabel } from './formatLabels'
import { nexusLogStore } from './nexusLogStore'
import { buildGamReviewUrl, notifyGamOrderStarted, sendPendingGamReviewReminders } from './gamOrderTelegram'
import {
    GAM_AUTH_REQUIRED_LEVEL,
    GAM_ERROR_LEVEL,
    GAM_JOB_LEVELS,
    GAM_PENDING_LEVEL,
    GAM_REVIEW_LEVEL,
    GAM_RUNNING_LEVEL,
} from './gamJobStatus'

type TelegramInlineButton = {
    text: string
    callback_data?: string
    url?: string
}

type SendOptions = {
    reply_markup?: { inline_keyboard: TelegramInlineButton[][] }
    parse_mode?: 'HTML' | 'MarkdownV2'
}

type BotCommandContext = {
    chatId: string
    messageId?: number
    isNewMessage?: boolean
}

type GamJobDetails = {
    orderUrl?: string
    orderId?: string
    client?: string
    pi?: string
    mediaEntries?: unknown[]
    blockedItems?: unknown[]
    notifications?: { reviewUrl?: string }
}

const DEFAULT_APP_URL = 'https://adsnap-cloud.vercel.app'
const CAPTURE_BLOCKED_STATUSES = ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED', 'AUTOCONFIG']
const CAPTURE_BLOCKED_ADOPS_STATUSES = ['CONCLUIDA', 'PAUSADA', 'CANCELADA', 'ENCERRADA']

function botToken() {
    return process.env.NexusTelegram || ''
}

function webhookSecret() {
    return process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_SECRET_TOKEN || ''
}

function appUrl() {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (explicit) return explicit.replace(/\/$/, '')

    const vercelUrl = process.env.VERCEL_URL?.trim()
    if (vercelUrl) {
        return (vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`).replace(/\/$/, '')
    }

    return DEFAULT_APP_URL
}

function normalizeRepo(value: string | undefined) {
    if (!value) return ''
    if (value.includes('github.com/')) {
        return value.split('github.com/')[1].replace(/\/$/, '').replace(/\.git$/, '')
    }
    return value.replace(/\/$/, '').replace(/\.git$/, '')
}

function githubWorkflowUrl(workflow: string) {
    const repo = normalizeRepo(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY)
    return repo ? `https://github.com/${repo}/actions/workflows/${workflow}` : ''
}

async function triggerWorkflow(workflow: string, inputs: Record<string, string> = {}) {
    const token = process.env.GITHUB_TOKEN
    const repo = normalizeRepo(process.env.GITHUB_REPO || process.env.GITHUB_REPOSITORY)
    if (!token || !repo) return false

    try {
        const response = await fetch(
            `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'User-Agent': 'Adsnap-Telegram-Bot',
                },
                body: JSON.stringify({ ref: 'main', inputs }),
            },
        )

        if (!response.ok) {
            console.error(`[TelegramBot] Falha ao disparar ${workflow}:`, response.status, await response.text())
            return false
        }

        return true
    } catch (error) {
        console.error(`[TelegramBot] Erro ao disparar ${workflow}:`, error)
        return false
    }
}

async function triggerNexusWorker(campaignIds: string[]) {
    const ids = [...new Set(campaignIds.map(id => id.trim()).filter(Boolean))]
    return triggerWorkflow('nexus-worker.yml', { campaign_ids: ids.join(',') })
}

async function triggerGamWorker(jobId?: string) {
    return triggerWorkflow('gam-import.yml', jobId ? { job_id: jobId } : {})
}

function html(value: unknown) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
}

function normalizeText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
}

function truncate(value: string, max = 36) {
    return value.length > max ? `${value.slice(0, Math.max(0, max - 1))}...` : value
}

function button(text: string, callbackData: string): TelegramInlineButton {
    return { text, callback_data: callbackData }
}

function linkButton(text: string, url: string): TelegramInlineButton {
    return { text, url }
}

function keyboard(rows: TelegramInlineButton[][]) {
    return { inline_keyboard: rows }
}

async function telegramCall<T = Record<string, unknown>>(method: string, payload: Record<string, unknown>) {
    const token = botToken()
    if (!token) {
        console.warn('[TelegramBot] NexusTelegram nao configurado.')
        return null
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        const data = await response.json() as T & { ok?: boolean; description?: string }
        if (!data.ok) console.error(`[TelegramBot] ${method} falhou:`, data.description)
        return data
    } catch (error) {
        console.error(`[TelegramBot] ${method} erro:`, error)
        return null
    }
}

export async function sendMessage(chatId: string, text: string, options: SendOptions = {}) {
    const result = await telegramCall<{ ok?: boolean }>('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options.parse_mode || 'HTML',
        disable_web_page_preview: true,
        reply_markup: options.reply_markup,
    })

    if (!result?.ok) {
        await telegramCall('sendMessage', {
            chat_id: chatId,
            text: text.replace(/<[^>]+>/g, ''),
            disable_web_page_preview: true,
            reply_markup: options.reply_markup,
        })
    }

    return result
}

async function editMessage(chatId: string, messageId: number, text: string, replyMarkup?: SendOptions['reply_markup']) {
    const result = await telegramCall<{ ok?: boolean; description?: string }>('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
    })

    if (!result?.ok) {
        await sendMessage(chatId, text, { reply_markup: replyMarkup })
    }
}

async function sendPhoto(chatId: string, photoUrl: string, caption: string) {
    return telegramCall('sendPhoto', {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
    })
}

async function ackCallback(callbackQueryId: string, text?: string) {
    await telegramCall('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text || '',
    })
}

async function getAllowedChatIds() {
    const ids = new Set(
        String(process.env.chatidtelegram || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean),
    )

    try {
        const settings = await prisma.settings.findUnique({
            where: { id: 1 },
            select: { telegramChatId: true },
        })
        if (settings?.telegramChatId) ids.add(String(settings.telegramChatId).trim())
    } catch {
        // Keep env-only auth if Settings is unavailable.
    }

    return ids
}

async function isAuthorized(chatId: string) {
    const allowed = await getAllowedChatIds()
    return allowed.size > 0 && allowed.has(String(chatId))
}

function readDetails(details: string | null): GamJobDetails {
    const raw = details || ''
    if (!raw.trim().startsWith('{')) return { orderUrl: raw }

    try {
        return JSON.parse(raw) as GamJobDetails
    } catch {
        return { orderUrl: raw }
    }
}

function getOrderIdFromUrl(value: string) {
    return value.match(/order_id=(\d+)/i)?.[1] || ''
}

function extractGamOrderUrl(message: string) {
    return message.match(/https:\/\/admanager\.google\.com\/\S*order_id=\d+\S*/i)?.[0]?.replace(/[),.;]+$/, '') || null
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

function statusLabel(level: string) {
    const map: Record<string, string> = {
        [GAM_PENDING_LEVEL]: 'Fila',
        [GAM_RUNNING_LEVEL]: 'Rodando',
        [GAM_REVIEW_LEVEL]: 'Revisao',
        [GAM_ERROR_LEVEL]: 'Erro',
        [GAM_AUTH_REQUIRED_LEVEL]: 'Login Google',
        JOB_GAM_CANCELLED: 'Cancelado',
    }
    return map[level] || level
}

async function respond(context: BotCommandContext, text: string, rows: TelegramInlineButton[][] = []) {
    const markup = rows.length > 0 ? keyboard(rows) : undefined
    if (context.messageId && !context.isNewMessage) {
        await editMessage(context.chatId, context.messageId, text, markup)
        return
    }
    await sendMessage(context.chatId, text, { reply_markup: markup })
}

async function showHome(context: BotCommandContext) {
    await respond(
        context,
        [
            '<b>Adsnap Nexus Bot</b>',
            '<i>Controle operacional pelo Telegram.</i>',
            '',
            'Escolha uma area ou envie um comando em texto:',
            '<code>capturar pi 402716</code>',
            '<code>status</code>, <code>fila</code>, <code>orders</code>',
            'ou cole um link de Order do Google Ad Manager.',
        ].join('\n'),
        [
            [button('Status', 'menu:status'), button('Workers', 'menu:workers')],
            [button('GAM Orders', 'menu:gam'), button('Capturas', 'menu:captures')],
            [button('Books', 'menu:books'), button('Logs', 'menu:logs')],
            [button('Alertas', 'menu:alerts'), button('Quarentena', 'menu:quarantine')],
        ],
    )
}

async function showStatus(context: BotCommandContext) {
    const [
        campaignCounts,
        todayCaptures,
        workerCounts,
        gamCounts,
        storage,
    ] = await Promise.all([
        prisma.campaign.groupBy({
            by: ['status'],
            where: { isArchived: false },
            _count: { _all: true },
        }),
        prisma.capture.count({
            where: {
                status: 'SUCCESS',
                createdAt: { gte: getBrtTodayStart() },
            },
        }),
        prisma.workerJob.groupBy({
            by: ['status'],
            where: { type: WORKER_JOB_TYPE_CAPTURE, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] } },
            _count: { _all: true },
        }).catch(() => []),
        prisma.nexusLog.groupBy({
            by: ['level'],
            where: { level: { in: GAM_JOB_LEVELS } },
            _count: { _all: true },
        }),
        getStorageSummary(),
    ])

    const campaignStatus = (status: string) => campaignCounts.find(item => item.status === status)?._count._all || 0
    const workerStatus = (status: string) => workerCounts.find(item => item.status === status)?._count._all || 0
    const gamStatus = (level: string) => gamCounts.find(item => item.level === level)?._count._all || 0

    await respond(
        context,
        [
            '<b>Status do sistema</b>',
            '',
            `<b>Capturas hoje:</b> ${todayCaptures}`,
            `<b>Campanhas ativas:</b> ${campaignStatus('PENDING') + campaignStatus('SUCCESS') + campaignStatus('FAILED') + campaignStatus('QUEUED') + campaignStatus('PROCESSING')}`,
            `<b>Fila worker:</b> ${workerStatus('QUEUED')} em espera, ${workerStatus('PROCESSING')} em execucao, ${workerStatus('FAILED')} com erro`,
            `<b>GAM:</b> ${gamStatus(GAM_PENDING_LEVEL)} fila, ${gamStatus(GAM_RUNNING_LEVEL)} rodando, ${gamStatus(GAM_REVIEW_LEVEL)} revisao`,
            `<b>Storage:</b> ${storage}`,
        ].join('\n'),
        [
            [button('Atualizar', 'menu:status')],
            [button('Workers', 'menu:workers'), button('GAM Orders', 'menu:gam')],
            [button('Menu', 'menu:home')],
        ],
    )
}

async function getStorageSummary() {
    try {
        const result = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size FROM storage.objects WHERE bucket_id = 'screenshots'`,
        ) as Array<{ total_size?: bigint | number | string | null }>
        const bytes = Number(result[0]?.total_size || 0)
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    } catch {
        return 'indisponivel'
    }
}

async function showWorkers(context: BotCommandContext) {
    const [jobs, fallbackCampaigns] = await Promise.all([
        prisma.workerJob.findMany({
            where: { type: WORKER_JOB_TYPE_CAPTURE, status: { in: ['QUEUED', 'PROCESSING', 'FAILED'] } },
            orderBy: [{ status: 'asc' }, { priority: 'desc' }, { scheduledFor: 'asc' }],
            take: 10,
            include: {
                campaign: {
                    select: { pi: true, client: true, format: true, device: true },
                },
            },
        }).catch(() => []),
        prisma.campaign.findMany({
            where: { isArchived: false, status: { in: ['QUEUED', 'PROCESSING', 'FAILED', 'QUARANTINE'] } },
            orderBy: { updatedAt: 'asc' },
            take: 10,
            select: { id: true, pi: true, client: true, format: true, device: true, status: true },
        }),
    ])
    const formatMap = await getFormatLabelMap()
    const rows: string[] = ['<b>Workers e fila</b>', '']

    if (jobs.length > 0) {
        for (const job of jobs) {
            rows.push(
                `${job.status} | ${html(job.campaign?.client || 'Campanha')} | PI ${html(job.campaign?.pi || '-')}`,
                `Formato: ${html(resolveFormatLabel(formatMap, job.campaign?.format))} / ${html(job.campaign?.device || '-')}`,
                '',
            )
        }
    } else if (fallbackCampaigns.length > 0) {
        for (const campaign of fallbackCampaigns) {
            rows.push(
                `${campaign.status} | ${html(campaign.client)} | PI ${html(campaign.pi)}`,
                `Formato: ${html(resolveFormatLabel(formatMap, campaign.format))} / ${html(campaign.device)}`,
                '',
            )
        }
    } else {
        rows.push('Fila vazia.')
    }

    await respond(
        context,
        rows.join('\n').trim(),
        [
            [button('Atualizar', 'menu:workers'), button('Capturas', 'menu:captures')],
            [linkButton('Abrir painel', `${appUrl()}/workers`)],
            [button('Menu', 'menu:home')],
        ],
    )
}

async function showGamOrders(context: BotCommandContext) {
    const jobs = await prisma.nexusLog.findMany({
        where: { level: { in: GAM_JOB_LEVELS } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, level: true, message: true, details: true, createdAt: true },
    })

    const rows = ['<b>GAM Orders</b>', '']
    const buttons: TelegramInlineButton[][] = []

    if (jobs.length === 0) {
        rows.push('Nenhuma Order GAM recente.')
    }

    for (const job of jobs) {
        const details = readDetails(job.details)
        const orderId = details.orderId || getOrderIdFromUrl(details.orderUrl || '') || 'GAM'
        const client = details.client || job.message.replace(/^Nexus GAM:\s*/i, '')
        rows.push(
            `<b>${html(statusLabel(job.level))}</b> | Order <code>${html(orderId)}</code>`,
            `${html(truncate(client, 52))}`,
            '',
        )

        if (job.level === GAM_REVIEW_LEVEL) {
            buttons.push([linkButton(`Revisar ${orderId}`, details.notifications?.reviewUrl || buildGamReviewUrl(job.id))])
        }
        if (job.level === GAM_AUTH_REQUIRED_LEVEL) {
            const refreshUrl = githubWorkflowUrl('gam-session-refresh.yml')
            if (refreshUrl) buttons.push([linkButton('Renovar login Google', refreshUrl)])
        }
    }

    buttons.push([button('Atualizar', 'menu:gam'), button('Enviar lembretes', 'alerts:review-reminders')])
    buttons.push([button('Menu', 'menu:home')])

    await respond(context, rows.join('\n').trim(), buttons)
}

async function showCaptures(context: BotCommandContext) {
    const campaigns = await prisma.campaign.findMany({
        where: activeCaptureWhere(),
        orderBy: [{ client: 'asc' }, { pi: 'asc' }],
        take: 80,
        select: { id: true, pi: true, client: true, campaignName: true, format: true, device: true },
    })

    const groups = new Map<string, typeof campaigns>()
    for (const campaign of campaigns) {
        const key = campaign.pi || campaign.id
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(campaign)
    }

    const rows = ['<b>Capturas</b>', `${groups.size} PI(s) ativos para captura.`, '']
    const buttons: TelegramInlineButton[][] = [[button('Capturar tudo ativo', 'capture:all')]]

    for (const [pi, items] of Array.from(groups.entries()).slice(0, 8)) {
        const first = items[0]
        rows.push(`${html(first.client)} | PI <code>${html(pi)}</code> | ${items.length} formato(s)`)
        buttons.push([button(`Capturar PI ${pi}`, `capture:pi:${pi}`)])
    }

    if (groups.size === 0) rows.push('Nenhuma campanha ativa elegivel agora.')

    buttons.push([button('Atualizar', 'menu:captures'), button('Menu', 'menu:home')])
    await respond(context, rows.join('\n'), buttons)
}

async function queueAllActiveCaptures(context: BotCommandContext) {
    const campaigns = await prisma.campaign.findMany({
        where: activeCaptureWhere(),
        select: { id: true },
    })

    await queueCaptures(context, campaigns.map(campaign => campaign.id), 'telegram-all-active', 'captura geral')
}

async function queuePiCaptures(context: BotCommandContext, pi: string) {
    const campaigns = await prisma.campaign.findMany({
        where: { ...activeCaptureWhere(), pi },
        select: { id: true, client: true },
    })

    await queueCaptures(context, campaigns.map(campaign => campaign.id), 'telegram-pi', `PI ${pi}`)
}

async function queueCampaignCapture(context: BotCommandContext, campaignId: string) {
    await queueCaptures(context, [campaignId], 'telegram-campaign', `campanha ${campaignId}`)
}

async function queueCaptures(context: BotCommandContext, campaignIds: string[], source: string, label: string) {
    const queueResult = await enqueueCaptureJobs(campaignIds, {
        source,
        priority: 35,
        allowTerminalStatuses: true,
    })
    const triggered = queueResult.campaignIds.length > 0
        ? await triggerNexusWorker(queueResult.campaignIds)
        : false

    await nexusLogStore.addLog(
        `Bot Telegram: ${queueResult.campaignIds.length} captura(s) enfileirada(s) para ${label}.`,
        triggered ? 'SUCCESS' : 'INFO',
        JSON.stringify({ queueResult, triggered }),
    )

    await respond(
        context,
        [
            '<b>Captura enfileirada</b>',
            '',
            `Alvo: ${html(label)}`,
            `Formatos elegiveis: ${queueResult.campaignIds.length}`,
            `Novos jobs: ${queueResult.created}`,
            `Ignorados: ${queueResult.skipped}`,
            `Worker GitHub: ${triggered ? 'acionado' : 'nao acionado automaticamente'}`,
        ].join('\n'),
        [
            [button('Ver Workers', 'menu:workers')],
            [button('Menu', 'menu:home')],
        ],
    )
}

async function showBooks(context: BotCommandContext) {
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: false },
        distinct: ['pi'],
        orderBy: { client: 'asc' },
        take: 12,
        select: { pi: true, client: true },
    })

    const rows = ['<b>Books</b>', 'Selecione um PI para ver os ultimos prints.', '']
    const buttons: TelegramInlineButton[][] = []

    for (const campaign of campaigns) {
        rows.push(`${html(campaign.client)} | PI <code>${html(campaign.pi)}</code>`)
        buttons.push([button(`Book PI ${campaign.pi}`, `book:pi:${campaign.pi}`)])
    }

    if (campaigns.length === 0) rows.push('Nenhum PI encontrado.')

    buttons.push([linkButton('Abrir Books no site', `${appUrl()}/books`)]);
    buttons.push([button('Menu', 'menu:home')])
    await respond(context, rows.join('\n'), buttons)
}

async function showBookPi(context: BotCommandContext, pi: string) {
    const campaigns = await prisma.campaign.findMany({
        where: { pi, isArchived: false },
        orderBy: [{ client: 'asc' }, { format: 'asc' }],
        take: 12,
        select: {
            id: true,
            client: true,
            format: true,
            device: true,
            captures: {
                where: { status: 'SUCCESS' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { screenshotPath: true, createdAt: true },
            },
        },
    })

    const formatMap = await getFormatLabelMap()
    const rows = [`<b>Book PI ${html(pi)}</b>`, '']
    const buttons: TelegramInlineButton[][] = []

    for (const campaign of campaigns) {
        const capture = campaign.captures[0]
        rows.push(
            `${capture ? 'OK' : '--'} ${html(resolveFormatLabel(formatMap, campaign.format))} / ${html(campaign.device)}`,
            capture ? `Ultimo print: ${html(formatDate(capture.createdAt))}` : 'Sem print ainda',
            '',
        )
        if (capture?.screenshotPath?.startsWith('http')) {
            buttons.push([button(`Enviar ${resolveFormatLabel(formatMap, campaign.format)}`.slice(0, 60), `book:photo:${campaign.id}`)])
        }
    }

    if (campaigns.length === 0) rows.push('Nenhuma campanha neste PI.')

    buttons.push([
        linkButton('Abrir book completo', `${appUrl()}/books/${encodeURIComponent(pi)}`),
        linkButton('Baixar ZIP', `${appUrl()}/api/books/download?pi=${encodeURIComponent(pi)}`),
    ])
    buttons.push([button('Voltar', 'menu:books'), button('Menu', 'menu:home')])
    await respond(context, rows.join('\n').trim(), buttons)
}

async function sendBookPhoto(context: BotCommandContext, campaignId: string) {
    const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: {
            client: true,
            pi: true,
            format: true,
            device: true,
            captures: {
                where: { status: 'SUCCESS' },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { screenshotPath: true, createdAt: true },
            },
        },
    })
    const capture = campaign?.captures[0]
    if (!campaign || !capture?.screenshotPath?.startsWith('http')) {
        await respond(context, 'Print indisponivel para essa campanha.', [[button('Menu', 'menu:home')]])
        return
    }

    const formatMap = await getFormatLabelMap()
    await sendPhoto(
        context.chatId,
        capture.screenshotPath,
        `<b>${html(campaign.client)}</b>\nPI ${html(campaign.pi)} | ${html(resolveFormatLabel(formatMap, campaign.format))} / ${html(campaign.device)}\n${html(formatDate(capture.createdAt))}`,
    )
}

async function showLogs(context: BotCommandContext) {
    const logs = await prisma.nexusLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        select: { level: true, message: true, createdAt: true },
    })

    const rows = ['<b>Ultimos logs Nexus</b>', '']
    for (const log of logs) {
        rows.push(
            `<b>${html(log.level)}</b> | ${html(formatTime(log.createdAt))}`,
            html(truncate(log.message, 90)),
            '',
        )
    }
    if (logs.length === 0) rows.push('Sem logs recentes.')

    await respond(context, rows.join('\n').trim(), [
        [button('Atualizar', 'menu:logs')],
        [button('Menu', 'menu:home')],
    ])
}

async function showQuarantine(context: BotCommandContext) {
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: false, status: { in: ['FAILED', 'QUARANTINE'] } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, pi: true, client: true, format: true, status: true, lastWorkerError: true },
    })
    const formatMap = await getFormatLabelMap()
    const rows = ['<b>Falhas e quarentena</b>', '']
    const buttons: TelegramInlineButton[][] = []

    for (const campaign of campaigns) {
        rows.push(
            `<b>${html(campaign.status)}</b> | ${html(campaign.client)} | PI ${html(campaign.pi)}`,
            `${html(resolveFormatLabel(formatMap, campaign.format))}`,
            campaign.lastWorkerError ? html(truncate(campaign.lastWorkerError, 80)) : '',
            '',
        )
        buttons.push([button(`Reprocessar ${campaign.pi}`, `capture:campaign:${campaign.id}`)])
    }

    if (campaigns.length === 0) rows.push('Nenhuma falha ativa.')

    buttons.push([button('Atualizar', 'menu:quarantine'), button('Menu', 'menu:home')])
    await respond(context, rows.join('\n').trim(), buttons)
}

async function showAlerts(context: BotCommandContext) {
    const [settings, reviewCount, authRequiredCount] = await Promise.all([
        prisma.settings.findUnique({ where: { id: 1 }, select: { telegramAlertsEnabled: true, telegramLastAlertAt: true } }),
        prisma.nexusLog.count({ where: { level: GAM_REVIEW_LEVEL } }),
        prisma.nexusLog.count({ where: { level: GAM_AUTH_REQUIRED_LEVEL } }),
    ])

    await respond(
        context,
        [
            '<b>Alertas</b>',
            '',
            `Alertas diarios: ${settings?.telegramAlertsEnabled === false ? 'silenciados' : 'ativos'}`,
            `Ultimo alerta diario: ${settings?.telegramLastAlertAt ? html(formatDate(settings.telegramLastAlertAt)) : 'nunca'}`,
            `Revisoes GAM pendentes: ${reviewCount}`,
            `Login Google pendente: ${authRequiredCount}`,
        ].join('\n'),
        [
            [button('Enviar lembretes de revisao', 'alerts:review-reminders')],
            [button(settings?.telegramAlertsEnabled === false ? 'Ativar alertas diarios' : 'Silenciar alertas diarios', settings?.telegramAlertsEnabled === false ? 'alerts:toggle:on' : 'alerts:toggle:off')],
            [button('Menu', 'menu:home')],
        ],
    )
}

async function toggleDailyAlerts(context: BotCommandContext, enabled: boolean) {
    await prisma.settings.upsert({
        where: { id: 1 },
        update: { telegramAlertsEnabled: enabled },
        create: { id: 1, telegramAlertsEnabled: enabled },
    })
    await showAlerts(context)
}

async function runReviewReminders(context: BotCommandContext) {
    const result = await sendPendingGamReviewReminders()
    await respond(
        context,
        [
            '<b>Lembretes GAM</b>',
            '',
            `Verificados: ${result.checked}`,
            `Enviados: ${result.sent}`,
            `Intervalo: ${result.reminderMinutes} min`,
        ].join('\n'),
        [[button('GAM Orders', 'menu:gam'), button('Menu', 'menu:home')]],
    )
}

async function submitGamOrder(context: BotCommandContext, orderUrl: string) {
    if (!/^https:\/\/admanager\.google\.com\/.+order_id=\d+/i.test(orderUrl)) {
        await respond(context, 'Link de Order GAM invalido.', [[button('Menu', 'menu:home')]])
        return
    }

    const orderId = getOrderIdFromUrl(orderUrl) || 'Unknown'
    const recentCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentJobs = await prisma.nexusLog.findMany({
        where: {
            level: { in: [GAM_PENDING_LEVEL, GAM_RUNNING_LEVEL, GAM_REVIEW_LEVEL, GAM_AUTH_REQUIRED_LEVEL] },
            createdAt: { gte: recentCutoff },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })
    const existingJob = recentJobs.find(job => {
        const details = readDetails(job.details)
        return details.orderId === orderId || details.orderUrl?.includes(`order_id=${orderId}`)
    })

    if (existingJob) {
        const details = readDetails(existingJob.details)
        const triggered = existingJob.level === GAM_PENDING_LEVEL
            ? await triggerGamWorker(existingJob.id)
            : false
        const buttons: TelegramInlineButton[][] = [
            [button('GAM Orders', 'menu:gam')],
            [button('Menu', 'menu:home')],
        ]
        if (existingJob.level === GAM_REVIEW_LEVEL) {
            buttons.unshift([linkButton('Abrir revisao', details.notifications?.reviewUrl || buildGamReviewUrl(existingJob.id))])
        }
        if (existingJob.level === GAM_AUTH_REQUIRED_LEVEL) {
            const refreshUrl = githubWorkflowUrl('gam-session-refresh.yml')
            if (refreshUrl) buttons.unshift([linkButton('Renovar login Google', refreshUrl)])
        }

        await respond(
            context,
            [
                '<b>Order ja esta no Nexus</b>',
                '',
                `Order: <code>${html(orderId)}</code>`,
                `Status: ${html(statusLabel(existingJob.level))}`,
                `Worker reacionado: ${triggered ? 'sim' : 'nao'}`,
            ].join('\n'),
            buttons,
        )
        return
    }

    const job = await prisma.nexusLog.create({
        data: {
            level: GAM_PENDING_LEVEL,
            message: `Nexus Telegram: Order ${orderId} recebida para cadastro automatico`,
            details: JSON.stringify({
                orderUrl,
                orderId,
                mode: 'AUTO_REGISTER',
                source: 'telegram-bot',
                executionLogs: [{
                    at: new Date().toISOString(),
                    message: `Order ${orderId} recebida pelo Telegram Bot`,
                    tone: 'info',
                }],
            }),
        },
    })

    const triggered = await triggerGamWorker(job.id)
    await notifyGamOrderStarted(job.id)
    await nexusLogStore.addLog(
        `Bot Telegram: Order GAM ${orderId} enfileirada.`,
        triggered ? 'SUCCESS' : 'INFO',
        JSON.stringify({ jobId: job.id, orderId, triggered }),
    )

    await respond(
        context,
        [
            '<b>Order GAM recebida</b>',
            '',
            `Order: <code>${html(orderId)}</code>`,
            `Job: <code>${html(job.id)}</code>`,
            `Worker GitHub: ${triggered ? 'acionado' : 'nao acionado automaticamente'}`,
        ].join('\n'),
        [
            [button('Ver GAM Orders', 'menu:gam')],
            [linkButton('Abrir Nexus', `${appUrl()}/nexus`)],
            [button('Menu', 'menu:home')],
        ],
    )
}

function formatDate(value: Date) {
    return value.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function formatTime(value: Date) {
    return value.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

async function handleText(chatId: string, text: string) {
    const context: BotCommandContext = { chatId, isNewMessage: true }
    const orderUrl = extractGamOrderUrl(text)
    if (orderUrl) return submitGamOrder(context, orderUrl)

    const normalized = normalizeText(text)
    const piMatch = normalized.match(/\b(?:capturar|print|prints|capture)\s+(?:pi\s*)?(\d{3,8})\b/)
    if (piMatch) return queuePiCaptures(context, piMatch[1])

    if (/^\/?(start|menu|ajuda|help)$/i.test(normalized)) return showHome(context)
    if (/\bstatus\b/i.test(normalized)) return showStatus(context)
    if (/\b(fila|worker|workers)\b/i.test(normalized)) return showWorkers(context)
    if (/\b(gam|order|orders)\b/i.test(normalized)) return showGamOrders(context)
    if (/\b(captura|capturas|print|prints)\b/i.test(normalized)) return showCaptures(context)
    if (/\b(book|books|comprovante|comprovantes)\b/i.test(normalized)) return showBooks(context)
    if (/\b(log|logs)\b/i.test(normalized)) return showLogs(context)
    if (/\b(alerta|alertas)\b/i.test(normalized)) return showAlerts(context)

    return showHome(context)
}

async function handleCallbackData(chatId: string, messageId: number, data: string) {
    const context: BotCommandContext = { chatId, messageId }

    if (data === 'menu:home') return showHome(context)
    if (data === 'menu:status') return showStatus(context)
    if (data === 'menu:workers') return showWorkers(context)
    if (data === 'menu:gam') return showGamOrders(context)
    if (data === 'menu:captures') return showCaptures(context)
    if (data === 'menu:books') return showBooks(context)
    if (data === 'menu:logs') return showLogs(context)
    if (data === 'menu:alerts') return showAlerts(context)
    if (data === 'menu:quarantine') return showQuarantine(context)

    if (data === 'capture:all') return queueAllActiveCaptures(context)
    if (data.startsWith('capture:pi:')) return queuePiCaptures(context, data.slice('capture:pi:'.length))
    if (data.startsWith('capture:campaign:')) return queueCampaignCapture(context, data.slice('capture:campaign:'.length))

    if (data.startsWith('book:pi:')) return showBookPi(context, data.slice('book:pi:'.length))
    if (data.startsWith('book:photo:')) return sendBookPhoto(context, data.slice('book:photo:'.length))

    if (data === 'alerts:review-reminders') return runReviewReminders(context)
    if (data === 'alerts:toggle:on') return toggleDailyAlerts(context, true)
    if (data === 'alerts:toggle:off') return toggleDailyAlerts(context, false)

    return respond(context, 'Acao desconhecida.', [[button('Menu', 'menu:home')]])
}

export async function handleUpdate(update: any) {
    if (!botToken()) {
        console.warn('[TelegramBot] Update ignorado: NexusTelegram nao configurado.')
        return
    }

    const callbackQuery = update?.callback_query
    if (callbackQuery) {
        const chatId = String(callbackQuery.message?.chat?.id || '')
        const messageId = Number(callbackQuery.message?.message_id || 0)
        const data = String(callbackQuery.data || '')

        if (!await isAuthorized(chatId)) {
            await ackCallback(callbackQuery.id, 'Acesso negado')
            await sendMessage(chatId, `Acesso negado. Chat ID: <code>${html(chatId)}</code>`)
            return
        }

        await ackCallback(callbackQuery.id)
        try {
            await handleCallbackData(chatId, messageId, data)
        } catch (error) {
            console.error('[TelegramBot] Callback error:', error)
            await respond(
                { chatId, messageId },
                `Erro ao executar acao: <code>${html(error instanceof Error ? error.message : String(error))}</code>`,
                [[button('Menu', 'menu:home')]],
            )
        }
        return
    }

    const message = update?.message
    if (!message?.text) return

    const chatId = String(message.chat?.id || '')
    const text = String(message.text || '').trim()

    if (!await isAuthorized(chatId)) {
        await sendMessage(chatId, `Acesso negado. Chat ID: <code>${html(chatId)}</code>`)
        return
    }

    try {
        await handleText(chatId, text)
    } catch (error) {
        console.error('[TelegramBot] Message error:', error)
        await sendMessage(
            chatId,
            `Erro ao processar mensagem: <code>${html(error instanceof Error ? error.message : String(error))}</code>`,
            { reply_markup: keyboard([[button('Menu', 'menu:home')]]) },
        )
    }
}

export function isTelegramWebhookSecretValid(headers: Headers) {
    const secret = webhookSecret()
    if (!secret) return true
    return headers.get('x-telegram-bot-api-secret-token') === secret
}
