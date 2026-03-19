import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
import prisma from '../lib/prisma'
import { processCampaign } from '../lib/captureService'
import { nexusLogStore } from '../lib/nexusLogStore'
import { getGmailClient, fetchRecentEmails } from '../lib/gmail'
import { classifyEmail } from '../lib/gemini'

async function worker() {
    console.log('[Nexus Worker] Iniciando processamento de fila...')
    await nexusLogStore.addLog('Nexus Worker: Iniciando ciclo de capturas', 'SYSTEM')
    
    // --- 0. PRIORIDADE: Gmail Monitoring & AI Filtering ---
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
            
            console.log(`[Nexus Worker] ${emails.length} novos e-mails encontrados para análise.`)
            
            for (const email of emails) {
                console.log(`[Nexus Worker] Analisando e-mail: "${email.subject}" de ${email.from}`)
                const fromEmail = email.from.match(/<(.+?)>/)?.[1] || email.from.toLowerCase()
                const isWhitelisted = whitelist.some(w => w && fromEmail.includes(w))
                
                const isConversation = isWhitelisted || await classifyEmail(email.subject, email.snippet, email.from)
                
                if (isConversation) {
                    console.log(`[Nexus Worker] 📢 CONVERSA DETECTADA (Nexus AI: YES) de: ${email.from}`)
                    await nexusLogStore.addLog(
                        `📩 Nova conversa detectada: "${email.subject}" de ${email.from}`, 
                        'EMAIL_ALERT',
                        JSON.stringify({
                            from: email.from,
                            subject: email.subject,
                            snippet: email.snippet,
                            threadId: email.threadId
                        })
                    )
                } else {
                    console.log(`[Nexus Worker] 🔇 E-mail ignorado (Nexus AI: NO) de: ${email.from}`)
                }
            }
        }
    } catch (gmailErr) {
        console.error('[Nexus Worker] Erro no monitoramento do Gmail:', gmailErr)
    }

    try {
        // 1. Auto-enquadramento (Scheduling Check)
        // Busca campanhas agendadas que precisam ser movidas para a fila
        const brtNowStr = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const brtNow = new Date(brtNowStr);
        const today = new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()));
        const currentTime = `${String(brtNow.getHours()).padStart(2, '0')}:${String(brtNow.getMinutes()).padStart(2, '0')}`;

        console.log(`[Nexus Worker] Verificando agendamentos (Data: ${today.toISOString()}, Hora: ${currentTime})`)

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
        });

        const toQueueIds = scheduledCampaigns.filter(c => {
            try {
                const times = JSON.parse(c.scheduledTimes || '[]') as string[];
                const lastCapture = c.lastCaptureAt ? new Date(c.lastCaptureAt) : null;

                return times.some((t: string) => {
                    const [h, m] = t.split(':').map(Number);
                    const scheduledDate = new Date(today);
                    scheduledDate.setUTCHours(h + 3, m, 0, 0); // Convert BRT to UTC (assuming BRT is UTC-3)

                    // Se o horário agendado já passou e não houve captura hoje depois desse horário
                    const hasPassed = brtNow.getTime() >= (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime();
                    const notCapturedYet = !lastCapture || lastCapture.getTime() < (new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), h, m)).getTime();

                    return hasPassed && notCapturedYet;
                });
            } catch { return false; }
        }).map(c => c.id);

        if (toQueueIds.length > 0) {
            console.log(`[Nexus Worker] Enfileirando ${toQueueIds.length} campanhas agendadas pendentes.`)
            await prisma.campaign.updateMany({
                where: { id: { in: toQueueIds } },
                data: { status: 'QUEUED' }
            });
            await nexusLogStore.addLog(`Nexus Worker: ${toQueueIds.length} campanhas agendadas enfileiradas automaticamente`, 'SYSTEM');
        }

        // 2. Buscar campanhas que precisam de captura
        // - Status PENDING ou QUEUED
        // - Que não foram arquivadas
        const campaigns = await prisma.campaign.findMany({
            where: {
                status: { in: ['PENDING', 'QUEUED'] },
                isArchived: false
            },
        })

        if (campaigns.length === 0) {
            console.log('[Nexus Worker] Campanha não encontrada para debug.')
            return
        }

        console.log(`[Nexus Worker] Encontradas ${campaigns.length} campanhas para processar.`)
        await nexusLogStore.addLog(`Nexus Worker: Processando ${campaigns.length} itens`, 'SYSTEM')

        for (const campaign of campaigns) {
            console.log(`[Nexus Worker] Processando: ${campaign.client} - ${campaign.format}`)

            try {
                // Atualiza para PROCESSING para evitar duplicidade (embora o GHA rode serial)
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { status: 'PROCESSING' }
                })

                const result = await processCampaign(campaign.id)

                if (result.success) {
                    console.log(`[Nexus Worker] Sucesso: ${campaign.id}`)
                } else {
                    console.error(`[Nexus Worker] Falha: ${campaign.id} - ${result.error}`)
                }
            } catch (err) {
                console.error(`[Nexus Worker] Erro crítico na campanha ${campaign.id}:`, err)
            }
        }

        // 3. Email Dispatch Check — send reports for ended campaigns (grouped by PI)
        console.log('[Nexus Worker] Verificando disparos de email pendentes...')
        try {
            const pendingDispatches = await (prisma as any).emailDispatch.findMany({
                where: {
                    isActive: true,
                    status: 'PENDING',
                },
            })

            for (const dispatch of pendingDispatches) {
                const pi = dispatch.pi
                if (!pi) continue

                // Get all campaigns with this PI to check flightEnd
                const piCampaigns = await prisma.campaign.findMany({
                    where: { pi, isArchived: false },
                    select: { id: true, client: true, flightEnd: true }
                })

                if (piCampaigns.length === 0) continue

                // Check if ANY campaign in the group has ended
                const hasEnded = piCampaigns.some(c => {
                    if (!c.flightEnd) return false
                    const flightEndDate = new Date(c.flightEnd)
                    const flightEndDay = new Date(Date.UTC(flightEndDate.getFullYear(), flightEndDate.getMonth(), flightEndDate.getDate()))
                    return flightEndDay <= today
                })

                if (!hasEnded) continue

                // Check if dispatch time has passed
                const [dh, dm] = dispatch.dispatchTime.split(':').map(Number)
                const dispatchMoment = new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate(), dh, dm)

                if (brtNow < dispatchMoment) continue

                // Check if already sent today
                if (dispatch.lastSentAt) {
                    const lastSent = new Date(dispatch.lastSentAt)
                    const lastSentDay = new Date(lastSent.getFullYear(), lastSent.getMonth(), lastSent.getDate())
                    const todayDay = new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate())
                    if (lastSentDay.getTime() >= todayDay.getTime()) continue
                }

                // Send the report!
                const firstClient = piCampaigns[0].client
                console.log(`[Nexus Worker] Disparando email para campanha ${firstClient} (PI: ${pi})...`)
                await nexusLogStore.addLog(`Nexus Worker: Disparando email de fim de veiculação para ${firstClient} (PI: ${pi})`, 'SYSTEM')

                const recipients = JSON.parse(dispatch.recipients) as string[]
                const { sendCampaignReport } = await import('../lib/emailService')
                await sendCampaignReport({
                    pi,
                    recipients,
                    dispatchId: dispatch.id,
                })
            }
        } catch (emailErr) {
            console.error('[Nexus Worker] Erro no módulo de email dispatch:', emailErr)
            await nexusLogStore.addLog('Nexus Worker: Erro ao processar disparos de email', 'ERROR')
        }


    } catch (error) {
        console.error('[Nexus Worker] Erro fatal no worker:', error)
        await nexusLogStore.addLog('Nexus Worker: Erro fatal durante a execução', 'ERROR')
    } finally {
        console.log('[Nexus Worker] Ciclo finalizado.')
        await nexusLogStore.addLog('Nexus Worker: Ciclo finalizado', 'SYSTEM')
        await prisma.$disconnect()
    }
}

// Executar
worker()
