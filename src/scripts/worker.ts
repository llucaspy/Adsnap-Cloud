import '../lib/env'
import prisma from '../lib/prisma'
import { processCampaign } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'
import { getGmailClient, fetchRecentEmails } from '../lib/gmail'
import { classifyEmail } from '../lib/gemini'

let lastGmailCheck = 0
const GMAIL_CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes
const processedEmailIds = new Set<string>()

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
        lastGmailCheck = Date.now()
    } catch (gmailErr) {
        console.error('[Nexus Worker] Erro no monitoramento do Gmail:', gmailErr)
    }
}

/**
 * Resets campaigns that are stuck in PROCESSING or QUEUED for too long.
 */
async function cleanupStuckCampaigns() {
    console.log('[Nexus Worker] Verificando campanhas travadas...')
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

    const stuck = await prisma.campaign.updateMany({
        where: {
            status: { in: ['PROCESSING', 'QUEUED'] },
            updatedAt: { lt: oneHourAgo },
            isArchived: false
        },
        data: {
            status: 'PENDING'
        }
    })

    if (stuck.count > 0) {
        console.log(`[Nexus Worker] Resetadas ${stuck.count} campanhas travadas.`)
        await nexusLogStore.addLog(`Nexus: Resetadas ${stuck.count} campanhas que estavam travadas há mais de 1h.`, 'SYSTEM')
    }
}

/**
 * Main worker logic cycle
 */
async function runWorkerCycle() {
    console.log('[Nexus Worker] Iniciando ciclo de processamento...')
    await nexusLogStore.addLog('Nexus Worker: Ciclo iniciado no servidor.', 'SYSTEM')
    
    const now = new Date()
    const brtNowStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
    const brtNow = new Date(brtNowStr)
    const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()))

    // 0. Cleanup
    await cleanupStuckCampaigns()

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
                OR: [
                    { flightStart: { lte: today }, flightEnd: { gte: today } },
                    { flightStart: null, flightEnd: null }
                ]
            }
        })

        const toQueueIds = scheduledCampaigns.filter(c => {
            try {
                const times = JSON.parse(c.scheduledTimes || '[]') as string[]
                const lastCapture = c.lastCaptureAt ? new Date(c.lastCaptureAt) : null

                return times.some((t: string) => {
                    const [h, m] = t.split(':').map(Number)
                    const scheduledMoment = new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)
                    const hasPassed = brtNow.getTime() >= scheduledMoment.getTime()
                    const notCapturedYet = !lastCapture || lastCapture.getTime() < scheduledMoment.getTime()
                    return hasPassed && notCapturedYet
                })
            } catch { return false }
        }).map(c => c.id)

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

    // 3. Campaign Capture
    try {
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['PENDING', 'QUEUED'] },
                isArchived: false
            },
            take: 20
        })

        if (campaigns.length > 0) {
            console.log(`[Nexus Worker] Encontradas ${campaigns.length} campanhas para processar.`)
            await nexusLogStore.addLog(`Nexus Worker: Processando lote de ${campaigns.length} itens`, 'SYSTEM')

            for (const campaign of campaigns) {
                // Atomic claim
                const claim = await prisma.campaign.updateMany({
                    where: { id: campaign.id, status: { in: ['PENDING', 'QUEUED'] } },
                    data: { status: 'PROCESSING', updatedAt: new Date() }
                })

                if (claim.count === 0) continue

                console.log(`[Nexus Worker] Capturando: ${campaign.client} (PI ${campaign.pi})`)
                try {
                    await Promise.race([
                        processCampaign(campaign.id),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de 5m')), 300000))
                    ])
                } catch (err) {
                    console.error(`[Nexus Worker] Erro em ${campaign.pi}:`, err)
                    await prisma.campaign.update({
                        where: { id: campaign.id },
                        data: { status: 'PENDING' }
                    })
                }
            }
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro no ciclo de captura:', err)
    }

    // 4. Telegram Performance Alerts (Simplified)
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
                const critical = stats.campaigns.filter((c: any) => c.status === 'critical')
                if (critical.length > 0) {
                    await sendTelegramAlert('Performance Alert', `🚨 Nexus: Existem ${critical.length} campanhas em estado CRÍTICO.`)
                }
                await prisma.settings.update({ where: { id: 1 }, data: { telegramLastAlertAt: new Date() } })
            }
        }
    } catch (err) {
        console.error('[Nexus Worker] Erro nos alertas Telegram:', err)
    }

    await prisma.$disconnect()
}

/**
 * Entry point
 */
async function startWorker() {
    const isCI = process.env.GITHUB_ACTIONS === 'true' || process.env.NODE_ENV === 'production'
    console.log(`[Nexus Worker] Iniciado em modo ${isCI ? 'CI/PROD' : 'LOCAL'}`)

    if (isCI) {
        await runWorkerCycle()
        process.exit(0)
    } else {
        while (true) {
            await runWorkerCycle()
            await new Promise(r => setTimeout(r, 60000))
        }
    }
}

startWorker().catch(err => {
    console.error('[Nexus Worker] Erro fatal:', err)
    process.exit(1)
})
