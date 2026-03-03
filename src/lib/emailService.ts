import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'

// ============================================================================
// EMAIL SERVICE — Dispatch campaign prints via Resend
// ============================================================================

interface SendReportOptions {
    campaignId: string
    recipients: string[]
    dispatchId: string
}

export async function sendCampaignReport({ campaignId, recipients, dispatchId }: SendReportOptions): Promise<{ success: boolean; error?: string }> {
    console.log(`[Email Service] Preparando relatório para campanha ${campaignId}...`)

    try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY não configurada')
        }

        // 1. Get campaign details
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: {
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                pi: true,
                url: true,
                device: true,
                flightStart: true,
                flightEnd: true,
            }
        })

        if (!campaign) {
            throw new Error(`Campanha ${campaignId} não encontrada`)
        }

        // 2. Get all successful captures in the flight period
        const whereClause: any = {
            campaignId,
            status: 'SUCCESS',
            screenshotPath: { not: '' }
        }
        if (campaign.flightStart && campaign.flightEnd) {
            whereClause.createdAt = {
                gte: campaign.flightStart,
                lte: new Date(campaign.flightEnd.getTime() + 24 * 60 * 60 * 1000) // Include the end day
            }
        }

        const captures = await prisma.capture.findMany({
            where: whereClause,
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                screenshotPath: true,
                createdAt: true,
            }
        })

        if (captures.length === 0) {
            console.log(`[Email Service] Nenhuma captura encontrada para campanha ${campaignId}`)
            await nexusLogStore.addLog(`Email Service: Nenhuma captura encontrada para disparo`, 'ERROR', undefined, campaignId)
            return { success: false, error: 'Nenhuma captura encontrada no período' }
        }

        console.log(`[Email Service] ${captures.length} captures encontradas. Compondo email...`)

        // 3. Format dates
        const flightStartStr = campaign.flightStart
            ? campaign.flightStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'N/A'
        const flightEndStr = campaign.flightEnd
            ? campaign.flightEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'N/A'

        // 4. Build image grid HTML
        const imageGridHtml = captures.map((cap, idx) => {
            const captureDate = cap.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            const captureTime = cap.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            return `
                <div style="text-align: center; margin-bottom: 16px;">
                    <a href="${cap.screenshotPath}" target="_blank" style="display: block; text-decoration: none;">
                        <img src="${cap.screenshotPath}" alt="Print ${idx + 1}" style="width: 100%; max-width: 560px; border-radius: 8px; border: 1px solid #e2e8f0; box-shadow: 0 2px 8px rgba(0,0,0,0.08);" />
                    </a>
                    <p style="margin: 6px 0 0; font-size: 12px; color: #94a3b8;">${captureDate} às ${captureTime}</p>
                </div>
            `
        }).join('')

        // 5. Compose the full email HTML
        const emailHtml = `
            <div style="font-family: 'Segoe UI', -apple-system, sans-serif; max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
                
                <!-- Header -->
                <div style="background: #0a0a0a; padding: 32px 28px; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 12px;">
                        <div style="width: 28px; height: 28px; background: rgba(255,255,255,0.15); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;">
                            <span style="font-size: 14px; font-weight: bold; color: #fff;">⚡</span>
                        </div>
                        <span style="font-size: 11px; font-weight: 800; letter-spacing: 3px; color: rgba(255,255,255,0.5); text-transform: uppercase;">Adsnap</span>
                    </div>
                    <h1 style="margin: 8px 0 4px; font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                        Relatório de Prints
                    </h1>
                    <p style="margin: 0; font-size: 13px; color: rgba(255,255,255,0.5);">
                        Fim de veiculação — ${campaign.campaignName || campaign.client}
                    </p>
                </div>

                <!-- Campaign Info -->
                <div style="padding: 24px 28px; border-bottom: 1px solid #f1f5f9;">
                    <table style="width: 100%; font-size: 13px; color: #475569; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a; width: 120px;">Cliente</td>
                            <td style="padding: 6px 0;">${campaign.client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Agência</td>
                            <td style="padding: 6px 0;">${campaign.agency}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Campanha</td>
                            <td style="padding: 6px 0;">${campaign.campaignName || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">PI</td>
                            <td style="padding: 6px 0;">${campaign.pi}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Formato</td>
                            <td style="padding: 6px 0;">${campaign.format} (${campaign.device})</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Veiculação</td>
                            <td style="padding: 6px 0;">${flightStartStr} → ${flightEndStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Total de Prints</td>
                            <td style="padding: 6px 0; font-weight: 700; color: #0a0a0a;">${captures.length}</td>
                        </tr>
                    </table>
                </div>

                <!-- Prints Gallery -->
                <div style="padding: 24px 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 20px; letter-spacing: -0.3px;">
                        📸 Prints Capturados
                    </h2>
                    ${imageGridHtml}
                </div>

                <!-- Footer -->
                <div style="background: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                        Este é um e-mail automático gerado pelo Adsnap Cloud.
                    </p>
                    <p style="margin: 4px 0 0; font-size: 10px; color: #cbd5e1;">
                        ${new Date().toLocaleDateString('pt-BR')} • Nexus Engine
                    </p>
                </div>
            </div>
        `

        // 6. Send email
        const { data, error } = await resend.emails.send({
            from: 'Adsnap Nexus <onboarding@resend.dev>',
            to: recipients,
            subject: `📊 Relatório de Prints — ${campaign.client} | ${campaign.campaignName || campaign.format}`,
            html: emailHtml,
        })

        if (error) {
            console.error('[Email Service] Resend error:', error)
            await (prisma as any).emailDispatch.update({
                where: { id: dispatchId },
                data: { status: 'FAILED' }
            })
            await nexusLogStore.addLog(`Email Service: Falha no envio: ${error.message}`, 'ERROR', undefined, campaignId)
            return { success: false, error: error.message }
        }

        // 7. Update dispatch record
        await (prisma as any).emailDispatch.update({
            where: { id: dispatchId },
            data: {
                status: 'SENT',
                lastSentAt: new Date()
            }
        })

        console.log(`[Email Service] E-mail enviado com sucesso! ID: ${data?.id}`)
        await nexusLogStore.addLog(
            `Email Service: Relatório enviado para ${recipients.length} destinatário(s) (${captures.length} prints)`,
            'SUCCESS',
            `Destinatários: ${recipients.join(', ')}`,
            campaignId
        )

        return { success: true }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Email Service] Error:', err)
        await nexusLogStore.addLog(`Email Service: Erro fatal: ${msg}`, 'ERROR', undefined, campaignId)

        try {
            await (prisma as any).emailDispatch.update({
                where: { id: dispatchId },
                data: { status: 'FAILED' }
            })
        } catch { /* ignore */ }

        return { success: false, error: msg }
    }
}
