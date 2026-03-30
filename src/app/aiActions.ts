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

console.log('[Gemini Module] Carregado!')

export interface NexusResponse {
    message: string
    success: boolean
    actionPerformed?: 'CAPTURE' | 'CAPTURE_ALL' | 'ARCHIVE' | 'UPDATE_URL' | 'REGISTRATION_PREVIEW' | 'UPDATE_FORMATS' | 'STOP_CAPTURES' | 'SCHEDULE_ALL' | 'DOWNLOAD_ZIP'
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
    text.split(/---|Nova Campanha:|Campanha \d+:|Campanha:/i).filter(s => s.trim().length > 10)

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
        // Split by semantic blocks or explicit "new item" markers
        const blocks = text.split(/;|\ne |(?=agenc|client|campanh|link|formato|pi|data|segmen|inicio|fim|veicula)/i)
        const currentData: Partial<brain.ParsedCampaign> = { agency: 'Adsnap', segmentation: 'PRIVADO' }
        let hasData = false

        for (const block of blocks) {
            const piMatch = block.match(/pi[:\s]+(\d+)/i) || block.match(piPattern)
            const urlMatch = block.match(/link[:\s]+(https?:\/\/[^\s,]+)/i) || block.match(urlPattern)
            const clientMatch = block.match(/client[e]?[:\s]+([^,\n|]+)/i)
            const agencyMatch = block.match(/(?:agência|agency)[:\s]+(.+)/i)
            const nameMatch = block.match(/(?:nome|campanha|name)[:\s]+(.+)/i)
            const formatMatch = block.match(/(?:formato|format)[:\s]+(.+)/i)
            const segMatch = block.match(/(?:segmentação|segmentation|seg)[:\s]+(.+)/i)
            const startMatch = block.match(/(?:início|start|desde)[:\s]+([\d\/.-]+)/i)
            const endMatch = block.match(/(?:fim|end|até)[:\s]+([\d\/.-]+)/i)

            if (clientMatch) { currentData.client = clientMatch[1].trim(); hasData = true; }
            if (piMatch) { currentData.pi = piMatch[1].trim(); hasData = true; }
            if (urlMatch) { currentData.url = urlMatch[1].trim(); hasData = true; }
            if (agencyMatch) { currentData.agency = agencyMatch[1].trim(); hasData = true; }
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
    
    // Technical keywords that bypass AI for instant response.
    const technicalKeywords = [
        'status', 'bi', 'dashboard', 'painel', 'resumo bi', 'resumo',
        'baixar zip', 'download zip', 'baixar', 'download', 'exportar',
        'print tudo', 'capturar tudo', 'tirar print',
        'parar tudo', 'stop captures', 'parar', 'interromper',
        'como estão', 'como esta', 'métricas', 'metricas',
        'campanha', 'ver pi', 'detalhe',
        'alerta', 'avise', 'notifique',
        'formato', 'agendar', 'schedule'
    ]
    
    // Short commands: exact or prefix match
    if (t.length < 25) {
        return technicalKeywords.some(kw => t === kw || t.startsWith(kw + ' ') || t.includes(kw))
    }
    
    // Longer messages: look for strong operational signals
    return technicalKeywords.some(kw => t.includes(kw))
}

async function handleDirectCommand(prompt: string): Promise<NexusResponse | null> {
    const text = prompt.toLowerCase()
    
    // 1. STATUS / DASHBOARD / BI
    if (text.includes('status') || text.includes('resumo') || text.includes('como estão') || text.includes('análise') || text.includes('analise') || text.includes('bi')) {
        if (text.includes('dashboard') || text.includes('métrica') || text.includes('detalhe') || text.includes('bi') || text.includes('análise') || text.includes('analise')) {
            console.log('[Nexus FastPath] Calling BI AdOps Summary...')
            const result = await brain.getAdOpsSummary()
            if (result.success && result.data) {
                const data = result.data as brain.BIData
                const { total, healthScore, globalGoal, globalDelivered, globalToday, globalProjected, avgViewability, atRiskCampaigns } = data
                const emoji = healthScore > 80 ? '✅' : healthScore > 50 ? '⚠️' : '🚨'
                const progress = ((globalDelivered / globalGoal) * 100).toFixed(1)
                const projPercent = ((globalProjected / globalGoal) * 100).toFixed(1)
                
                let message = `### 📊 Relatório BI de AdOps\n\n`
                message += `- **Saúde Geral:** ${healthScore}% ${emoji}\n`
                message += `- **Volume Total:** ${globalDelivered.toLocaleString()} / ${globalGoal.toLocaleString()} (${progress}%)\n`
                message += `- **Entrega Hoje:** ${globalToday.toLocaleString()} impressões ⚡\n`
                message += `- **Projeção Final:** ${globalProjected.toLocaleString()} (${projPercent}%)\n`
                message += `- **Média Viewability:** ${avgViewability.toFixed(1)}%\n`
                
                if (atRiskCampaigns && atRiskCampaigns.length > 0) {
                    message += `\n⚠️ **Campanhas em Atenção:** ${atRiskCampaigns.join(', ')}\n`
                }
                
                message += `\n*Análise BI consolidada para ${total} campanhas.*`
                
                return {
                    message,
                    success: true,
                    data: result.data
                }
            }
            return {
                message: result.message,
                success: result.success,
                data: result.data
            }
        }
        
        console.log('[Nexus FastPath] Calling Fast DB Status...')
        const count = await prisma.campaign.count({ where: { isArchived: false } })
        const scheduled = await prisma.campaign.count({ where: { isArchived: false, isScheduled: true } })
        const todaysCaptures = await prisma.capture.count({
            where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
        })

        return {
            message: `Status do Sistema:\n- ${count} Campanhas Ativas\n- ${scheduled} Agendadas\n- ${todaysCaptures} Capturas hoje.\n\nSistemas operando normalmente.`,
            success: true
        }
    }

    // 2. CAPTURE ALL
    if ((text.includes('print') || text.includes('capturar')) && (text.includes('tudo') || text.includes('todas'))) {
        console.log('[Nexus FastPath] Triggering Global Capture...')
        const trigger = await runAllCaptures()
        return {
            message: getRandom(RESPONSES.SUCCESS_CAPTURE_ALL).replace('{count}', trigger.count.toString()),
            success: true,
            actionPerformed: 'CAPTURE_ALL'
        }
    }

    // 3. STOP CAPTURES
    if ((text.includes('parar') || text.includes('interromper') || text.includes('cancelar') || text.includes('stop')) &&
        (text.includes('print') || text.includes('captura') || text.includes('disparo') || text.includes('tudo'))) {
        console.log('[Nexus FastPath] Stopping all captures...')
        const result = await stopAllCaptures()
        return {
            message: getRandom(RESPONSES.SUCCESS_STOP).replace('{count}', result.stoppedCount.toString()),
            success: true,
            actionPerformed: 'STOP_CAPTURES',
            data: { stoppedCount: result.stoppedCount }
        }
    }

    // 4. DOWNLOAD ZIP
    if (text.includes('baixar') || text.includes('download') || text.includes('exportar')) {
        console.log('[Nexus FastPath] Preparing Download...')
        const dateMatch = prompt.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/)
        let targetDate = new Date().toISOString().split('T')[0]

        if (dateMatch) {
            const day = parseInt(dateMatch[1])
            const month = parseInt(dateMatch[2]) - 1
            const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : new Date().getFullYear()
            targetDate = new Date(year, month, day).toISOString().split('T')[0]
        }

        return {
            message: getRandom(RESPONSES.SUCCESS_DOWNLOAD).replace(/{date}/g, targetDate),
            success: true,
            actionPerformed: 'DOWNLOAD_ZIP',
            data: { date: targetDate }
        }
    }

    // 5. CAMPAIGN DETAILS (PI OR NAME)
    if (text.includes('campanha') || text.includes('detalhe') || text.includes('ver pi') || text.match(/\b\d{3,6}\b/)) {
        const piMatch = prompt.match(/\b\d{3,6}\b/)
        const nameMatch = prompt.match(/(?:campanha|cliente|client)[:\s]+(.+)/i) || 
                          prompt.match(/como está a campanha\s+(.+)/i)
        
        const rawQuery = piMatch ? piMatch[0] : (nameMatch ? nameMatch[1].trim() : null)
        const query = rawQuery ? rawQuery.replace(/[?.,!]+$/, '').trim() : null
        
        if (query) {
            console.log(`[Nexus FastPath] Searching for campaign: "${query}"`)
            return await brain.getCampaign(query)
        }
    }

    // 6. SET THRESHOLD ALERT (NEW)
    if ((text.includes('alerta') || text.includes('avise') || text.includes('notifique')) && 
        (text.includes('impressão') || text.includes('entrega') || text.includes('chegar'))) {
        
        const piMatch = prompt.match(/\b\d{3,6}\b/)
        const thresholdMatch = prompt.match(/(\d+)\s*(?:mil|k)/i) || prompt.match(/(\d{4,9})/)
        
        if (piMatch && thresholdMatch) {
            const pi = piMatch[0]
            let threshold = parseInt(thresholdMatch[1])
            if (prompt.toLowerCase().includes('mil') || prompt.toLowerCase().includes(' k')) {
                threshold *= 1000
            }
            
            console.log(`[Nexus FastPath] Setting threshold for PI ${pi}: ${threshold}`)
            const result = await brain.setCampaignThreshold(pi, threshold)
            return {
                message: result.message,
                success: result.success,
                data: result.data
            }
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
        
        // Timeout de 8s para a IA (balanceado com o frontend de 20s)
        const brainPromise = nexusBrain(prompt)
        const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('AI_TIMEOUT')), 8000))
        
        let brainResult: NexusResponse | null = null
        try {
            brainResult = await Promise.race([brainPromise, timeoutPromise]) as NexusResponse
        } catch (err) {
            const isTimeout = err instanceof Error && err.message === 'AI_TIMEOUT'
            console.warn(`[Nexus AI] Brain ${isTimeout ? 'Timeout (8s limit)' : 'Error'}:`, err)
            // AI failed or timed out — continue to manual fallbacks
        }
        console.timeEnd('NexusAI')
        
        if (brainResult?.success && brainResult.actionPerformed) {
            console.timeEnd('NexusTotal')
            return {
                message: brainResult.message,
                success: true,
                actionPerformed: brainResult.actionPerformed,
                data: brainResult.data
            }
        }
        
        if (brainResult?.success && brainResult.message) {
            console.timeEnd('NexusTotal')
            return { message: brainResult.message, success: true }
        }

        // ---------------------------------------------------------
        // 1. GESTÃO DE FORMATOS (Legacy/Manual Override)
        // ---------------------------------------------------------
        if (text.includes('formato') && (text.includes('adicionar') || text.includes('novo') || text.includes('criar') || text.includes('configurar'))) {
            // Ex: "Adicionar formato Super Banner 970x90 com seletor .super-banner"
            const dimsMatch = text.match(/(\d+)[xX](\d+)/)
            const selectorMatch = text.match(/(?:seletor|selector|xpath)[:\s]+([^\s]+)/i)
            // Tenta extrair o nome (tudo entre "formato" e as dimensões/seletor)
            const nameMatch = text.match(/formato[:\s]+(.+?)(?=\s+\d+[xX]|\s+(?:com\s+)?seletor|$)/i) ||
                text.match(/novo[:\s]+(.+?)(?=\s+\d+[xX]|\s+(?:com\s+)?seletor|$)/i)

            if (dimsMatch && selectorMatch) {
                const width = parseInt(dimsMatch[1])
                const height = parseInt(dimsMatch[2])
                const selector = selectorMatch[1]
                const label = (nameMatch ? nameMatch[1].trim() : `${width}x${height}`)
                const id = `${width}x${height}`

                const settings = await getSettings()
                const currentFormats: { id: string; label: string; width: number; height: number; selector: string }[] = settings.bannerFormats ? JSON.parse(settings.bannerFormats) : []

                const existingIndex = currentFormats.findIndex((f) => f.id === id)
                const newFormat = { id, label, width, height, selector }

                if (existingIndex >= 0) {
                    currentFormats[existingIndex] = newFormat
                } else {
                    currentFormats.push(newFormat)
                }

                await updateSettings({ bannerFormats: JSON.stringify(currentFormats) })

                return {
                    message: (existingIndex >= 0 ? '✅ Formato atualizado' : '✅ Novo formato registrado') + `: ${label} (${width}x${height})`,
                    success: true,
                    actionPerformed: 'UPDATE_FORMATS',
                    data: newFormat
                }
            } else {
                return {
                    message: "Para adicionar um formato, preciso das dimensões e do seletor CSS. Exemplo: 'Adicionar formato Topo 300x250 com seletor .banner-top'.",
                    success: false
                }
            }
        }

        // ---------------------------------------------------------
        // 2. REGISTRO / CADASTRO
        // ---------------------------------------------------------
        if (text.includes('cadastr') || text.includes('criar') || text.includes('novo registro') || text.includes('adicionar camp')) {
            const extracted = await extractCampaignsFromText(prompt)

            if (extracted.length > 0) {
                return {
                    message: `Entendido. Identifiquei ${extracted.length} potenciais ${extracted.length === 1 ? 'campanha' : 'campanhas'}. Abrindo painel de revisão...`,
                    success: true,
                    actionPerformed: 'REGISTRATION_PREVIEW',
                    data: extracted
                }
            }
        }

        // ---------------------------------------------------------
        // 3. INTERROMPER CAPTURAS (NOVO)
        // ---------------------------------------------------------
        if ((text.includes('parar') || text.includes('interromper') || text.includes('cancelar') || text.includes('stop')) &&
            (text.includes('print') || text.includes('captura') || text.includes('disparo') || text.includes('tudo'))) {
            const result = await stopAllCaptures()
            return {
                message: getRandom(RESPONSES.SUCCESS_STOP).replace('{count}', result.stoppedCount.toString()),
                success: true,
                actionPerformed: 'STOP_CAPTURES',
                data: { stoppedCount: result.stoppedCount }
            }
        }

        // ---------------------------------------------------------
        // 4. AGENDAR TODAS AS CAMPANHAS (NOVO)
        // ---------------------------------------------------------
        if ((text.includes('agendar') || text.includes('programar') || text.includes('schedule')) &&
            (text.includes('todas') || text.includes('tudo') || text.includes('all') || text.includes('campanhas'))) {
            // Extract time from text (formats: 14:30, 14h30, 14h, às 14:30)
            const timeMatch = text.match(/(\d{1,2})[h:](\d{2})/) || text.match(/(\d{1,2})h\b/)

            if (timeMatch) {
                const hours = timeMatch[1].padStart(2, '0')
                const minutes = timeMatch[2] ? timeMatch[2] : '00'
                const time = `${hours}:${minutes}`

                const result = await scheduleAllCampaigns(time)

                if (result.success) {
                    return {
                        message: getRandom(RESPONSES.SUCCESS_SCHEDULE_ALL)
                            .replace('{count}', result.updatedCount!.toString())
                            .replace('{time}', time),
                        success: true,
                        actionPerformed: 'SCHEDULE_ALL',
                        data: { updatedCount: result.updatedCount, time }
                    }
                } else {
                    return { message: result.error || 'Erro ao agendar campanhas.', success: false }
                }
            }

            return {
                message: "Para agendar todas as campanhas, informe o horário. Ex: 'Agendar todas para 14:30' ou 'Programar campanhas às 10h'.",
                success: false
            }
        }

        // ---------------------------------------------------------
        // 5. IDENTIDADE & SMALL TALK
        // ---------------------------------------------------------
        if (text.includes('quem é você') || text.includes('o que você é'))
            return { message: getRandom(RESPONSES.IDENTITY), success: true }

        if (text.includes('ajuda') || text.includes('help') || text.includes('o que você faz'))
            return { message: getRandom(RESPONSES.HELP), success: true }

        if (text.match(/^(oi|olá|ola|bom dia|boa tarde|boa noite)/)) {
            if (text.length < 15) return { message: getRandom(RESPONSES.GREETING), success: true }
            return { message: getRandom(RESPONSES.SMALL_TALK), success: true }
        }

        // ---------------------------------------------------------
        // 4. CAPTURAS
        // ---------------------------------------------------------
        if (text.includes('print') || text.includes('captur') || text.includes('screenshot') || text.includes('foto')) {
            // ALL
            if (text.includes('tudo') || text.includes('todas') || text.includes('geral')) {
                const trigger = await runAllCaptures()
                return {
                    message: getRandom(RESPONSES.SUCCESS_CAPTURE_ALL).replace('{count}', trigger.count.toString()),
                    success: true,
                    actionPerformed: 'CAPTURE_ALL'
                }
            }
            // SINGLE
            const piMatch = text.match(/pi\s*(\d+)/) || text.match(/\d{3,6}/)
            if (piMatch) {
                const pi = piMatch.length > 1 ? piMatch[1] : piMatch[0]
                const campaign = await prisma.campaign.findFirst({ where: { pi, isArchived: false } })

                if (campaign) {
                    const result = await runCapture(campaign.id)
                    if (result.success) {
                        return {
                            message: getRandom(RESPONSES.SUCCESS_CAPTURE)
                                .replace('{name}', campaign.campaignName || campaign.client)
                                .replace('{pi}', pi),
                            success: true,
                            actionPerformed: 'CAPTURE'
                        }
                    } else {
                        return { message: `Falha ao capturar PI ${pi}. Verifique o link.`, success: false }
                    }
                }
                return { message: `Campanha PI ${pi} não encontrada ou arquivada.`, success: false }
            }
            return { message: "Preciso saber qual PI capturar. Ex: 'Tira print do PI 123'.", success: false }
        }

        // ---------------------------------------------------------
        // 5. ARQUIVAMENTO / RESTAURO
        // ---------------------------------------------------------
        if (text.includes('arquivar') || text.includes('desarquivar') || text.includes('restaurar') || text.includes('ativar')) {
            const isArchive = text.includes('arquivar')
            const piMatch = text.match(/\d{3,6}/)

            if (piMatch) {
                const pi = piMatch[0]
                const campaign = await prisma.campaign.findFirst({ where: { pi, isArchived: !isArchive } })

                if (campaign) {
                    await archiveCampaign(campaign.id, isArchive)
                    const tpl = isArchive ? RESPONSES.SUCCESS_ARCHIVE : RESPONSES.SUCCESS_RESTORE
                    return {
                        message: getRandom(tpl)
                            .replace('{name}', campaign.campaignName || campaign.client)
                            .replace('{pi}', pi),
                        success: true,
                        actionPerformed: 'ARCHIVE'
                    }
                }
                return { message: `Não encontrei a campanha PI ${pi} para ${isArchive ? 'arquivar' : 'restaurar'}.`, success: false }
            }
            return { message: isArchive ? "Qual PI devo arquivar?" : "Qual PI devo restaurar?", success: false }
        }

        // ---------------------------------------------------------
        // 6. TROCAR URL
        // ---------------------------------------------------------
        if ((text.includes('url') || text.includes('link')) && (text.includes('trocar') || text.includes('mudar') || text.includes('alterar'))) {
            const urlMatch = text.match(/https?:\/\/[^\s]+/)
            const piMatch = text.match(/\d{3,6}/)

            if (urlMatch && piMatch) {
                const pi = piMatch[0]
                const newUrl = urlMatch[0]
                const campaign = await prisma.campaign.findFirst({ where: { pi, isArchived: false } })

                if (campaign) {
                    const formData = new FormData()
                    // Re-populating formData to reuse updateCampaign action (which expects FormData)
                    formData.append('agency', campaign.agency)
                    formData.append('client', campaign.client)
                    formData.append('campaignName', campaign.campaignName)
                    formData.append('pi', campaign.pi)
                    formData.append('format', campaign.format)
                    formData.append('url', newUrl) // THE CHANGE
                    formData.append('device', campaign.device)
                    formData.append('segmentation', campaign.segmentation)
                    formData.append('isScheduled', String(campaign.isScheduled))
                    formData.append('scheduledTimes', campaign.scheduledTimes)
                    if (campaign.flightStart) formData.append('flightStart', campaign.flightStart.toISOString())
                    if (campaign.flightEnd) formData.append('flightEnd', campaign.flightEnd.toISOString())

                    await updateCampaign(campaign.id, formData)

                    return {
                        message: getRandom(RESPONSES.SUCCESS_URL)
                            .replace('{client}', campaign.client)
                            .replace('{pi}', pi)
                            .replace('{url}', newUrl),
                        success: true,
                        actionPerformed: 'UPDATE_URL'
                    }
                }
                return { message: `Campanha PI ${pi} não encontrada.`, success: false }
            }
            return { message: "Informe o PI e a nova URL. Ex: 'Mudar link PI 123 para http://...'", success: false }
        }

        // ---------------------------------------------------------
        // 8. DOWNLOAD ZIP (NOVO)
        // ---------------------------------------------------------
        if (text.includes('baixar') || text.includes('download') || text.includes('exportar')) {
            const dateMatch = prompt.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/)
            let targetDate = new Date().toISOString().split('T')[0] // Default: Today

            if (dateMatch) {
                const day = parseInt(dateMatch[1])
                const month = parseInt(dateMatch[2]) - 1
                const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : new Date().getFullYear()
                targetDate = new Date(year, month, day).toISOString().split('T')[0]
            }

            return {
                message: getRandom(RESPONSES.SUCCESS_DOWNLOAD).replace(/{date}/g, targetDate),
                success: true,
                actionPerformed: 'DOWNLOAD_ZIP',
                data: { date: targetDate }
            }
        }


        // ---------------------------------------------------------
        // 10. CONSULTAR E-MAILS (V2 — LIVE SEARCH)
        // ---------------------------------------------------------
        const emailKeywords = [
            'email', 'e-mail', 'gmail', 'mensagem', 'caixa de entrada', 'inbox',
            'recebi', 'recebeu', 'mandou', 'enviou', 'tem algo', 'tem algum'
        ]
        const hasEmailIntent = emailKeywords.some(kw => text.toLowerCase().includes(kw))
        
        if (hasEmailIntent) {
            try {
                const gmailClient = await createGmailClientFromEnv()
                
                if (!gmailClient) {
                    return {
                        message: '⚠️ Gmail não configurado. Verifique GMAIL_CLIENT_ID, GMAIL_REFRESH_TOKEN e GMAIL_USER_EMAIL.',
                        success: false
                    }
                }

                const userEmail = process.env.GMAIL_USER_EMAIL || ''
                const toFilter = userEmail ? `to:${userEmail}` : 'to:me'
                
                const { buildGmailQuery, askGeminiAboutEmails } = await import('@/lib/gemini')
                const brDate = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
                
                const aiQuery = await buildGmailQuery(prompt, brDate)
                
                let finalQuery = aiQuery
                if (!aiQuery.includes('to:') && !aiQuery.includes('to =')) {
                    finalQuery = `${toFilter} ${aiQuery}`
                } else if (!aiQuery.includes(userEmail) && userEmail) {
                    finalQuery = aiQuery.replace(/to:[^\s]+/, `to:${userEmail}`)
                }

                console.log(`[Nexus AI] Query Gemini: "${aiQuery}"`)
                console.log(`[Nexus AI] Query Final: "${finalQuery}"`)
                
                const emails = await searchEmails(gmailClient, finalQuery, 15)
                console.log(`[Nexus AI] Emails encontrados: ${emails.length}`)
                
                const geminiAnswer = await askGeminiAboutEmails(prompt, emails, finalQuery)
                
                return {
                    message: geminiAnswer,
                    success: true,
                    data: emails.length > 0 ? { threadId: emails[0].threadId, from: emails[0].from } : undefined
                }
            } catch (emailErr) {
                console.error('[Nexus AI] Erro na busca de emails:', emailErr)
                return {
                    message: 'Erro ao consultar o Gmail. Verifique se as credenciais estão corretas.',
                    success: false
                }
            }
        }

        // ---------------------------------------------------------
        // ULTIMATE PASS: Gemini (Nexus Brain)
        // ---------------------------------------------------------
        console.log('[Nexus AI Action] No manual override found. Passing to Nexus Brain (Gemini)...')
        const aiResult = await nexusBrain(prompt)
        
        if (aiResult && aiResult.success) {
            console.timeEnd('NexusTotal')
            return {
                message: aiResult.message,
                success: true,
                actionPerformed: aiResult.actionPerformed as NexusResponse['actionPerformed'],
                data: aiResult.data
            }
        }

        // Final Fallback (Should rarely be reached)
        return {
            message: "Desculpe, tive um problema nos meus circuitos neurais. Como posso ajudar de outra forma?",
            success: false
        }

    } catch (error) {
        console.error('Nexus AI Error:', error)
        const errorMsg = error instanceof Error ? error.message : String(error)

        // Log to persistent store
        try {
            const { nexusLogStore } = await import('@/lib/nexusLogStore')
            await nexusLogStore.addLog(`Nexus AI: Falha ao processar comando - ${errorMsg}`, 'ERROR')
        } catch (logErr) {
            console.error('Failed to log AI error:', logErr)
        }

        return { message: `Erro interno nos circuitos neurais: ${errorMsg}`, success: false }
    }
}
