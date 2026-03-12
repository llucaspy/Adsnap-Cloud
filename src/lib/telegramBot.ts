import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'

// =============================================================================
// TELEGRAM BOT ENGINE — Centro de Comando Adsnap Cloud
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
        if (!data.ok) {
            console.error('[TelegramBot] Send failed:', data.description)
        }
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
        await nexusLogStore.addLog(`Bot Telegram: Acesso negado (ChatID: ${chatId})`, 'ERROR');
        await sendMessage(chatId, '🚫 <b>Acesso negado.</b>\nSeu Chat ID não está autorizado.');
        return
    }

    try {
        console.log(`[TelegramBot] Recebido: ${text} de ${chatId}`);
        await nexusLogStore.addLog(`Bot Telegram: Comando recebido: ${text}`, 'INFO');

        // Parse command
        const [rawCmd, ...args] = text.split(' ')
        const cmd = rawCmd.toLowerCase().replace('@', '').split('@')[0] // strip bot username

        // Route
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
        await nexusLogStore.addLog(`Bot Telegram: Erro ao processar comando`, 'ERROR', errorMsg);
        await sendMessage(chatId, `❌ Erro interno ao processar comando.`);
    }
}

// ---------------------------------------------------------------------------
// HTML escape helper
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
        const [total, active, queued, processing, success, failed, quarantine] = await Promise.all([
            prisma.campaign.count({ where: { isArchived: false } }),
            prisma.campaign.count({ where: { isArchived: false, status: { notIn: ['EXPIRED', 'FINISHED'] } } }),
            prisma.campaign.count({ where: { status: 'QUEUED' } }),
            prisma.campaign.count({ where: { status: 'PROCESSING' } }),
            prisma.campaign.count({ where: { status: 'SUCCESS', isArchived: false } }),
            prisma.campaign.count({ where: { status: 'FAILED', isArchived: false } }),
            prisma.campaign.count({ where: { status: 'QUARANTINE', isArchived: false } }),
        ])

        // Storage
        let storageStr = 'N/A'
        try {
            const result = await (prisma as any).$queryRawUnsafe(
                `SELECT SUM((metadata->>'size')::bigint) as total_size FROM storage.objects WHERE bucket_id = 'screenshots'`
            ) as any[]
            const bytes = Number(result[0]?.total_size || 0)
            const mb = (bytes / (1024 * 1024)).toFixed(1)
            const pct = ((bytes / (1024 * 1024 * 1024)) * 100).toFixed(1)
            storageStr = `${mb} MB / 1 GB (${pct}%)`
        } catch { }

        // Today captures
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayCaptures = await prisma.capture.count({ where: { createdAt: { gte: today } } })

        const text = `
📊 <b>STATUS DO SISTEMA</b>

📁 <b>Campanhas</b>
├ Total ativas: <b>${active}</b>
├ Sucesso: ✅ ${success}
├ Falhas: ❌ ${failed}
└ Quarentena: ⚠️ ${quarantine}

🔄 <b>Fila</b>
├ Na fila: ${queued}
└ Processando: ${processing}

📸 <b>Capturas hoje:</b> ${todayCaptures}

💾 <b>Storage:</b> ${storageStr}
        `.trim()

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro ao buscar status: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /campanhas
// ---------------------------------------------------------------------------
async function handleCampanhas(chatId: string) {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: { isArchived: false, status: { notIn: ['EXPIRED', 'FINISHED'] } },
            orderBy: { updatedAt: 'desc' },
            take: 15,
            select: { id: true, client: true, format: true, status: true, device: true, lastCaptureAt: true }
        })

        if (campaigns.length === 0) {
            await sendMessage(chatId, '📭 Nenhuma campanha ativa no momento.')
            return
        }

        const statusIcon: Record<string, string> = {
            PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️',
            SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️',
        }

        let text = `📋 <b>CAMPANHAS ATIVAS</b> (${campaigns.length})\n\n`

        for (const c of campaigns) {
            const icon = statusIcon[c.status] || '❓'
            const lastCapture = c.lastCaptureAt
                ? c.lastCaptureAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
                : '—'
            text += `${icon} <b>${esc(c.client)}</b>\n`
            text += `   ${esc(c.format)} • ${c.device} • Última: ${lastCapture}\n`
            text += `   <code>${c.id}</code>\n\n`
        }

        const total = await prisma.campaign.count({ where: { isArchived: false, status: { notIn: ['EXPIRED', 'FINISHED'] } } })
        if (total > 15) {
            text += `\n<i>Mostrando 15 de ${total} campanhas</i>`
        }

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /fila
// ---------------------------------------------------------------------------
async function handleFila(chatId: string) {
    try {
        const queued = await prisma.campaign.findMany({
            where: { status: { in: ['QUEUED', 'PROCESSING'] } },
            select: { id: true, client: true, format: true, status: true },
            orderBy: { updatedAt: 'asc' },
            take: 20,
        })

        if (queued.length === 0) {
            await sendMessage(chatId, '✅ <b>Fila vazia!</b>\nNenhuma captura na fila no momento.')
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
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /quarentena
// ---------------------------------------------------------------------------
async function handleQuarentena(chatId: string) {
    try {
        const quarantined = await prisma.campaign.findMany({
            where: { status: 'QUARANTINE', isArchived: false },
            select: { id: true, client: true, format: true, url: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 10,
        })

        if (quarantined.length === 0) {
            await sendMessage(chatId, '✅ <b>Sem quarentena!</b>\nNenhuma campanha em quarentena.')
            return
        }

        let text = `⚠️ <b>QUARENTENA</b> (${quarantined.length})\n\n`

        for (const c of quarantined) {
            const dt = c.updatedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
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
        // Storage
        const storageResult = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size, COUNT(*) as file_count FROM storage.objects WHERE bucket_id = 'screenshots'`
        ) as any[]
        const storageBytes = Number(storageResult[0]?.total_size || 0)
        const fileCount = Number(storageResult[0]?.file_count || 0)

        // Database
        const dbResult = await (prisma as any).$queryRawUnsafe(
            `SELECT pg_database_size(current_database()) as total_size`
        ) as any[]
        const dbBytes = Number(dbResult[0]?.total_size || 0)

        const storageMB = (storageBytes / (1024 * 1024)).toFixed(1)
        const storagePct = ((storageBytes / (1024 * 1024 * 1024)) * 100).toFixed(1)
        const dbMB = (dbBytes / (1024 * 1024)).toFixed(1)
        const dbPct = ((dbBytes / (500 * 1024 * 1024)) * 100).toFixed(1)

        const bar = (pct: number) => {
            const filled = Math.round(pct / 5)
            return '█'.repeat(filled) + '░'.repeat(20 - filled)
        }

        const text = `
💾 <b>ARMAZENAMENTO</b>

📦 <b>Supabase Storage</b>
${bar(parseFloat(storagePct))} ${storagePct}%
${storageMB} MB / 1 GB • ${fileCount} arquivos

🗄️ <b>Banco de Dados</b>
${bar(parseFloat(dbPct))} ${dbPct}%
${dbMB} MB / 500 MB
        `.trim()

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro ao consultar storage: ${esc(String(err))}`)
    }
}

// ---------------------------------------------------------------------------
// /logs
// ---------------------------------------------------------------------------
async function handleLogs(chatId: string) {
    try {
        const logs = await prisma.nexusLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
        })

        if (logs.length === 0) {
            await sendMessage(chatId, '📭 Nenhum log recente.')
            return
        }

        const icons: Record<string, string> = {
            INFO: 'ℹ️', SUCCESS: '✅', ERROR: '❌', SYSTEM: '⚙️',
        }

        let text = `📜 <b>ÚLTIMOS LOGS</b>\n\n`

        for (const log of logs.reverse()) {
            const icon = icons[log.level] || '•'
            const time = log.createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
            const msg = log.message.length > 60 ? log.message.substring(0, 60) + '...' : log.message
            text += `${icon} <code>${time}</code> ${esc(msg)}\n`
        }

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}
