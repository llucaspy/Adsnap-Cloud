import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import prisma from '../lib/prisma'
import { processCampaign } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'
import { getGmailClient, fetchRecentEmails } from '../lib/gmail'
import { classifyEmail } from '../lib/gemini'

let lastGmailCheck = 0
const GMAIL_CHECK_INTERVAL = 2 * 60 * 1000 // 2 minutes
const processedEmailIds = new Set<string>()

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

            if (emails.length > 0) {
                console.log(`[Nexus Worker] ${emails.length} e-mails endereçados a você encontrados.`)
            }

            for (const email of emails) {
                // Skip already-processed emails
                if (processedEmailIds.has(email.id)) continue
                processedEmailIds.add(email.id)

                console.log(`[Nexus Worker] Analisando: "${email.subject}" de ${email.from}`)
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

            // Keep the set from growing indefinitely
            if (processedEmailIds.size > 200) {
                const arr = Array.from(processedEmailIds)
                arr.splice(0, arr.length - 100)
                processedEmailIds.clear()
                arr.forEach(id => processedEmailIds.add(id))
            }
        }
        lastGmailCheck = Date.now()
    } catch (gmailErr) {
        console.error('[Nexus Worker] Erro no monitoramento do Gmail:', gmailErr)
    }
}

async function runWorkerCycle() {
    console.log('[Nexus Worker] Iniciando ciclo de processamento...')
    
    // 1. Gmail Check (Highest Priority)
    await checkGmail()

    try {
        // 2. Auto-enquadramento (Scheduling Check)
        const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
        const brtNow = new Date(brtNowStr)
        const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()))

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
                    const hasPassed = brtNow.getTime() >= (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime()
                    const notCapturedYet = !lastCapture || lastCapture.getTime() < (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime()
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

        // 3. Captura de Campanhas
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['PENDING', 'QUEUED'] },
                isArchived: false
            },
        })

        if (campaigns.length > 0) {
            console.log(`[Nexus Worker] Encontradas ${campaigns.length} campanhas para processar.`)
            await nexusLogStore.addLog(`Nexus Worker: Processando ${campaigns.length} itens`, 'SYSTEM')

            for (const campaign of campaigns) {
                if (Date.now() - lastGmailCheck > GMAIL_CHECK_INTERVAL) {
                    await checkGmail()
                }

                console.log(`[Nexus Worker] Processando: ${campaign.client} - ${campaign.format}`)
                try {
                    await prisma.campaign.update({
                        where: { id: campaign.id },
                        data: { status: 'PROCESSING' }
                    })
                    await processCampaign(campaign.id)
                } catch (err) {
                    console.error(`[Nexus Worker] Erro na campanha ${campaign.id}:`, err)
                }
            }
        }

        // 4. Email Dispatch Check
        const pendingDispatches = await (prisma as any).emailDispatch.findMany({
            where: { isActive: true, status: 'PENDING' },
        })

        for (const dispatch of pendingDispatches) {
            const pi = dispatch.pi
            if (!pi) continue

            const piCampaigns = await prisma.campaign.findMany({
                where: { pi, isArchived: false },
                select: { id: true, client: true, flightEnd: true }
            })

            if (piCampaigns.length === 0) continue

            const hasEnded = piCampaigns.some(c => {
                if (!c.flightEnd) return false
                const flightEndDate = new Date(c.flightEnd)
                const flightEndDay = new Date(Date.UTC(flightEndDate.getFullYear(), flightEndDate.getMonth(), flightEndDate.getDate()))
                return flightEndDay <= today
            })

            if (!hasEnded) continue

            const [dh, dm] = dispatch.dispatchTime.split(':').map(Number)
            const dispatchMoment = new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), dh, dm)

            if (brtNow < dispatchMoment) continue
            if (dispatch.lastSentAt) {
                const lastSent = new Date(dispatch.lastSentAt)
                const lastSentDay = new Date(lastSent.getFullYear(), lastSent.getMonth(), lastSent.getDate())
                const todayDay = new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate())
                if (lastSentDay.getTime() >= todayDay.getTime()) continue
            }

            console.log(`[Nexus Worker] Disparando email para PI ${pi}...`)
            const recipients = JSON.parse(dispatch.recipients) as string[]
            const { sendCampaignReport } = await import('../lib/emailService')
            await sendCampaignReport({ pi, recipients, dispatchId: dispatch.id })
        }
        
        // 5. Telegram Performance Alerts
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        if (settings?.telegramAlertsEnabled) {
            const now = new Date()
            const brtNowTg = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
            if (brtNowTg.getHours() >= 9) {
                const lastAlert = settings.telegramLastAlertAt ? new Date(settings.telegramLastAlertAt) : null
                const lastAlertBRT = lastAlert ? new Date(lastAlert.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })) : null
                const isNewDay = !lastAlertBRT || lastAlertBRT.getDate() !== brtNowTg.getDate()

                if (isNewDay) {
                    const { sendTelegramAlert } = await import('../lib/telegram')
                    const { getAggregatedAdOpsMetrics } = await import('../app/adops/actions')
                    const stats = await getAggregatedAdOpsMetrics()
                    const critical = stats.campaigns.filter((c: any) => c.status === 'critical')
                    const warning = stats.campaigns.filter((c: any) => c.status === 'warning')
                    const over = stats.campaigns.filter((c: any) => c.status === 'over')

                    if (critical.length > 0 || warning.length > 0 || over.length > 0) {
                        let msg = '📊 *RESUMO DIÁRIO DE PERFORMANCE*\n\n'
                        if (critical.length > 0) {
                            msg += `🚨 *CRÍTICO (${critical.length})*\n`
                            critical.forEach((c: any) => msg += `• ${c.advertiser}: ${c.name} (${Math.round((c.deliveredImpressions/c.goalImpressions)*100)}%)\n`)
                            msg += '\n'
                        }
                        if (warning.length > 0) {
                            msg += `⚠️ *UNDER (${warning.length})*\n`
                            warning.forEach((c: any) => msg += `• ${c.advertiser}: ${c.name} (${Math.round((c.deliveredImpressions/c.goalImpressions)*100)}%)\n`)
                            msg += '\n'
                        }
                        if (over.length > 0) {
                            msg += `📈 *OVER (${over.length})*\n`
                            over.forEach((c: any) => msg += `• ${c.advertiser}: ${c.name} (${Math.round((c.deliveredImpressions/c.goalImpressions)*100)}%)\n`)
                            msg += '\n'
                        }
                        msg += `\n🔗 [Ver no AdOps Dashboard](${process.env.NEXT_PUBLIC_APP_URL || 'https://adsnap-cloud.vercel.app'}/adops)`
                        await sendTelegramAlert('Performance Alert', msg)
                    }
                    await prisma.settings.update({ where: { id: 1 }, data: { telegramLastAlertAt: now } })
                }
            }
        }

    } catch (error) {
        console.error('[Nexus Worker] Erro no ciclo:', error)
    } finally {
        await prisma.$disconnect()
    }
}

async function startWorker() {
    console.log('[Nexus Worker] Sistema iniciado em modo contínuo.')
    while (true) {
        try {
            await runWorkerCycle()
        } catch (err) {
            console.error('[Nexus Worker] Erro crítico no loop principal:', err)
        }
        await new Promise(resolve => setTimeout(resolve, 60000))
    }
}

startWorker()
