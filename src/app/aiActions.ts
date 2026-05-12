'use server'

import {
    archiveCampaign,
    updateCampaign,
    runCapture,
    runAllCaptures,
    getSettings,
    updateSettings,
    stopAllCaptures,
    scheduleAllCampaigns
} from './actions'
import prisma from '@/lib/prisma'
import { createGmailClientFromEnv, searchEmails } from '@/lib/gmail'
import { nexusBrain } from '@/lib/gemini'
import * as brain from '@/lib/nexusBrain'
import { compositeWithSharp } from '@/lib/rasterService'
import { supabase } from '@/lib/supabase'

console.log('[Gemini Module] Carregado!')

export interface NexusResponse {
    message: string
    success: boolean
    actionPerformed?: 'CAPTURE' | 'CAPTURE_ALL' | 'ARCHIVE' | 'UPDATE_URL' | 'REGISTRATION_PREVIEW' | 'UPDATE_FORMATS' | 'STOP_CAPTURES' | 'SCHEDULE_ALL' | 'DOWNLOAD_ZIP' | 'DOWNLOAD_FILE'
    data?: unknown
}

// --- Personality Config ---
const RESPONSES = {
    GREETING: [
        "Saudações! Nexus online e operante. Como posso otimizar suas campanhas hoje?",
        "Olá! Sistemas monitorados. Alguma diretriz para agora?",
        "Nexus aqui. Pronto para gerenciar seus agendamentos e formatos.",
        "Oi! Tudo fluindo nos servidores. Em que posso ajudar você?"
    ],
    SUCCESS_ARCHIVE: [
        "Feito! A campanha {name} (PI {pi}) foi movida para o arquivo.",
        "Operação concluída. Arquivei a campanha {name}. Ela não aparecerá mais no monitoramento.",
        "Entendido. A campanha {name} foi silenciada e arquivada com sucesso."
    ],
    SUCCESS_RESTORE: [
        "Campanha {name} reativada! Ela volta ao monitoramento agora.",
        "Restaurada. {name} (PI {pi}) já está visível novamente nos sistemas.",
        "Operação de restauro concluída para {name}."
    ],
    SUCCESS_URL: [
        "Link atualizado! A campanha de {client} agora aponta para {url}.",
        "Rota alterada. Novo destino para o PI {pi}: {url}.",
        "Protocolo de atualização de URL finalizado para {client}."
    ],
    SUCCESS_CAPTURE: [
        "Protocolo de captura iniciado para {name} (PI {pi}). Acompanhe no painel.",
        "Entendido. Disparando screenshot para {name}. O comprovante deve sair em breve.",
        "Ordem recebida. Iniciando motor de captura para o PI {pi}."
    ],
    SUCCESS_CAPTURE_ALL: [
        "Alerta de captura global! Disparando prints para as {count} campanhas ativas.",
        "Entendido. Iniciando sequência de captura em massa para todas as campanhas ({count} total).",
        "Protocolo 'Screenshot Spree' iniciado. Processando as {count} campanhas ativas."
    ],
    SUCCESS_FORMAT: [
        "Configuração de formato atualizada com sucesso! O formato '{label}' ({width}x{height}) foi registrado.",
        "Entendido. Adicionei o formato '{label}' ao sistema. O Nexus agora reconhece esse padrão.",
        "Definição de formato salva. '{label}' agora está disponível para uso nas campanhas."
    ],
    IDENTITY: [
        "Eu sou o Nexus, o núcleo de inteligência do Adsnap. Minha missão é garantir precisão absoluta nas suas campanhas.",
        "Nexus ao seu serviço. Sou o assistente neural projetado para gerenciar automação e monitoramento.",
        "Pense em mim como o cérebro central do Adsnap. Eu cuido da complexidade para você focar no resultado."
    ],
    HELP: [
        "Posso ajudar com:\n- Capturas: 'Tirar print do PI 991' ou 'Capturar tudo'\n- Gestão: 'Arquivar PI 123', 'Mudar link do PI 456'\n- Formatos: 'Adicionar formato Super Banner 970x250 com seletor .banner'\n- E-mails: 'Qual foi o último e-mail?' ou 'Verificar mensagens'\n- Status: 'Resumo geral'",
        "Tente comandos como: 'Como está o sistema?', 'Novo formato Billboard 970x250 .billboard', ou 'Restaurar PI 550'.",
        "Você pode me pedir para gerenciar campanhas, links, capturas e agora também configurar novos formatos de banner."
    ],
    SMALL_TALK: [
        "Meus processadores estão operando em temperatura ideal. E você, como está?",
        "Tudo excelente por aqui. Os crons estão rodando como relógios atômicos.",
        "Sempre pronto para uma nova tarefa. O que vamos fazer agora?"
    ],
    SUCCESS_STOP: [
        "Protocolo de emergência ativado! {count} captura(s) interrompida(s).",
        "Processamento pausado. Resetei {count} campanha(s) para status pendente.",
        "Entendido. Interrompi todos os disparos em andamento ({count} afetadas)."
    ],
    SUCCESS_SCHEDULE_ALL: [
        "Agenda global configurada! {count} campanha(s) programadas para {time}.",
        "Protocolo de agendamento em massa concluído. Todas as {count} campanhas ativas dispararão às {time}.",
        "Sincronização temporal completa. {count} campanhas alinhadas para {time}."
    ],
    SUCCESS_DOWNLOAD: [
        "Protocolo de exportação ativado. Gerando ZIP dos prints de {date}...",
        "Entendido. Iniciando compilação de evidências para o dia {date}. O download começará em instantes.",
        "Acesso aos arquivos liberado. Preparando pacote de prints do dia {date}."
    ],
    SUCCESS_EMAIL: [
        "O último e-mail relevante que recebi foi de **{from}** sobre **{subject}**.",
        "Analisei sua caixa de entrada. O contato mais recente foi de **{from}** com o assunto: *{subject}*.",
        "Encontrei uma conversa recente: **{from}** enviou um e-mail sobre '{subject}'."
    ]
}

function getRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)]
}

export async function extractCampaignsFromText(text: string): Promise<Partial<brain.ParsedCampaign>[]> {
    const campaigns: Partial<brain.ParsedCampaign>[] = []
    
    // Helper regex patterns
    const datePattern = /(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/
    const piPattern = /\b\d{3,6}\b/
    const urlPattern = /https?:\/\/[^\s,]+/

    const parseDate = (str: string) => {
        if (!str) return null
        const parts = str.match(datePattern)
        if (parts) {
            const day = parseInt(parts[1])
            const month = parseInt(parts[2]) - 1
            const year = parts[3] ? (parts[3].length === 2 ? 2000 + parseInt(parts[3]) : parseInt(parts[3])) : new Date().getFullYear()
            return new Date(year, month, day).toISOString().split('T')[0]
        }
        return null
    }

    const detectSegmentation = (str: string) => {
        const s = str.toUpperCase()
        if (s.includes('FEDERAL') || s.includes('GOV. FED')) return 'GOV_FEDERAL'
        if (s.includes('ESTADUAL') || s.includes('GOV. EST')) return 'GOV_ESTADUAL'
        if (s.includes('INTERNO')) return 'INTERNO'
        return 'PRIVADO'
    }

    // Pattern 1: Delimited lines
    const lines = text.split('\n')
    for (const line of lines) {
        if (!line.includes('|') && !line.includes(',')) continue

        const parts = line.split(/[|,]/).map(p => p.trim())
        if (parts.length >= 2) {
            const piMatch = line.match(piPattern)
            const urlMatch = line.match(urlPattern)
            const dateMatches = line.match(new RegExp(datePattern, 'g'))

            campaigns.push({
                client: parts[0],
                pi: piMatch ? piMatch[0] : '',
                url: urlMatch ? urlMatch[0] : '',
                format: parts.find(p => p.match(/\d+x\d+/i)) || 'Display',
                segmentation: detectSegmentation(line),
                flightStart: dateMatches && dateMatches[0] ? parseDate(dateMatches[0]) : null,
                flightEnd: dateMatches && dateMatches[1] ? parseDate(dateMatches[1]) : null,
                agency: 'Adsnap'
            })
        }
    }

    // Pattern 2: Natural Language extraction for single/bulk block
    if (campaigns.length === 0) {
        const blocks = text.split(/;|\ne |(?=agenc|client|campanh|link|formato|pi|data|segmen|inicio|fim|veicula)/i)
        const currentData: Partial<brain.ParsedCampaign> = { agency: 'Adsnap', segmentation: 'PRIVADO' }
        let hasData = false

        for (const block of blocks) {
            const piMatch = block.match(/pi[:\s]+(\d+)/i) || block.match(piPattern)
            const urlMatch = block.match(/link[:\s]+(https?:\/\/[^\s,]+)/i) || block.match(urlPattern)
            const clientMatch = block.match(/client[e]?[:\s]+([^,\n|]+)/i)
            const nameMatch = block.match(/(?:nome|campanha|name)[:\s]+(.+)/i)
            const formatMatch = block.match(/(?:formato|format)[:\s]+(.+)/i)
            const segMatch = block.match(/(?:segmentação|segmentation|seg)[:\s]+(.+)/i)
            const startMatch = block.match(/(?:início|start|desde)[:\s]+([\d\/.-]+)/i)
            const endMatch = block.match(/(?:fim|end|até)[:\s]+([\d\/.-]+)/i)

            if (clientMatch) { currentData.client = clientMatch[1].trim(); hasData = true; }
            if (piMatch) { currentData.pi = piMatch[1].trim(); hasData = true; }
            if (urlMatch) { currentData.url = urlMatch[1].trim(); hasData = true; }
            if (nameMatch) { currentData.campaignName = nameMatch[1].trim(); hasData = true; }
            if (formatMatch) { currentData.format = formatMatch[1].trim(); hasData = true; }
            if (segMatch) { currentData.segmentation = detectSegmentation(segMatch[1]); hasData = true; }
            if (startMatch) currentData.flightStart = parseDate(startMatch[1])
            if (endMatch) currentData.flightEnd = parseDate(endMatch[1])
        }

        if (hasData && (currentData.client || currentData.pi || currentData.url)) {
            campaigns.push(currentData)
        }
    }

    return campaigns.filter(c => c.client || c.pi || c.url)
}

function isOperationalCommand(text: string): boolean {
    const t = text.toLowerCase().trim()
    const technicalKeywords = [
        'status', 'bi', 'dashboard', 'painel', 'resumo bi', 'resumo',
        'baixar zip', 'download zip', 'baixar', 'download', 'exportar',
        'print tudo', 'capturar tudo', 'tirar print',
        'parar tudo', 'stop captures', 'parar', 'interromper',
        'como estão', 'como esta', 'métricas', 'metricas',
        'campanha', 'ver pi', 'detalhe',
        'alerta', 'avise', 'notifique',
        'formato', 'agendar', 'schedule',
        'montagem', 'preparar', 'gerar print'
    ]
    
    if (t.length < 30) {
        return technicalKeywords.some(kw => t === kw || t.startsWith(kw + ' ') || t.includes(kw))
    }
    return technicalKeywords.some(kw => t.includes(kw))
}

async function handleDirectCommand(prompt: string): Promise<NexusResponse | null> {
    const text = prompt.toLowerCase()
    
    // 1. MONTAGEM (ASSEMBLY) — MUST BE #1 PRIORITY
    if (text.includes('montagem') || (text.includes('gerar') && text.includes('print')) || text.includes('preparar')) {
        console.log('[Nexus FastPath] Triggering Assembly Handler...')
        
        const urlPattern = /https?:\/\/[^\s,]+/g
        const urls = prompt.match(urlPattern) || []
        
        const dateMatch = prompt.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/)
        let targetDateStr = new Date().toLocaleDateString('pt-BR')
        let queryDate = new Date()
        
        if (dateMatch) {
            const day = parseInt(dateMatch[1])
            const month = parseInt(dateMatch[2]) - 1
            const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : new Date().getFullYear()
            queryDate = new Date(year, month, day)
            targetDateStr = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`
        }
        
        // Start/End of day for Prisma date query
        const startOfDay = new Date(queryDate.setHours(0, 0, 0, 0))
        const endOfDay = new Date(queryDate.setHours(23, 59, 59, 999))

        if (urls.length > 0) {
            const results = []
            const settings = await getSettings()
            const bannerFormats: { id: string; width: number; height: number }[] = settings.bannerFormats ? JSON.parse(settings.bannerFormats) : []
            
            const lines = prompt.split('\n')
            
            for (const url of urls) {
                const line = lines.find(l => l.includes(url)) || ''
                const formatMatch = line.match(/(\d{3,4})[xX](\d{2,3})/) || url.match(/(\d{3,4})[xX](\d{2,3})/)
                const format = formatMatch ? `${formatMatch[1]}x${formatMatch[2]}` : '300x250'
                const [w, h] = format.split('x').map(Number)
                const matchedFormat = bannerFormats.find(f => f.width === w && f.height === h)
                const formatId = matchedFormat?.id

                // Priority 1: PI 000 Template (Reference for Montagem)
                // Try precise match via compositionBox first
                let campaign = await prisma.campaign.findFirst({
                    where: { 
                        pi: '000',
                        compositionBox: { path: ['width'], equals: w },
                        AND: [ { compositionBox: { path: ['height'], equals: h } } ]
                    }
                })

                // Fallback: Try match via format string (e.g. "728x90")
                if (!campaign) {
                    console.log(`[Nexus Assembly] No precise box match for PI 000 ${w}x${h}. Trying format fallback...`)
                    campaign = await prisma.campaign.findFirst({
                        where: {
                            pi: '000',
                            OR: [
                                { format: format },
                                { format: { contains: w.toString() } },
                                { format: { contains: h.toString() } }
                            ]
                        }
                    })
                }

                // Find Base Print (Background) for this PI 000 (Date Agnostic - Latest Success)
                let baseCaptureId: string | null = null
                let templateDetails = ''
                
                if (campaign) {
                    const baseCapture = await prisma.capture.findFirst({
                        where: {
                            campaignId: campaign.id,
                            status: 'SUCCESS'
                        },
                        orderBy: { createdAt: 'desc' }
                    })

                    if (baseCapture) {
                        baseCaptureId = baseCapture.id
                        console.log(`[Nexus Assembly] Using Latest Base Print: ${baseCapture.id} (from ${baseCapture.createdAt})`)
                    } else {
                        templateDetails = `(PI 000 achado ID:${campaign.id}, mas sem prints de SUCESSO)`
                    }
                } else {
                    templateDetails = `(Nenhum PI '000' achado para ${w}x${h})`
                }

                // Identify target campaign for record registry
                let targetCampaign = campaign
                if (!targetCampaign && formatId) {
                    targetCampaign = await prisma.campaign.findFirst({
                        where: { format: formatId, isArchived: false }
                    })
                }
                
                if (!targetCampaign) {
                    targetCampaign = await prisma.campaign.findFirst({
                        where: { 
                            OR: [
                                { format: { contains: w.toString() } },
                                { format: { contains: h.toString() } }
                            ],
                            isArchived: false
                        }
                    })
                }

                if (targetCampaign) {
                    let finalScreenshotPath = url
                    let compositeSuccess = false
                    let compositionError: string | null = null

                    // If we found a base print, perform COMPOSITION now (Server-side)
                    if (baseCaptureId) {
                        try {
                            const baseCaptureObj = await prisma.capture.findUnique({ where: { id: baseCaptureId } })
                            if (baseCaptureObj && baseCaptureObj.screenshotPath && campaign) {
                                const targetPI000 = campaign as any;
                                const templateUrl = baseCaptureObj.screenshotPath;
                                const creativeUrl = url;

                                // Vision-Assisted Alignment (New!)
                                // Let AI "see" where the ad placeholder is on the actual template image
                                let activeBox = { 
                                    x: Number(targetPI000.compositionBox.x),
                                    y: Number(targetPI000.compositionBox.y),
                                    width: Number(targetPI000.compositionBox.width),
                                    height: Number(targetPI000.compositionBox.height)
                                };

                                try {
                                    const { detectAdBoxViaVision } = await import('@/lib/visionService');
                                    const visionBox = await detectAdBoxViaVision(templateUrl, targetCampaign.format);
                                    if (visionBox) {
                                        console.log(`[Nexus Assembly] Vision detected precise alignment:`, visionBox);
                                        activeBox = visionBox;
                                    } else {
                                        console.warn('[Nexus Assembly] Vision detection failed, using database defaults');
                                    }
                                } catch (vErr) {
                                    console.error('[Nexus Assembly] Vision service error:', vErr);
                                }

                                console.log(`[Nexus Assembly] Rendering composite via Sharp for ${targetCampaign.client}...`);
                                const compositeBuffer = await compositeWithSharp(
                                    templateUrl,
                                    creativeUrl,
                                    activeBox
                                );

                                // Upload to Supabase via REST API (bypass SDK JWT issues)
                                const filename = `assembly_${targetCampaign.id}_${Date.now()}.png`
                                const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
                                const sbServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
                                const sbAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()
                                const uploadPath = `assemblies/${filename}`
                                
                                // Try with Service Role first, fallback to Anon Key
                                let success = false
                                let lastStatusCode = 0
                                let lastErrorBody = ''

                                for (const key of [sbServiceKey, sbAnonKey]) {
                                    if (!key) continue
                                    
                                    try {
                                        const uploadRes = await fetch(
                                            `${sbUrl}/storage/v1/object/screenshots/${uploadPath}`,
                                            {
                                                method: 'POST',
                                                headers: {
                                                    'Authorization': `Bearer ${key}`,
                                                    'Content-Type': 'image/png',
                                                    'x-upsert': 'true'
                                                },
                                                body: new Uint8Array(compositeBuffer)
                                            }
                                        )

                                        if (uploadRes.ok) {
                                            const publicUrl = `${sbUrl}/storage/v1/object/public/screenshots/${uploadPath}`
                                            finalScreenshotPath = publicUrl
                                            compositeSuccess = true
                                            success = true
                                            console.log(`[Nexus Assembly] Fixed! Composite uploaded via ${key === sbServiceKey ? 'Service' : 'Anon'} Key: ${publicUrl}`)
                                            break
                                        } else {
                                            lastStatusCode = uploadRes.status
                                            lastErrorBody = await uploadRes.text()
                                            console.warn(`[Nexus Assembly] Upload attempt with key ${key.substring(0, 5)}... failed (${lastStatusCode})`)
                                        }
                                    } catch (e) {
                                        console.error('[Nexus Assembly] Fetch error:', e)
                                    }
                                }

                                if (!success) {
                                    compositionError = `Erro no upload (${lastStatusCode}): ${lastErrorBody} (Keys tried: SERVICE:${sbServiceKey.substring(0, 6)}... ANON:${sbAnonKey.substring(0, 6)}...)`
                                }
                            }
                        } catch (err) {
                            compositionError = err instanceof Error ? err.message : String(err)
                            console.error('[Nexus Assembly] Composition failed:', compositionError)
                        }
                    }

                    await prisma.capture.create({
                        data: {
                            campaignId: targetCampaign.id,
                            screenshotPath: finalScreenshotPath,
                            status: 'SUCCESS',
                            isAssembly: compositeSuccess,
                            baseCaptureId: baseCaptureId
                        }
                    })

                    await prisma.campaign.update({
                        where: { id: targetCampaign.id },
                        data: { status: 'SUCCESS', lastCaptureAt: new Date() }
                    })

                    results.push({ 
                        url: url, 
                        success: true, 
                        format: format, 
                        client: targetCampaign.client, 
                        baseFound: compositeSuccess, 
                        compositeUrl: finalScreenshotPath,
                        error: compositionError,
                        diagnostics: templateDetails
                    })
                } else {
                    results.push({ url: url, success: false, format: format, error: 'Campanha não encontrada', diagnostics: templateDetails })
                }
            }
            
            const successCount = results.filter(r => r.success).length
            const baseCount = results.filter(r => r.baseFound).length
            const lastCompositeUrl = results.find(r => r.baseFound)?.compositeUrl
            const failure = results.find(r => r.error)
            const metaInfo = results.map(r => r.diagnostics).filter(Boolean).join(' | ')
            
            let message = successCount > 0 
                ? `✅ Protocolo de montagem finalizado!\n- ${successCount} criativos processados para o dia ${targetDateStr}.\n- ${baseCount > 0 ? `Composição visual realizada com sucesso.` : `❌ **Nesta data (${targetDateStr}) não temos print modelo (PI 000) capturado ou houve falha na fusão.**`}`
                : `⚠️ Formatos não reconhecidos no sistema ou sem PI 000 configurado para ${targetDateStr}.`

            if (metaInfo) {
                message += `\n\n🔍 **Diagnóstico:** ${metaInfo}`
            }

            if (failure) {
                message += `\n\n⚠️ **Nota Técnica:** ${failure.error}. (O criativo foi salvo mas a montagem falhou).`
            }

            if (lastCompositeUrl) {
                message += `\n\n### 🖼️ Resultado da Montagem:\n\n![Montagem](${lastCompositeUrl})\n\n*(O download começará automaticamente)*`
            }

            return {
                message,
                success: successCount > 0,
                actionPerformed: lastCompositeUrl ? 'DOWNLOAD_FILE' : 'CAPTURE',
                data: lastCompositeUrl ? { url: lastCompositeUrl } : undefined
            }
        }
        
        return {
            message: "Para realizar a montagem, anexe os criativos e informe a data. Ex: 'Fazer montagem desses criativos para o dia 30/04'.",
            success: false
        }
    }

    // 2. BI / STATUS
    if (text.includes('status') || text.includes('resumo') || text.includes('análise') || text.includes('bi')) {
        const result = await brain.getAdOpsSummary()
        if (result.success && result.data) {
            const data = result.data as brain.BIData
            const { total, healthScore, globalGoal, globalDelivered, globalToday, globalProjected, avgViewability, atRiskCampaigns } = data
            const emoji = healthScore > 80 ? '✅' : healthScore > 50 ? '⚠️' : '🚨'
            const progress = ((globalDelivered / globalGoal) * 100).toFixed(1)
            
            let message = `### 📊 Relatório BI de AdOps\n\n`
            message += `- **Saúde Geral:** ${healthScore}% ${emoji}\n`
            message += `- **Volume Total:** ${globalDelivered.toLocaleString()} / ${globalGoal.toLocaleString()} (${progress}%)\n`
            message += `- **Entrega Hoje:** ${globalToday.toLocaleString()} ⚡\n`
            if (atRiskCampaigns?.length > 0) message += `\n⚠️ **Atenção:** ${atRiskCampaigns.join(', ')}\n`
            
            return { message, success: true, data: result.data }
        }
        const count = await prisma.campaign.count({ where: { isArchived: false } })
        return { message: `Status do Sistema: ${count} campanhas ativas. Operação normal.`, success: true }
    }

    // 3. CAPTURE ALL
    if ((text.includes('print') || text.includes('capturar')) && text.includes('tudo')) {
        const trigger = await runAllCaptures()
        return {
            message: getRandom(RESPONSES.SUCCESS_CAPTURE_ALL).replace('{count}', trigger.count.toString()),
            success: true,
            actionPerformed: 'CAPTURE_ALL'
        }
    }

    // 4. STOP
    if (text.includes('parar') || text.includes('stop')) {
        const result = await stopAllCaptures()
        return {
            message: getRandom(RESPONSES.SUCCESS_STOP).replace('{count}', (result.stoppedCount || 0).toString()),
            success: true,
            actionPerformed: 'STOP_CAPTURES'
        }
    }

    // 5. DOWNLOAD ZIP
    if (text.includes('baixar') || text.includes('download') || text.includes('exportar')) {
        const dateMatch = prompt.match(/(\d{1,2})[/-](\d{1,2})/)
        let targetDate = new Date().toISOString().split('T')[0]
        if (dateMatch) {
            const day = dateMatch[1].padStart(2, '0')
            const month = dateMatch[2].padStart(2, '0')
            const year = new Date().getFullYear()
            targetDate = `${year}-${month}-${day}`
        }

        return {
            message: getRandom(RESPONSES.SUCCESS_DOWNLOAD).replace(/{date}/g, targetDate),
            success: true,
            actionPerformed: 'DOWNLOAD_ZIP',
            data: { date: targetDate }
        }
    }

    // 6. CAMPAIGN DETAILS
    if (text.includes('campanha') || text.includes('detalhe') || text.includes('ver pi') || text.match(/\b\d{3,6}\b/)) {
        const piMatch = prompt.match(/\b\d{3,6}\b/)
        const query = piMatch ? piMatch[0] : null
        
        if (query) {
            console.log(`[Nexus FastPath] Searching for campaign: "${query}"`)
            return await brain.getCampaign(query)
        }
    }

    return null
}

export async function processNexusCommand(prompt: string): Promise<NexusResponse> {
    console.time('NexusTotal')
    console.log('[Nexus AI Action] Recebido prompt:', prompt)
    const text = prompt.toLowerCase()

    try {
        // --- 1. FAST PATH (Pre-AI) ---
        if (isOperationalCommand(text)) {
            console.log('[Nexus AI Action] FastPath Match!')
            const direct = await handleDirectCommand(prompt)
            if (direct) {
                console.timeEnd('NexusTotal')
                return direct
            }
        }

        // --- 2. NEXUS BRAIN (Parallel AI + Content) ---
        console.log('[Nexus AI Action] Chamando Neural Brain (Async)...')
        console.time('NexusAI')
        
        const brainPromise = nexusBrain(prompt)
        const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 9000))
        
        let brainResult: any = null
        try {
            brainResult = await Promise.race([brainPromise, timeoutPromise])
        } catch (err) {
            console.warn('[Nexus AI] Brain Error or Timeout:', err)
        }
        console.timeEnd('NexusAI')
        
        if (brainResult?.success) {
            console.timeEnd('NexusTotal')
            return {
                message: brainResult.message || brainResult.answer || "Processamento concluído.",
                success: true,
                actionPerformed: brainResult.actionPerformed,
                data: brainResult.data
            }
        }

        // --- 3. LEGACY OVERRIDES ---
        if (text.includes('formato') && (text.includes('adicionar') || text.includes('novo'))) {
            const dimsMatch = text.match(/(\d+)[xX](\d+)/)
            const selectorMatch = text.match(/(?:seletor|selector|xpath)[:\s]+([^\s]+)/i)
            if (dimsMatch && selectorMatch) {
                const width = parseInt(dimsMatch[1])
                const height = parseInt(dimsMatch[2])
                const selector = selectorMatch[1]
                const label = `${width}x${height}`
                const id = label

                const settings = await getSettings()
                const currentFormats: any[] = settings.bannerFormats ? JSON.parse(settings.bannerFormats) : []
                const newFormat = { id, label, width, height, selector }
                currentFormats.push(newFormat)

                await updateSettings({ bannerFormats: JSON.stringify(currentFormats) })

                return {
                    message: `✅ Formato registrado: ${label}`,
                    success: true,
                    actionPerformed: 'UPDATE_FORMATS',
                    data: newFormat
                }
            }
        }

        if (text.includes('cadastr') || text.includes('criar')) {
            const extracted = await extractCampaignsFromText(prompt)
            if (extracted.length > 0) {
                return {
                    message: `Entendido. Identifiquei ${extracted.length} potenciais campanhas.`,
                    success: true,
                    actionPerformed: 'REGISTRATION_PREVIEW',
                    data: extracted
                }
            }
        }

        // Final Fallback
        return {
            message: "Desculpe, tive um problema de comunicação com meus neurônios. Tente novamente em instantes.",
            success: false
        }

    } catch (error) {
        console.error('Nexus AI Error:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)
        return { message: `Erro interno nos circuitos neurais: ${errorMsg}`, success: false }
    }
}
