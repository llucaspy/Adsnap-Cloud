import { supabase } from './supabase'
import { nexusLogStore } from './nexusLogStore'

// =============================================================================
// TELEGRAM BOT ENGINE — Centro de Comando (SDK Version)
// =============================================================================

const BOT_TOKEN = () => process.env.NexusTelegram || ''
const ALLOWED_CHAT_ID = () => process.env.chatidtelegram || ''

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
// /status
// ---------------------------------------------------------------------------
async function handleStatus(chatId: string) {
    try {
        // Fetch all counts using Supabase SDK (more resilient than Prisma pool)
        const [
            { count: activeCount },
            { count: queuedCount },
            { count: processingCount },
            { count: successCount },
            { count: failedCount },
            { count: quarantineCount }
        ] = await Promise.all([
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('isArchived', false).not('status', 'in', '("EXPIRED","FINISHED")'),
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'QUEUED'),
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'PROCESSING'),
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'SUCCESS').eq('isArchived', false),
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'FAILED').eq('isArchived', false),
            supabase.from('Campaign').select('*', { count: 'exact', head: true }).eq('status', 'QUARANTINE').eq('isArchived', false),
        ])

        // Today captures
        const todayStr = new Date().toISOString().split('T')[0]
        const { count: todayCount } = await supabase
            .from('Capture')
            .select('*', { count: 'exact', head: true })
            .gte('createdAt', todayStr)

        const text = `
📊 <b>STATUS DO SISTEMA</b>

📁 <b>Campanhas</b>
├ Total ativas: <b>${activeCount || 0}</b>
├ Sucesso: ✅ ${successCount || 0}
├ Falhas: ❌ ${failedCount || 0}
└ Quarentena: ⚠️ ${quarantineCount || 0}

🔄 <b>Fila</b>
├ Na fila: ${queuedCount || 0}
└ Processando: ${processingCount || 0}

📸 <b>Capturas hoje:</b> ${todayCount || 0}
        `.trim()

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro no SDK: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /campanhas
// ---------------------------------------------------------------------------
async function handleCampanhas(chatId: string) {
    try {
        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('id, client, format, status, device, lastCaptureAt')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')
            .order('updatedAt', { ascending: false })
            .limit(15)

        if (error) throw error
        if (!campaigns || campaigns.length === 0) {
            await sendMessage(chatId, '📭 Nenhuma campanha ativa.')
            return
        }

        const statusIcon: Record<string, string> = {
            PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️',
            SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️',
        }

        let text = `📋 <b>CAMPANHAS ATIVAS</b> (${campaigns.length})\n\n`
        for (const c of campaigns) {
            const icon = statusIcon[c.status] || '❓'
            const last = c.lastCaptureAt ? new Date(c.lastCaptureAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'
            text += `${icon} <b>${esc(c.client)}</b>\n`
            text += `   ${esc(c.format)} • ${c.device} • Última: ${last}\n`
            text += `   <code>${c.id}</code>\n\n`
        }

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro ao listar: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /fila
// ---------------------------------------------------------------------------
async function handleFila(chatId: string) {
    try {
        const { data: queued, error } = await supabase
            .from('Campaign')
            .select('id, client, format, status')
            .in('status', ['QUEUED', 'PROCESSING'])
            .order('updatedAt', { ascending: true })
            .limit(20)

        if (error) throw error
        if (!queued || queued.length === 0) {
            await sendMessage(chatId, '✅ <b>Fila vazia!</b>')
            return
        }

        let text = `🔄 <b>FILA DE CAPTURAS</b> (${queued.length})\n\n`
        for (const c of queued) {
            const icon = c.status === 'PROCESSING' ? '⚙️' : '🔄'
            text += `${icon} <b>${esc(c.client)}</b> • ${esc(c.format)}\n`
            text += `   <code>${c.id}</code>\n\n`
        }
        await sendMessage(chatId, text)
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
