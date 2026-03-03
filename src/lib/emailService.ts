import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'

// ============================================================================
// EMAIL SERVICE — Dispatch campaign prints via Resend (Grouped by PI)
// ============================================================================

interface SendReportOptions {
    pi: string
    recipients: string[]
    dispatchId: string
}

/**
 * Resolve format IDs to human-readable labels using Settings.bannerFormats.
 * Falls back to the raw ID if no match is found.
 */
async function resolveFormatLabel(formatId: string): Promise<string> {
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        if (settings && (settings as any).bannerFormats) {
            const formats = JSON.parse((settings as any).bannerFormats || '[]')
            const match = formats.find((f: any) => f.id === formatId)
            if (match) return match.label || `${match.width}x${match.height}`
        }
    } catch { /* fallback */ }

    // Fallback: try to parse as WxH
    const dims = formatId.toLowerCase().split('x').map(Number)
    if (dims.length === 2 && !isNaN(dims[0]) && !isNaN(dims[1])) {
        return `${dims[0]}x${dims[1]}`
    }
    return formatId
}

/**
 * Groups captures by date (dd/mm) and limits to MAX_PER_DAY per day.
 */
function groupAndLimitCaptures(captures: { id: string; screenshotPath: string; createdAt: Date }[], maxPerDay: number) {
    const byDate: Record<string, typeof captures> = {}

    for (const cap of captures) {
        const dateKey = cap.createdAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        if (!byDate[dateKey]) byDate[dateKey] = []
        byDate[dateKey].push(cap)
    }

    const result: typeof captures = []
    for (const [, dayCaps] of Object.entries(byDate)) {
        result.push(...dayCaps.slice(0, maxPerDay))
    }

    return result
}

export async function sendCampaignReport({ pi, recipients, dispatchId }: SendReportOptions): Promise<{ success: boolean; error?: string }> {
    console.log(`[Email Service] Preparando relatório para campanha PI: ${pi}...`)

    try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)

        if (!process.env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY não configurada')
        }

        // 1. Get ALL campaigns with this PI
        const campaigns = await prisma.campaign.findMany({
            where: { pi, isArchived: false },
            select: {
                id: true,
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                pi: true,
                url: true,
                device: true,
                flightStart: true,
                flightEnd: true,
            },
            orderBy: { createdAt: 'asc' }
        })

        if (campaigns.length === 0) {
            throw new Error(`Nenhuma campanha encontrada com PI: ${pi}`)
        }

        const firstCampaign = campaigns[0]
        console.log(`[Email Service] ${campaigns.length} formato(s) encontrado(s) para PI ${pi}`)

        // 2. For each format/campaign, get captures and resolve format label
        const MAX_PRINTS_PER_DAY = 3

        interface FormatSection {
            label: string
            device: string
            captures: { id: string; screenshotPath: string; createdAt: Date }[]
            totalCaptures: number
        }

        const formatSections: FormatSection[] = []

        for (const campaign of campaigns) {
            const formatLabel = await resolveFormatLabel(campaign.format)

            const whereClause: any = {
                campaignId: campaign.id,
                status: 'SUCCESS',
                screenshotPath: { not: '' }
            }
            if (campaign.flightStart && campaign.flightEnd) {
                whereClause.createdAt = {
                    gte: campaign.flightStart,
                    lte: new Date(campaign.flightEnd.getTime() + 24 * 60 * 60 * 1000)
                }
            }

            const allCaptures = await prisma.capture.findMany({
                where: whereClause,
                orderBy: { createdAt: 'asc' },
                select: { id: true, screenshotPath: true, createdAt: true }
            })

            if (allCaptures.length === 0) continue

            const limitedCaptures = groupAndLimitCaptures(allCaptures, MAX_PRINTS_PER_DAY)

            formatSections.push({
                label: formatLabel,
                device: campaign.device,
                captures: limitedCaptures,
                totalCaptures: allCaptures.length,
            })
        }

        if (formatSections.length === 0) {
            console.log(`[Email Service] Nenhuma captura encontrada para PI ${pi}`)
            await nexusLogStore.addLog(`Email Service: Nenhuma captura encontrada para disparo`, 'ERROR', undefined, firstCampaign.id)
            return { success: false, error: 'Nenhuma captura encontrada no período' }
        }

        const totalPrints = formatSections.reduce((sum, s) => sum + s.captures.length, 0)
        console.log(`[Email Service] ${totalPrints} prints across ${formatSections.length} formato(s). Compondo email...`)

        // 3. Format dates
        const flightStartStr = firstCampaign.flightStart
            ? firstCampaign.flightStart.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'N/A'
        const flightEndStr = firstCampaign.flightEnd
            ? firstCampaign.flightEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'N/A'

        // 4. Build format sections HTML
        const formatSectionsHtml = formatSections.map(section => {
            const capturesHtml = section.captures.map((cap, idx) => {
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

            const omittedNote = section.totalCaptures > section.captures.length
                ? `<p style="margin: 8px 0 0; font-size: 11px; color: #94a3b8; text-align: center; font-style: italic;">Exibindo ${section.captures.length} de ${section.totalCaptures} prints (máx. ${MAX_PRINTS_PER_DAY} por dia)</p>`
                : ''

            return `
                <div style="margin-bottom: 28px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;">
                        <div style="background: #0a0a0a; color: #fff; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px;">
                            ${section.label}
                        </div>
                        <span style="font-size: 12px; color: #94a3b8; font-weight: 500;">${section.device === 'mobile' ? '📱 Mobile' : '🖥️ Desktop'}</span>
                        <span style="font-size: 12px; color: #94a3b8;">•</span>
                        <span style="font-size: 12px; color: #64748b; font-weight: 600;">${section.captures.length} print${section.captures.length > 1 ? 's' : ''}</span>
                    </div>
                    ${capturesHtml}
                    ${omittedNote}
                </div>
            `
        }).join('')

        // 5. Format list
        const formatListHtml = formatSections.map(s =>
            `<span style="display: inline-block; background: #f1f5f9; color: #475569; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 4px; margin: 2px 2px;">${s.label} (${s.device})</span>`
        ).join(' ')

        // 6. Compose the full email HTML
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
                        Fim de veiculação — ${firstCampaign.campaignName || firstCampaign.client}
                    </p>
                </div>

                <!-- Campaign Info -->
                <div style="padding: 24px 28px; border-bottom: 1px solid #f1f5f9;">
                    <table style="width: 100%; font-size: 13px; color: #475569; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a; width: 120px;">Cliente</td>
                            <td style="padding: 6px 0;">${firstCampaign.client}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Agência</td>
                            <td style="padding: 6px 0;">${firstCampaign.agency}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Campanha</td>
                            <td style="padding: 6px 0;">${firstCampaign.campaignName || '—'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">PI</td>
                            <td style="padding: 6px 0;">${firstCampaign.pi}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Formatos</td>
                            <td style="padding: 6px 0;">${formatListHtml}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Veiculação</td>
                            <td style="padding: 6px 0;">${flightStartStr} → ${flightEndStr}</td>
                        </tr>
                        <tr>
                            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">Total de Prints</td>
                            <td style="padding: 6px 0; font-weight: 700; color: #0a0a0a;">${totalPrints}</td>
                        </tr>
                    </table>
                </div>

                <!-- Prints Gallery by Format -->
                <div style="padding: 24px 28px;">
                    <h2 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 20px; letter-spacing: -0.3px;">
                        📸 Prints por Formato
                    </h2>
                    ${formatSectionsHtml}
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

        // 7. Send email
        const { data, error } = await resend.emails.send({
            from: 'Adsnap Nexus <onboarding@resend.dev>',
            to: recipients,
            subject: `📊 Relatório de Prints — ${firstCampaign.client} | ${firstCampaign.campaignName || pi} (${formatSections.length} formato${formatSections.length > 1 ? 's' : ''})`,
            html: emailHtml,
        })

        if (error) {
            console.error('[Email Service] Resend error:', error)
            await (prisma as any).emailDispatch.update({
                where: { id: dispatchId },
                data: { status: 'FAILED' }
            })
            await nexusLogStore.addLog(`Email Service: Falha no envio: ${error.message}`, 'ERROR', undefined, firstCampaign.id)
            return { success: false, error: error.message }
        }

        // 8. Update dispatch record
        await (prisma as any).emailDispatch.update({
            where: { id: dispatchId },
            data: {
                status: 'SENT',
                lastSentAt: new Date()
            }
        })

        console.log(`[Email Service] E-mail enviado com sucesso! ID: ${data?.id}`)
        await nexusLogStore.addLog(
            `Email Service: Relatório enviado para ${recipients.length} destinatário(s) (${totalPrints} prints, ${formatSections.length} formatos)`,
            'SUCCESS',
            `Destinatários: ${recipients.join(', ')}`,
            firstCampaign.id
        )

        return { success: true }

    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Email Service] Error:', err)
        await nexusLogStore.addLog(`Email Service: Erro fatal: ${msg}`, 'ERROR')

        try {
            await (prisma as any).emailDispatch.update({
                where: { id: dispatchId },
                data: { status: 'FAILED' }
            })
        } catch { /* ignore */ }

        return { success: false, error: msg }
    }
}
