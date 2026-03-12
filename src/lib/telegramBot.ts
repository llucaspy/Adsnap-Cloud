import { supabase } from './supabase'
import { nexusLogStore } from './nexusLogStore'

// =============================================================================
// TELEGRAM BOT ENGINE — Centro de Comando (SDK Version)
// =============================================================================

const BOT_TOKEN = () => process.env.NexusTelegram || ''
const ALLOWED_CHAT_ID = () => process.env.chatidtelegram || ''

// ---------------------------------------------------------------------------
// Format ID → Label resolver (cached per request lifecycle)
// ---------------------------------------------------------------------------
let _formatMapCache: Record<string, string> | null = null

async function loadFormatMap(): Promise<Record<string, string>> {
    if (_formatMapCache) return _formatMapCache

    try {
        const { data: settings } = await supabase
            .from('Settings')
            .select('bannerFormats')
            .eq('id', 1)
            .single()

        if (settings?.bannerFormats) {
            const formats = JSON.parse(settings.bannerFormats || '[]') as { id: string, label: string }[]
            _formatMapCache = {}
            for (const f of formats) {
                _formatMapCache[f.id] = f.label
            }
        }
    } catch (e) {
        console.error('[TelegramBot] Erro ao carregar formatos:', e)
    }

    return _formatMapCache || {}
}

function getFormatLabel(formatMap: Record<string, string>, formatId: string): string {
    return formatMap[formatId] || formatId
}

// ---------------------------------------------------------------------------
// Core: send message
// ---------------------------------------------------------------------------
export async function sendMessage(chatId: string, text: string, options?: {
    parse_mode?: 'MarkdownV2' | 'HTML'
    reply_markup?: any
}) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/sendMessage`
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: options?.parse_mode || 'HTML',
                disable_web_page_preview: true,
                reply_markup: options?.reply_markup,
            }),
        })
        const data = await res.json()
        return data
    } catch (err) {
        console.error('[TelegramBot] Send error:', err)
        return null
    }
}

// ---------------------------------------------------------------------------
// Auth: verify sender
// ---------------------------------------------------------------------------
function isAuthorized(chatId: string | number): boolean {
    const allowed = ALLOWED_CHAT_ID()
    if (!allowed) return false
    return String(chatId) === String(allowed)
}

// ---------------------------------------------------------------------------
// Command Router
// ---------------------------------------------------------------------------
export async function handleUpdate(update: any) {
    const message = update?.message
    if (!message?.text) return

    const chatId = String(message.chat.id)
    const text = message.text.trim()

    // Auth check
    if (!isAuthorized(chatId)) {
        console.log(`[TelegramBot] Acesso negado para chatId: ${chatId}`);
        try { await nexusLogStore.addLog(`Bot Telegram: Acesso negado (ChatID: ${chatId})`, 'ERROR'); } catch (e) {}
        await sendMessage(chatId, '🚫 <b>Acesso negado.</b>\nSeu Chat ID não está autorizado.')
        return
    }

    try {
        console.log(`[TelegramBot] Recebido: ${text} de ${chatId}`);
        // Log is less important than responding, call it async without await if needed but let's try
        try { await nexusLogStore.addLog(`Bot Telegram: Comando recebido: ${text}`, 'INFO'); } catch (e) {}

        const [rawCmd, ...args] = text.split(' ')
        const cmd = rawCmd.toLowerCase().replace('@', '').split('@')[0]

        switch (cmd) {
            case '/start':
            case '/ajuda':
                return await handleHelp(chatId)
            case '/status':
                return await handleStatus(chatId)
            case '/campanhas':
                return await handleCampanhas(chatId)
            case '/fila':
                return await handleFila(chatId)
            case '/quarentena':
                return await handleQuarentena(chatId)
            case '/storage':
                return await handleStorage(chatId)
            case '/logs':
                return await handleLogs(chatId)
            default:
                await sendMessage(chatId, `❓ Comando desconhecido: <code>${esc(cmd)}</code>\n\nDigite /ajuda para ver os comandos disponíveis.`)
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[TelegramBot] Erro ao processar ${text}:`, err);
        await sendMessage(chatId, `❌ Erro ao processar comando: <code>${esc(errorMsg)}</code>`);
    }
}

// ---------------------------------------------------------------------------
// Helper: escape HTML
// ---------------------------------------------------------------------------
function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// /ajuda
// ---------------------------------------------------------------------------
async function handleHelp(chatId: string) {
    const text = `
🤖 <b>ADSNAP CLOUD — Bot de Comando</b>

📊 <b>Monitoramento</b>
/status — Visão geral do sistema
/campanhas — Lista campanhas ativas
/fila — Status da fila de capturas
/quarentena — Campanhas em quarentena
/storage — Uso do Supabase Storage
/logs — Últimos logs do Nexus

ℹ️ <b>Outros</b>
/ajuda — Esta mensagem
    `.trim()
    await sendMessage(chatId, text)
}

// ---------------------------------------------------------------------------
// /status — Agrupa por PI
// ---------------------------------------------------------------------------
async function handleStatus(chatId: string) {
    try {
        // Busca todas as campanhas ativas
        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('pi, status, format, lastCaptureAt')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')

        if (error) throw error
        const all = campaigns || []

        // Agrupar PIs únicos
        const piSet = new Set(all.map(c => c.pi))
        const totalPIs = piSet.size

        // Contar formatos por status
        const successFormats = all.filter(c => c.status === 'SUCCESS').length
        const failedFormats = all.filter(c => c.status === 'FAILED').length
        const quarantineFormats = all.filter(c => c.status === 'QUARANTINE').length
        const queuedFormats = all.filter(c => c.status === 'QUEUED').length
        const processingFormats = all.filter(c => c.status === 'PROCESSING').length

        // PIs com pelo menos 1 erro
        const pisComErro = new Set(all.filter(c => c.status === 'FAILED' || c.status === 'QUARANTINE').map(c => c.pi)).size
        // PIs 100% sucesso
        const pisSucesso = [...piSet].filter(pi => {
            const formats = all.filter(c => c.pi === pi)
            return formats.every(c => c.status === 'SUCCESS')
        }).length

        // Capturas hoje
        const todayStr = new Date().toISOString().split('T')[0]
        const { count: todayCount } = await supabase
            .from('Capture')
            .select('*', { count: 'exact', head: true })
            .gte('createdAt', todayStr)

        const text = `
📊 <b>STATUS DO SISTEMA</b>

📁 <b>Campanhas (PIs)</b>
├ Total PIs ativos: <b>${totalPIs}</b>
├ PIs 100% capturados: ✅ ${pisSucesso}
└ PIs com erro: ❌ ${pisComErro}

📐 <b>Formatos</b>
├ Total: <b>${all.length}</b>
├ Sucesso: ✅ ${successFormats}
├ Falhas: ❌ ${failedFormats}
└ Quarentena: ⚠️ ${quarantineFormats}

🔄 <b>Fila</b>
├ Na fila: ${queuedFormats} formatos
└ Processando: ${processingFormats} formatos

📸 <b>Capturas hoje:</b> ${todayCount || 0}
        `.trim()

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /campanhas — Agrupa por PI com detalhes de formato
// ---------------------------------------------------------------------------
async function handleCampanhas(chatId: string) {
    try {
        const fmtMap = await loadFormatMap()

        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('id, pi, client, campaignName, format, status, device, lastCaptureAt, isScheduled, scheduledTimes')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')
            .order('client', { ascending: true })

        if (error) throw error
        if (!campaigns || campaigns.length === 0) {
            await sendMessage(chatId, '📭 Nenhuma campanha ativa.')
            return
        }

        // Agrupar por PI
        const piGroups = new Map<string, typeof campaigns>()
        for (const c of campaigns) {
            const key = c.pi || 'SEM_PI'
            if (!piGroups.has(key)) piGroups.set(key, [])
            piGroups.get(key)!.push(c)
        }

        const statusIcon: Record<string, string> = {
            PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️',
            SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️',
        }

        let text = `📋 <b>CAMPANHAS ATIVAS</b>\n${piGroups.size} PIs • ${campaigns.length} formatos\n\n`

        let piIdx = 0
        for (const [pi, formats] of piGroups) {
            if (piIdx >= 10) {
                text += `\n<i>...e mais ${piGroups.size - 10} PIs</i>`
                break
            }
            const client = formats[0].client
            const allSuccess = formats.every(f => f.status === 'SUCCESS')
            const hasError = formats.some(f => f.status === 'FAILED' || f.status === 'QUARANTINE')
            const piIcon = allSuccess ? '✅' : hasError ? '❌' : '🔄'

            text += `${piIcon} <b>${esc(client)}</b>\n`
            text += `   PI: <code>${esc(pi)}</code>\n`

            for (const f of formats) {
                const fIcon = statusIcon[f.status] || '❓'
                const last = f.lastCaptureAt
                    ? new Date(f.lastCaptureAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                    : '—'
                text += `   ${fIcon} ${esc(getFormatLabel(fmtMap, f.format))} (${f.device}) • ${last}\n`
            }
            text += '\n'
            piIdx++
        }

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro ao listar: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /fila — Mostra PI + campanhas na fila com horários agendados
// ---------------------------------------------------------------------------
async function handleFila(chatId: string) {
    try {
        const fmtMap = await loadFormatMap()
        // Busca campanhas na fila ou processando
        const { data: inQueue, error: qErr } = await supabase
            .from('Campaign')
            .select('id, pi, client, format, status, device')
            .in('status', ['QUEUED', 'PROCESSING'])
            .order('updatedAt', { ascending: true })

        // Busca campanhas agendadas (futuras)
        const { data: scheduled, error: sErr } = await supabase
            .from('Campaign')
            .select('id, pi, client, format, status, device, isScheduled, scheduledTimes')
            .eq('isScheduled', true)
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED","QUEUED","PROCESSING")')

        if (qErr) throw qErr
        if (sErr) throw sErr

        const queue = inQueue || []
        const sched = scheduled || []

        if (queue.length === 0 && sched.length === 0) {
            await sendMessage(chatId, '✅ <b>Fila vazia!</b>\nNenhuma captura na fila ou agendada.')
            return
        }

        let text = ''

        // --- Na fila agora ---
        if (queue.length > 0) {
            // Agrupar por PI
            const queuePIs = new Map<string, typeof queue>()
            for (const c of queue) {
                const key = c.pi || 'SEM_PI'
                if (!queuePIs.has(key)) queuePIs.set(key, [])
                queuePIs.get(key)!.push(c)
            }

            text += `🔄 <b>NA FILA AGORA</b> (${queue.length} formatos)\n\n`
            for (const [pi, formats] of queuePIs) {
                const client = formats[0].client
                text += `📌 <b>${esc(client)}</b> — PI: <code>${esc(pi)}</code>\n`
                for (const f of formats) {
                    const icon = f.status === 'PROCESSING' ? '⚙️ Processando' : '🔄 Na fila'
                    text += `   ${icon}: ${esc(getFormatLabel(fmtMap, f.format))} (${f.device})\n`
                }
                text += '\n'
            }
        }

        // --- Agendadas ---
        if (sched.length > 0) {
            const schedPIs = new Map<string, typeof sched>()
            for (const c of sched) {
                const key = c.pi || 'SEM_PI'
                if (!schedPIs.has(key)) schedPIs.set(key, [])
                schedPIs.get(key)!.push(c)
            }

            text += `📅 <b>AGENDADAS</b> (${sched.length} formatos)\n\n`
            for (const [pi, formats] of schedPIs) {
                const client = formats[0].client
                // Pegar horários do primeiro formato (geralmente compartilhado por PI)
                let times = '—'
                try {
                    const parsed = JSON.parse(formats[0].scheduledTimes || '[]') as string[]
                    times = parsed.length > 0 ? parsed.join(', ') : '—'
                } catch { times = '—' }

                text += `📌 <b>${esc(client)}</b> — PI: <code>${esc(pi)}</code>\n`
                text += `   ⏰ Horários: ${times}\n`
                for (const f of formats) {
                    text += `   📐 ${esc(getFormatLabel(fmtMap, f.format))} (${f.device})\n`
                }
                text += '\n'
            }
        }

        await sendMessage(chatId, text.trim())
    } catch (err) {
        await sendMessage(chatId, `❌ Erro na fila: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /quarentena
// ---------------------------------------------------------------------------
async function handleQuarentena(chatId: string) {
    try {
        const { data: quarantined, error } = await supabase
            .from('Campaign')
            .select('id, client, format, updatedAt')
            .eq('status', 'QUARANTINE')
            .eq('isArchived', false)
            .order('updatedAt', { ascending: false })
            .limit(10)

        if (error) throw error
        if (!quarantined || quarantined.length === 0) {
            await sendMessage(chatId, '✅ <b>Sem quarentena!</b>')
            return
        }

        let text = `⚠️ <b>QUARENTENA</b> (${quarantined.length})\n\n`
        for (const c of quarantined) {
            const dt = new Date(c.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            text += `🔴 <b>${esc(c.client)}</b> • ${esc(c.format)}\n`
            text += `   Desde: ${dt}\n`
            text += `   <code>${c.id}</code>\n\n`
        }
        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /storage
// ---------------------------------------------------------------------------
async function handleStorage(chatId: string) {
    try {
        // Query storage objects count via SQL if possible, or just skip if too complex for SDK
        // Since the user has the 'bucket_id' = 'screenshots', we count metadata
        // Note: SDK doesn't have a direct 'SUM' for column, so we use a RPC or just inform fixed values
        
        const text = `
💾 <b>ARMAZENAMENTO</b>

📦 <b>Supabase Storage</b>
Acesse o painel para detalhes de GB.
Frequência de check: a cada 24h.

🗄️ <b>Banco de Dados</b> Para visualizar o real consumo, verifique o painel do Supabase.
        `.trim()
        await sendMessage(chatId, text)
    } catch (err) {
         await sendMessage(chatId, `❌ Erro storage: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /logs
// ---------------------------------------------------------------------------
async function handleLogs(chatId: string) {
    try {
        const { data: logs, error } = await supabase
            .from('NexusLog')
            .select('level, message, createdAt')
            .order('createdAt', { ascending: false })
            .limit(10)

        if (error) throw error
        if (!logs || logs.length === 0) {
            await sendMessage(chatId, '📭 Nenhum log.')
            return
        }

        const icons: Record<string, string> = { INFO: 'ℹ️', SUCCESS: '✅', ERROR: '❌', SYSTEM: '⚙️' }
        let text = `📜 <b>ÚLTIMOS LOGS</b>\n\n`
        for (const log of logs.reverse()) {
            const icon = icons[log.level] || '•'
            const time = new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            text += `${icon} <code>${time}</code> ${esc(log.message.substring(0, 60))}\n`
        }
        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro logs: ${esc(String(err))}`)
    }
}
