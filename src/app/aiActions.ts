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

export interface NexusResponse {
    message: string
    success: boolean
    actionPerformed?: 'CAPTURE' | 'CAPTURE_ALL' | 'ARCHIVE' | 'UPDATE_URL' | 'REGISTRATION_PREVIEW' | 'UPDATE_FORMATS' | 'STOP_CAPTURES' | 'SCHEDULE_ALL' | 'DOWNLOAD_ZIP'
    data?: any
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
        "Posso ajudar com:\n- Capturas: 'Tirar print do PI 991' ou 'Capturar tudo'\n- Gestão: 'Arquivar PI 123', 'Mudar link do PI 456'\n- Formatos: 'Adicionar formato Super Banner 970x250 com seletor .banner'\n- Status: 'Resumo geral'",
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
    ]
}

function getRandom(arr: string[]): string {
    return arr[Math.floor(Math.random() * arr.length)]
}

function extractCampaignsFromText(text: string): any[] {
    const campaigns: any[] = []

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
        const currentData: any = { agency: 'Adsnap', segmentation: 'PRIVADO' }
        let hasData = false

        for (const block of blocks) {
            const piMatch = block.match(/pi[:\s]+(\d+)/i) || block.match(piPattern)
            const urlMatch = block.match(/link[:\s]+(https?:\/\/[^\s,]+)/i) || block.match(urlPattern)
            const clientMatch = block.match(/client[e]?[:\s]+([^,\n|]+)/i)
            const agencyMatch = block.match(/agenc[ia]+[:\s]+([^,\n|]+)/i)
            const nameMatch = block.match(/(?:campanha|nome)[:\s]+([^,\n|]+)/i)
            const formatMatch = block.match(/formato[:\s]+([^,\n|]+)/i)
            const segMatch = block.match(/(?:segmentação|segmento|tipo)[:\s]+([^,\n|]+)/i)

            const startMatch = block.match(/(?:inicio|início|desde|veiculaçã?o)[:\s]+(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/i)
            const endMatch = block.match(/(?:fim|até|termino|término)[:\s]+(\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?)/i)

            if (piMatch) { currentData.pi = (Array.isArray(piMatch) && piMatch[1]) ? piMatch[1] : piMatch[0]; hasData = true; }
            if (urlMatch) { currentData.url = (Array.isArray(urlMatch) && urlMatch[1]) ? urlMatch[1] : urlMatch[0]; hasData = true; }
            if (clientMatch) { currentData.client = clientMatch[1].trim(); hasData = true; }
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

export async function processNexusCommand(prompt: string): Promise<NexusResponse> {
    const text = prompt.toLowerCase()

    // Simulação de latência de pensamento
    await new Promise(resolve => setTimeout(resolve, 600))

    try {
        // ---------------------------------------------------------
        // 1. GESTÃO DE FORMATOS (NOVO)
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
                const label = nameMatch ? nameMatch[1].trim() : `${width}x${height}`
                const id = `${width}x${height}`

                const settings = await getSettings() as any
                const currentFormats = settings.bannerFormats ? JSON.parse(settings.bannerFormats) : []

                // Check if exists
                const existingIndex = currentFormats.findIndex((f: any) => f.id === id)
                const newFormat = { id, label, width, height, selector }

                if (existingIndex >= 0) {
                    currentFormats[existingIndex] = newFormat
                } else {
                    currentFormats.push(newFormat)
                }

                await updateSettings({
                    ...settings,
                    bannerFormats: JSON.stringify(currentFormats)
                })

                return {
                    message: getRandom(RESPONSES.SUCCESS_FORMAT)
                        .replace('{label}', label)
                        .replace('{width}', width.toString())
                        .replace('{height}', height.toString()),
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
            const extracted = extractCampaignsFromText(prompt)

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
        // 9. STATUS / RELATÓRIO
        // ---------------------------------------------------------
        if (text.includes('status') || text.includes('resumo') || text.includes('como estão')) {
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

        // Fallback
        return {
            message: "Ainda estou aprendendo esse comando. Posso ajudar com Capturas, Arquivos, Links, Status ou Configuração de Formatos.",
            success: true
        }

    } catch (error) {
        console.error('Nexus AI Error:', error)
        return { message: "Erro interno nos circuitos neurais. Tente novamente.", success: false }
    }
}
