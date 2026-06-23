import '../lib/env'
import prisma from '../lib/prisma'
import { processCampaign, processComposition } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'
import { getGmailClient, fetchRecentEmails } from '../lib/gmail'
import { classifyEmail } from '../lib/gemini'
import { processPendingGamJobs } from '../lib/gamJobProcessor'
import { processGovernmentReportQueue } from '../lib/governmentReportAutomation'
import { isFederalCampaignBoundaryToday, shouldQueueScheduledCampaign } from '../lib/campaignSchedule'

const processedEmailIds = new Set<string>()
const DEFAULT_CAPTURE_BATCH_SIZE = 5
const MAX_CAPTURE_BATCH_SIZE = 20
const DEFAULT_CAPTURE_TIMEOUT_MS = 5 * 60 * 1000
const DEFAULT_CAPTURE_LEASE_MINUTES = 15
const MAX_WORKER_RUNTIME_MS = 6 * 60 * 60 * 1000

type WorkerCampaign = {
    id: string
    status: string
    client: string
    pi: string
    format: string
    segmentation: string
    captureCadence: string
    lastCaptureAt: Date | null
}

type WorkerCycleOptions = {
    drainQueue?: boolean
}

function readPositiveInt(value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback
    return Math.min(Math.floor(parsed), max)
}

function readOptionalPositiveInt(value: string | undefined, max = Number.MAX_SAFE_INTEGER) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return null
    return Math.min(Math.floor(parsed), max)
}

function readBooleanFlag(value: string | undefined, fallback: boolean) {
    if (!value) return fallback
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function createWorkerRunId() {
    const githubRun = process.env.GITHUB_RUN_ID || process.env.GITHUB_RUN_NUMBER
    return githubRun ? `gh-${githubRun}` : `local-${Date.now()}`
}

async function claimCampaignBatch(candidateIds: string[], runId: string, limit: number, statuses: string[] = ['QUEUED', 'AUTOCONFIG']) {
    if (candidateIds.length === 0 || limit <= 0) return [] as WorkerCampaign[]
    const leaseMinutes = readPositiveInt(process.env.NEXUS_CAPTURE_LEASE_MINUTES, DEFAULT_CAPTURE_LEASE_MINUTES, 120)

    return await prisma.$queryRawUnsafe<WorkerCampaign[]>(
        `
        update "Campaign" c
        set
            status = 'PROCESSING',
            "updatedAt" = now(),
            "processingStartedAt" = now(),
            "processingHeartbeatAt" = now(),
            "processingRunId" = $2,
            "processingAttempts" = "processingAttempts" + 1,
            "lastWorkerError" = null,
            "lockedUntil" = now() + ($4::int * interval '1 minute')
        where c.id in (
            select id
            from "Campaign"
            where id = any($1::text[])
              and status = any($3::text[])
              and "isArchived" = false
            order by array_position($1::text[], id)
            limit $5
            for update skip locked
        )
        returning
            id,
            status,
            client,
            pi,
            format,
            segmentation,
            "captureCadence",
            "lastCaptureAt"
        `,
        candidateIds,
        runId,
        statuses,
        leaseMinutes,
        limit
    )
}

async function processCampaignWithTimeout(campaignId: string, timeoutMs: number) {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
        controller.abort(new Error(`Timeout de ${Math.round(timeoutMs / 60000)}m`))
    }, timeoutMs)

    try {
        const result = await processCampaign(campaignId, { signal: controller.signal })
        if (!result.success && !result.quarantined) {
            throw new Error(result.error || 'Captura finalizada sem sucesso')
        }
        return result
    } finally {
        clearTimeout(timeout)
    }
}

/**
 * Worker use: check Gmail for new human conversations
 */
async function checkGmail() {
    console.log('[Nexus Worker] Verificando novos e-mails via Gmail API...')
    try {
        const credentials = {
            web: {
                client_id: process.env.GMAIL_CLIENT_ID,
                client_secret: process.env.GMAIL_CLIENT_SECRET,
                redirect_uris: [process.env.GMAIL_REDIRECT_URI]
            }
        }
        const token = { refresh_token: process.env.GMAIL_REFRESH_TOKEN }

        if (credentials.web.client_id && token.refresh_token) {
            const gmail = await getGmailClient(credentials, token)
            const emails = await fetchRecentEmails(gmail)
            const whitelist = (process.env.GMAIL_WHITELIST || '').split(',').map(e => e.trim().toLowerCase())

            for (const email of emails) {
                if (processedEmailIds.has(email.id)) continue
                processedEmailIds.add(email.id)

                const fromEmail = email.from.match(/<(.+?)>/)?.[1] || email.from.toLowerCase()
                const isWhitelisted = whitelist.some(w => w && fromEmail.includes(w))

                const isConversation = isWhitelisted || await classifyEmail(email)

                if (isConversation) {
                    console.log(`[Nexus Worker] 📢 CONVERSA DETECTADA de: ${email.from}`)
                    await nexusLogStore.addLog(
                        `📩 Nova conversa: "${email.subject}" de ${email.from}`,
                        'EMAIL_ALERT',
                        JSON.stringify({
                            from: email.from,
                            to: email.to,
                            subject: email.subject,
                            snippet: email.snippet,
                            threadId: email.threadId,
                            date: email.date
                        })
                    )
                }
            }

            // Cleanup processed set
            if (processedEmailIds.size > 200) {
                const arr = Array.from(processedEmailIds).slice(-100)
                processedEmailIds.clear()
                arr.forEach(id => processedEmailIds.add(id))
            }
        }
    } catch (gmailErr) {
        console.error('[Nexus Worker] Erro no monitoramento do Gmail:', gmailErr)
    }
}

/**
 * Requeues campaigns that are stuck in PROCESSING for too long.
 */
async function cleanupStuckCampaigns() {
    console.log('[Nexus Worker] Verificando campanhas travadas...')
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const stuck = await prisma.campaign.updateMany({
        where: {
            status: 'PROCESSING',
            isArchived: false,
            OR: [
                { lockedUntil: { lt: new Date() } },
                { updatedAt: { lt: oneHourAgo } },
            ],
        },
        data: {
            status: 'QUEUED',
            processingStartedAt: null,
            processingHeartbeatAt: null,
            processingRunId: null,
            lockedUntil: null,
            lastWorkerError: 'Worker interrompido ou lease expirado',
        }
    })

    if (stuck.count > 0) {
        console.log(`[Nexus Worker] Reenfileiradas ${stuck.count} campanhas travadas.`)
        await nexusLogStore.addLog(`Nexus: Reenfileiradas ${stuck.count} campanhas que estavam em processamento ha mais de 1h.`, 'SYSTEM')
    }
}

async function cleanupOffScheduleFederalQueue(now: Date) {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000)
    const queued = await prisma.campaign.findMany({
        where: {
            segmentation: 'GOV_FEDERAL',
            captureCadence: 'BOUNDARY',
            status: 'QUEUED',
            isArchived: false,
            updatedAt: { lt: staleBefore },
        },
    })
    const offBoundary = queued.filter(campaign => !isFederalCampaignBoundaryToday(campaign, now))
    if (offBoundary.length === 0) return

    const withCapture = offBoundary.filter(campaign => campaign.lastCaptureAt).map(campaign => campaign.id)
    const withoutCapture = offBoundary.filter(campaign => !campaign.lastCaptureAt).map(campaign => campaign.id)
    await prisma.$transaction([
        prisma.campaign.updateMany({
            where: { id: { in: withCapture }, status: 'QUEUED' },
            data: { status: 'SUCCESS' },
        }),
        prisma.campaign.updateMany({
            where: { id: { in: withoutCapture }, status: 'QUEUED' },
            data: { status: 'PENDING' },
        }),
    ])
    await nexusLogStore.addLog(
        `Nexus Worker: ${offBoundary.length} fila(s) federais fora do inicio/fim foram removidas`,
        'SYSTEM'
    )
}

/**
 * Main worker logic cycle
 */
async function runWorkerCycle(options: WorkerCycleOptions = {}) {
    console.log('[Nexus Worker] Iniciando ciclo de processamento...')
    const runId = createWorkerRunId()
    const cycleStartedAt = Date.now()
    const captureBatchSize = readPositiveInt(process.env.NEXUS_CAPTURE_BATCH_SIZE, DEFAULT_CAPTURE_BATCH_SIZE, MAX_CAPTURE_BATCH_SIZE)
    const captureTimeoutMs = readPositiveInt(process.env.NEXUS_CAPTURE_TIMEOUT_MS, DEFAULT_CAPTURE_TIMEOUT_MS, 20 * 60 * 1000)
    const maxRuntimeMs = readOptionalPositiveInt(process.env.NEXUS_WORKER_MAX_RUNTIME_MS, MAX_WORKER_RUNTIME_MS)
    const deadlineAt = maxRuntimeMs ? cycleStartedAt + maxRuntimeMs : null
    const drainQueue = options.drainQueue ?? false
    const captureSummary = {
        claimed: 0,
        success: 0,
        failed: 0,
        timeout: 0,
        quarantine: 0,
        batchesClaimed: 0,
        drainPasses: 0,
        stoppedByDeadline: false,
    }
    await nexusLogStore.addLog(
        'Nexus Worker: Ciclo iniciado no servidor.',
        'SYSTEM',
        JSON.stringify({ runId, captureBatchSize, captureTimeoutMs, drainQueue, maxRuntimeMs })
    )
    const targetedCampaignIds = [...new Set(
        (process.env.TARGET_CAMPAIGN_IDS || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean)
    )]
    
    const now = new Date()
    const brtNowStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    const brtNow = new Date(brtNowStr)
    // 0. Cleanup
    await cleanupStuckCampaigns()
    if (targetedCampaignIds.length === 0) await cleanupOffScheduleFederalQueue(now)

    // 1. Gmail Check
    try {
        await checkGmail()
    } catch (err) {
        console.error('[Nexus Worker] Falha no checkGmail:', err)
    }

    // 2. Automated Scheduling Check
    try {
        const scheduledCampaigns = await prisma.campaign.findMany({
            where: {
                isScheduled: true,
                isArchived: false,
                status: { notIn: ['EXPIRED', 'FINISHED', 'PROCESSING', 'QUEUED'] },
            }
        })

        const toQueueIds = scheduledCampaigns
            .filter(campaign => shouldQueueScheduledCampaign(campaign, now))
            .map(campaign => campaign.id)

        if (toQueueIds.length > 0) {
            await prisma.campaign.updateMany({
                where: { id: { in: toQueueIds } },
                data: { status: 'QUEUED' }
            })
            await nexusLogStore.addLog(`Nexus Worker: ${toQueueIds.length} campanhas agendadas enfileiradas automaticamente`, 'SYSTEM')
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro no agendamento:', err)
    }

    // 4. Government campaign final reports
    try {
        await processGovernmentReportQueue(now)
    } catch (err) {
        console.error('[Nexus Worker] Erro nos relatorios de Governo Federal:', err)
        await nexusLogStore.addLog(
            `Relatorio Governo Federal: falha no ciclo do worker: ${err instanceof Error ? err.message : String(err)}`,
            'ERROR'
        )
    }

    // 5. GAM Ingestion Jobs (supervised draft)
    try {
        await processPendingGamJobs()
    } catch (err) {
        console.error('[Nexus Worker] Erro nos Jobs GAM:', err)
    }

    // 6. Telegram Performance Alerts (Simplified)
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        if (settings?.telegramAlertsEnabled && brtNow.getHours() >= 9) {
            const lastAlert = settings.telegramLastAlertAt ? new Date(settings.telegramLastAlertAt) : null
            const isNewDay = !lastAlert || new Date(lastAlert.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDate() !== brtNow.getDate()

            if (isNewDay) {
                const { sendTelegramAlert } = await import('../lib/telegram')
                const { getAggregatedAdOpsMetrics } = await import('../app/adops/actions')
                const stats = await getAggregatedAdOpsMetrics()
                // ... (existing alert logic simplified for brevity but kept functional)
                const critical = stats.campaigns.filter(c => c.status === 'critical')
                if (critical.length > 0) {
                    await sendTelegramAlert('Performance Alert', `🚨 Nexus: Existem ${critical.length} campanhas em estado CRÍTICO.`)
                }
                await prisma.settings.update({ where: { id: 1 }, data: { telegramLastAlertAt: new Date() } })
            }
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro nos alertas Telegram:', err)
    }

    // 7. Daily Impression Threshold Alerts
    try {
        const thresholdCampaigns = await prisma.campaign.findMany({
            where: {
                dailyGoalThreshold: { not: null },
                isArchived: false,
            }
        })

        if (thresholdCampaigns.length > 0) {
            const { getAggregatedAdOpsMetrics } = await import('../app/adops/actions')
            const { sendTelegramAlert } = await import('../lib/telegram')
            const stats = await getAggregatedAdOpsMetrics()

            for (const campaign of thresholdCampaigns) {
                const metric = stats.campaigns.find(c => c.pi === campaign.pi)
                const deliveredToday = metric?.bi?.deliveredToday || 0
                const threshold = campaign.dailyGoalThreshold!
                
                // Check if already alerted today
                const lastAlert = campaign.lastThresholdAlertAt
                const alertedToday = lastAlert && new Date(lastAlert.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })).getDate() === brtNow.getDate()

                if (!alertedToday && deliveredToday >= threshold * 0.9) {
                    const status = deliveredToday >= threshold ? 'ATINGIDO' : 'PRÓXIMO'
                    const emoji = deliveredToday >= threshold ? '✅' : '⚡'
                    
                    await sendTelegramAlert(
                        'Meta Diária', 
                        `${emoji} Nexus: Limite diário ${status} para **${campaign.client}** (PI ${campaign.pi})\n- Meta: ${threshold.toLocaleString()}\n- Entregue hoje: ${deliveredToday.toLocaleString()}\n- Progresso: ${((deliveredToday / threshold) * 100).toFixed(1)}%`
                    )

                    await prisma.campaign.update({
                        where: { id: campaign.id },
                        data: { lastThresholdAlertAt: new Date() }
                    })
                    
                    await nexusLogStore.addLog(`Nexus Worker: Alerta de limite diário [${status}] enviado para ${campaign.client}`, 'SYSTEM')
                }
            }
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro nos alertas de limite diário:', err)
    }

    // 8. Campaign Capture (movido para o final)
    try {
        const captureCutoff = new Date()
        let batchNumber = 0

        while (true) {
            if (deadlineAt && Date.now() >= deadlineAt) {
                captureSummary.stoppedByDeadline = true
                await nexusLogStore.addLog(
                    `Nexus Worker: drenagem interrompida por limite de runtime apos ${captureSummary.batchesClaimed} lote(s)`,
                    'ERROR',
                    JSON.stringify({ runId, captureCutoff, maxRuntimeMs, captureSummary })
                )
                break
            }

            captureSummary.drainPasses++
            batchNumber++

        const queuedCandidates = await prisma.campaign.findMany({
            where: {
                status: 'QUEUED',
                isArchived: false,
                updatedAt: { lte: captureCutoff },
                ...(targetedCampaignIds.length > 0 ? { id: { in: targetedCampaignIds } } : {})
            },
            orderBy: { updatedAt: 'asc' },
            take: 100
        })
        const boundaryFederal = targetedCampaignIds.length > 0
            ? []
            : queuedCandidates.filter(campaign => isFederalCampaignBoundaryToday(campaign, now))
        const regularQueue = targetedCampaignIds.length > 0
            ? queuedCandidates
            : queuedCandidates.filter(campaign => (
                campaign.segmentation.trim().toUpperCase() !== 'GOV_FEDERAL'
                || campaign.captureCadence.trim().toUpperCase() === 'DAILY'
            ))
        const queuedCampaigns = targetedCampaignIds.length > 0
            ? regularQueue
            : [...boundaryFederal, ...regularQueue.slice(0, Math.max(0, captureBatchSize - boundaryFederal.length))]

        const autoconfigCampaigns = targetedCampaignIds.length > 0 || queuedCampaigns.length >= captureBatchSize ? [] : await prisma.campaign.findMany({
            where: {
                status: 'AUTOCONFIG',
                isArchived: false,
                updatedAt: { lte: captureCutoff },
            },
            orderBy: { updatedAt: 'asc' },
            take: captureBatchSize - queuedCampaigns.length
        })

        const autoconfigIds = new Set(autoconfigCampaigns.map(campaign => campaign.id))
        const candidateIds = [...queuedCampaigns, ...autoconfigCampaigns].map(campaign => campaign.id)
        const campaigns = await claimCampaignBatch(candidateIds, runId, captureBatchSize)
        captureSummary.claimed += campaigns.length
        if (campaigns.length > 0) captureSummary.batchesClaimed++

        if (campaigns.length > 0) {
            if (targetedCampaignIds.length > 0) {
                await nexusLogStore.addLog(
                    `Nexus Worker: captura manual direcionada para ${campaigns.length} de ${targetedCampaignIds.length} item(ns)`,
                    'SYSTEM',
                    JSON.stringify({ runId, batchNumber, captureCutoff })
                )
            }
            console.log(`[Nexus Worker] Lote ${batchNumber}: ${campaigns.length} campanhas/montagens para processar.`)
            await nexusLogStore.addLog(
                `Nexus Worker: Processando lote ${batchNumber} com ${campaigns.length} itens`,
                'SYSTEM',
                JSON.stringify({ runId, batchNumber, captureCutoff, drainQueue, captureBatchSize })
            )

            for (const campaign of campaigns) {
                if (autoconfigIds.has(campaign.id)) {
                    console.log(`[Nexus Worker] Realizando MONTAGEM: ${campaign.client} (PI ${campaign.pi})`)
                    try {
                        await processComposition(campaign.id)
                        captureSummary.success++
                        await nexusLogStore.addLog(`Nexus Worker: Montagem automatizada concluída para ${campaign.client}`, 'SUCCESS', undefined, campaign.id)
                    } catch (err) {
                        captureSummary.failed++
                        const message = err instanceof Error ? err.message : String(err)
                        console.error(`[Nexus Worker] Erro na montagem ${campaign.pi}:`, err)
                        await prisma.campaign.update({
                            where: { id: campaign.id },
                            data: {
                                status: 'AUTOCONFIG',
                                processingStartedAt: null,
                                processingHeartbeatAt: null,
                                processingRunId: null,
                                lockedUntil: null,
                                lastWorkerError: message,
                            }
                        }) // Retry
                    }
                    continue
                }

                console.log(`[Nexus Worker] Capturando: ${campaign.client} (PI ${campaign.pi})`)
                try {
                    const result = await processCampaignWithTimeout(campaign.id, captureTimeoutMs)
                    if (result.success) {
                        captureSummary.success++
                    } else if (result.quarantined) {
                        captureSummary.failed++
                        captureSummary.quarantine++
                    }
                } catch (err) {
                    captureSummary.failed++
                    const message = err instanceof Error ? err.message : String(err)
                    if (message.toLowerCase().includes('timeout')) captureSummary.timeout++
                    console.error(`[Nexus Worker] Erro em ${campaign.pi}:`, err)
                    await prisma.campaign.update({
                        where: { id: campaign.id },
                        data: {
                            status: 'QUEUED',
                            processingStartedAt: null,
                            processingHeartbeatAt: null,
                            processingRunId: null,
                            lockedUntil: null,
                            lastWorkerError: message,
                        }
                    })
                }
        }

            }

            if (campaigns.length === 0 || !drainQueue) break
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro no ciclo de captura:', err)
    }

    // A daily federal report is released only after every format has a
    // successful capture for the current Brasilia date.
    try {
        await processGovernmentReportQueue(new Date())
    } catch (err) {
        console.error('[Nexus Worker] Erro nos relatorios apos as capturas:', err)
    }

    const durationMs = Date.now() - cycleStartedAt
    await nexusLogStore.addLog(
        `Nexus Worker: Ciclo finalizado (${captureSummary.success} sucesso, ${captureSummary.failed} falha)`,
        captureSummary.failed > 0 ? 'ERROR' : 'SUCCESS',
        JSON.stringify({ runId, durationMs, captureSummary, captureBatchSize, captureTimeoutMs, drainQueue, maxRuntimeMs })
    )
}

/**
 * Entry point
 */
async function startWorker() {
    const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.NODE_ENV === 'production'
    const drainQueue = readBooleanFlag(process.env.NEXUS_WORKER_DRAIN_QUEUE, isCI)
    console.log(`[Nexus Worker] Iniciado em modo ${isCI ? 'CI/PROD' : 'LOCAL'}`)

    if (isCI) {
        try {
            await runWorkerCycle({ drainQueue })
        } finally {
            await prisma.$disconnect()
        }
        process.exit(0)
    } else {
        while (true) {
            await runWorkerCycle({ drainQueue })
            await new Promise(r => setTimeout(r, 60000))
        }
    }
}

startWorker().catch(err => {
    console.error('[Nexus Worker] Erro fatal:', err)
    process.exit(1)
})
