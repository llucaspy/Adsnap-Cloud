import { supabase } from './supabase'
import { nexusLogStore } from './nexusLogStore'

// =============================================================================
// TELEGRAM BOT ENGINE — Centro de Comando (SDK Version + Inline Keyboards)
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

function fmtLabel(formatMap: Record<string, string>, formatId: string): string {
    return formatMap[formatId] || formatId
}

// ---------------------------------------------------------------------------
// Telegram API Helpers
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
        return await res.json()
    } catch (err) {
        console.error('[TelegramBot] Send error:', err)
        return null
    }
}

async function editMessage(chatId: string, messageId: number, text: string, reply_markup?: any) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/editMessageText`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: messageId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup,
            }),
        })
        return await res.json()
    } catch (err) {
        console.error('[TelegramBot] Edit error:', err)
        return null
    }
}

async function answerCallback(callbackQueryId: string, text?: string) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/answerCallbackQuery`
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text || '',
            }),
        })
    } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
function isAuthorized(chatId: string | number): boolean {
    const allowed = ALLOWED_CHAT_ID()
    if (!allowed) return false
    return String(chatId) === String(allowed)
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Inline keyboard builder helpers
function btn(text: string, callbackData: string) {
    return { text, callback_data: callbackData }
}
function keyboard(rows: { text: string, callback_data: string }[][]) {
    return { inline_keyboard: rows }
}

// =============================================================================
// MAIN ROUTER — handles both messages and callback queries
// =============================================================================
export async function handleUpdate(update: any) {
    // --- Callback Query (button press) ---
    if (update?.callback_query) {
        return await handleCallbackQuery(update.callback_query)
    }

    // --- Text Message ---
    const message = update?.message
    if (!message?.text) return

    const chatId = String(message.chat.id)
    const text = message.text.trim()

    if (!isAuthorized(chatId)) {
        console.log(`[TelegramBot] Acesso negado para chatId: ${chatId}`)
        try { await nexusLogStore.addLog(`Bot Telegram: Acesso negado (ChatID: ${chatId})`, 'ERROR'); } catch (e) {}
        await sendMessage(chatId, '🚫 <b>Acesso negado.</b>\nSeu Chat ID não está autorizado.')
        return
    }

    try {
        console.log(`[TelegramBot] Recebido: ${text} de ${chatId}`)
        try { await nexusLogStore.addLog(`Bot Telegram: Comando recebido: ${text}`, 'INFO'); } catch (e) {}

        const [rawCmd] = text.split(' ')
        const cmd = rawCmd.toLowerCase().split('@')[0]

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
            case '/gerenciar':
                return await handleGerenciar(chatId)
            default:
                // Check if user is renaming — expecting text after a rename prompt
                // We handle this via callback-only, so just show unknown command
                await sendMessage(chatId, `❓ Comando desconhecido: <code>${esc(cmd)}</code>\n\nDigite /ajuda para ver os comandos disponíveis.`)
        }
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[TelegramBot] Erro ao processar ${text}:`, err)
        await sendMessage(chatId, `❌ Erro: <code>${esc(errorMsg)}</code>`)
    }
}

// =============================================================================
// CALLBACK QUERY HANDLER — all button presses route here
// =============================================================================
async function handleCallbackQuery(query: any) {
    const chatId = String(query.message.chat.id)
    const messageId = query.message.message_id
    const data = query.data as string

    if (!isAuthorized(chatId)) {
        await answerCallback(query.id, '🚫 Acesso negado')
        return
    }

    await answerCallback(query.id)

    try {
        console.log(`[TelegramBot] Callback: ${data} de ${chatId}`)

        // Route by prefix
        if (data === 'menu:main') {
            return await cbMenuMain(chatId, messageId)
        }
        if (data.startsWith('pi:')) {
            return await cbShowPI(chatId, messageId, data.slice(3))
        }
        if (data.startsWith('actions:')) {
            return await cbShowActions(chatId, messageId, data.slice(8))
        }
        if (data.startsWith('cap:')) {
            return await cbCapture(chatId, messageId, data.slice(4))
        }
        if (data.startsWith('cap_confirm:')) {
            return await cbCaptureConfirm(chatId, messageId, data.slice(12))
        }
        if (data.startsWith('cap_all:')) {
            return await cbCaptureAllPI(chatId, messageId, data.slice(8))
        }
        if (data.startsWith('cap_all_confirm:')) {
            return await cbCaptureAllConfirm(chatId, messageId, data.slice(16))
        }
        if (data.startsWith('del:')) {
            return await cbDelete(chatId, messageId, data.slice(4))
        }
        if (data.startsWith('del_confirm:')) {
            return await cbDeleteConfirm(chatId, messageId, data.slice(12))
        }
        if (data.startsWith('rename:')) {
            return await cbRename(chatId, messageId, data.slice(7))
        }
        // Rename options: predefined names
        if (data.startsWith('rn_set:')) {
            return await cbRenameSet(chatId, messageId, data.slice(7))
        }
        if (data.startsWith('rn_clear:')) {
            return await cbRenameClear(chatId, messageId, data.slice(9))
        }

        await editMessage(chatId, messageId, '❓ Ação desconhecida.')
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[TelegramBot] Callback error:`, err)
        await editMessage(chatId, messageId, `❌ Erro: <code>${esc(errorMsg)}</code>`)
    }
}

// =============================================================================
// /gerenciar — Entry point: list PIs with buttons
// =============================================================================
async function handleGerenciar(chatId: string) {
    const { data: campaigns, error } = await supabase
        .from('Campaign')
        .select('pi, client')
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')
        .order('client', { ascending: true })

    if (error) throw error
    if (!campaigns || campaigns.length === 0) {
        await sendMessage(chatId, '📭 Nenhuma campanha ativa para gerenciar.')
        return
    }

    // Unique PIs
    const piMap = new Map<string, string>()
    for (const c of campaigns) {
        if (!piMap.has(c.pi)) piMap.set(c.pi, c.client)
    }

    const rows = [...piMap.entries()].slice(0, 15).map(([pi, client]) =>
        [btn(`📁 ${client} — ${pi}`, `pi:${pi}`)]
    )

    await sendMessage(chatId, '⚙️ <b>GERENCIAR CAMPANHAS</b>\n\nSelecione uma campanha (PI):', {
        reply_markup: keyboard(rows),
    })
}

// =============================================================================
// Callback: Back to main menu
// =============================================================================
async function cbMenuMain(chatId: string, messageId: number) {
    const { data: campaigns } = await supabase
        .from('Campaign')
        .select('pi, client')
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')
        .order('client', { ascending: true })

    const piMap = new Map<string, string>()
    for (const c of (campaigns || [])) {
        if (!piMap.has(c.pi)) piMap.set(c.pi, c.client)
    }

    const rows = [...piMap.entries()].slice(0, 15).map(([pi, client]) =>
        [btn(`📁 ${client} — ${pi}`, `pi:${pi}`)]
    )

    await editMessage(chatId, messageId,
        '⚙️ <b>GERENCIAR CAMPANHAS</b>\n\nSelecione uma campanha (PI):',
        keyboard(rows)
    )
}

// =============================================================================
// Callback: Show formats for a PI with action buttons
// =============================================================================
async function cbShowPI(chatId: string, messageId: number, pi: string) {
    const fmtMap = await loadFormatMap()

    const { data: campaigns, error } = await supabase
        .from('Campaign')
        .select('id, pi, client, campaignName, format, status, device')
        .eq('pi', pi)
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')

    if (error) throw error
    if (!campaigns || campaigns.length === 0) {
        await editMessage(chatId, messageId, '📭 Nenhum formato encontrado para esta PI.',
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    const statusIcon: Record<string, string> = {
        PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️',
        SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️',
    }

    const client = campaigns[0].client
    let text = `📁 <b>${esc(client)}</b>\nPI: <code>${esc(pi)}</code>\n\n`
    text += `<b>Formatos:</b>\n`

    for (const c of campaigns) {
        const icon = statusIcon[c.status] || '❓'
        const label = fmtLabel(fmtMap, c.format)
        const name = c.campaignName ? ` • ${esc(c.campaignName)}` : ''
        text += `${icon} ${esc(label)} (${c.device})${name}\n`
    }

    // Build buttons: one row per format → actions
    const rows: { text: string, callback_data: string }[][] = []

    for (const c of campaigns) {
        const label = fmtLabel(fmtMap, c.format)
        const shortLabel = label.length > 20 ? label.substring(0, 18) + '…' : label
        rows.push([btn(`⚡ ${shortLabel}`, `actions:${c.id}`)])
    }

    // Capture all PI
    if (campaigns.length > 1) {
        rows.push([btn(`🚀 Capturar TODOS (${campaigns.length} formatos)`, `cap_all:${pi}`)])
    }

    rows.push([btn('◀️ Voltar', 'menu:main')])

    await editMessage(chatId, messageId, text, keyboard(rows))
}

// =============================================================================
// Callback: Show actions for a specific campaign format
// =============================================================================
async function cbShowActions(chatId: string, messageId: number, campaignId: string) {
    const fmtMap = await loadFormatMap()

    const { data: c, error } = await supabase
        .from('Campaign')
        .select('id, pi, client, campaignName, format, status, device')
        .eq('id', campaignId)
        .single()

    if (error || !c) {
        await editMessage(chatId, messageId, '❌ Campanha não encontrada.',
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    const statusIcon: Record<string, string> = {
        PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️',
        SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️',
    }

    const label = fmtLabel(fmtMap, c.format)
    const icon = statusIcon[c.status] || '❓'
    const name = c.campaignName ? `\n📝 Nome: ${esc(c.campaignName)}` : ''

    const text = `
${icon} <b>${esc(label)}</b> (${c.device})
📁 ${esc(c.client)} — PI: <code>${esc(c.pi)}</code>${name}
Status: ${c.status}

<b>O que deseja fazer?</b>
    `.trim()

    const rows = [
        [btn('📸 Capturar', `cap:${c.id}`)],
        [btn('✏️ Editar Nome', `rename:${c.id}`)],
        [btn('🗑️ Deletar', `del:${c.id}`)],
        [btn(`◀️ Voltar para PI`, `pi:${c.pi}`)],
    ]

    await editMessage(chatId, messageId, text, keyboard(rows))
}

// =============================================================================
// Capture — single format
// =============================================================================
async function cbCapture(chatId: string, messageId: number, campaignId: string) {
    const { data: c } = await supabase
        .from('Campaign')
        .select('id, client, format, pi')
        .eq('id', campaignId)
        .single()

    if (!c) {
        await editMessage(chatId, messageId, '❌ Campanha não encontrada.')
        return
    }

    const fmtMap = await loadFormatMap()
    const label = fmtLabel(fmtMap, c.format)

    await editMessage(chatId, messageId,
        `📸 <b>Confirmar Captura?</b>\n\n${esc(c.client)} — ${esc(label)}\nPI: <code>${esc(c.pi)}</code>`,
        keyboard([
            [btn('✅ Sim, capturar', `cap_confirm:${c.id}`), btn('❌ Cancelar', `actions:${c.id}`)],
        ])
    )
}

async function cbCaptureConfirm(chatId: string, messageId: number, campaignId: string) {
    // Set status to QUEUED
    const { error } = await supabase
        .from('Campaign')
        .update({ status: 'QUEUED' })
        .eq('id', campaignId)

    if (error) {
        await editMessage(chatId, messageId, `❌ Erro: ${esc(error.message)}`,
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Captura disparada para ${campaignId}`, 'SYSTEM'); } catch (e) {}

    await editMessage(chatId, messageId,
        `✅ <b>Captura disparada!</b>\n\nA campanha foi colocada na fila (QUEUED).\nO próximo ciclo do Worker irá processá-la.`,
        keyboard([[btn('◀️ Menu Principal', 'menu:main')]])
    )
}

// =============================================================================
// Capture ALL — entire PI
// =============================================================================
async function cbCaptureAllPI(chatId: string, messageId: number, pi: string) {
    const { data: campaigns } = await supabase
        .from('Campaign')
        .select('id, client')
        .eq('pi', pi)
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')

    const count = campaigns?.length || 0
    const client = campaigns?.[0]?.client || pi

    await editMessage(chatId, messageId,
        `🚀 <b>Capturar TODOS os formatos?</b>\n\n${esc(client)} — PI: <code>${esc(pi)}</code>\n${count} formatos serão enfileirados.`,
        keyboard([
            [btn(`✅ Sim, capturar ${count}`, `cap_all_confirm:${pi}`), btn('❌ Cancelar', `pi:${pi}`)],
        ])
    )
}

async function cbCaptureAllConfirm(chatId: string, messageId: number, pi: string) {
    const { error } = await supabase
        .from('Campaign')
        .update({ status: 'QUEUED' })
        .eq('pi', pi)
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED","PROCESSING")')

    if (error) {
        await editMessage(chatId, messageId, `❌ Erro: ${esc(error.message)}`,
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Captura em lote disparada para PI ${pi}`, 'SYSTEM'); } catch (e) {}

    await editMessage(chatId, messageId,
        `✅ <b>Captura em lote disparada!</b>\n\nTodos os formatos da PI <code>${esc(pi)}</code> foram enfileirados.`,
        keyboard([[btn('◀️ Menu Principal', 'menu:main')]])
    )
}

// =============================================================================
// Delete — with confirmation
// =============================================================================
async function cbDelete(chatId: string, messageId: number, campaignId: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase
        .from('Campaign')
        .select('id, client, format, pi')
        .eq('id', campaignId)
        .single()

    if (!c) {
        await editMessage(chatId, messageId, '❌ Campanha não encontrada.')
        return
    }

    const label = fmtLabel(fmtMap, c.format)

    await editMessage(chatId, messageId,
        `🗑️ <b>Confirmar EXCLUSÃO?</b>\n\n⚠️ <b>Esta ação não pode ser desfeita!</b>\n\n${esc(c.client)} — ${esc(label)}\nPI: <code>${esc(c.pi)}</code>\n\nTodas as capturas serão removidas.`,
        keyboard([
            [btn('🗑️ Sim, DELETAR', `del_confirm:${c.id}`), btn('❌ Cancelar', `actions:${c.id}`)],
        ])
    )
}

async function cbDeleteConfirm(chatId: string, messageId: number, campaignId: string) {
    // First delete captures, then campaign
    await supabase.from('Capture').delete().eq('campaignId', campaignId)
    const { error } = await supabase.from('Campaign').delete().eq('id', campaignId)

    if (error) {
        await editMessage(chatId, messageId, `❌ Erro ao deletar: ${esc(error.message)}`,
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Campanha deletada: ${campaignId}`, 'SYSTEM'); } catch (e) {}

    await editMessage(chatId, messageId,
        `✅ <b>Campanha deletada com sucesso!</b>`,
        keyboard([[btn('◀️ Menu Principal', 'menu:main')]])
    )
}

// =============================================================================
// Rename — via button options (no typing needed)
// =============================================================================
async function cbRename(chatId: string, messageId: number, campaignId: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase
        .from('Campaign')
        .select('id, client, campaignName, format, pi')
        .eq('id', campaignId)
        .single()

    if (!c) {
        await editMessage(chatId, messageId, '❌ Campanha não encontrada.')
        return
    }

    const label = fmtLabel(fmtMap, c.format)
    const currentName = c.campaignName || '(sem nome)'

    // Suggest names based on existing data
    const suggestedNames = [
        `${c.client} - ${label}`,
        `${c.client} - ${c.pi}`,
        label,
        c.client,
        `${c.pi} - ${label}`,
    ]

    // Remove duplicates and limit
    const uniqueNames = [...new Set(suggestedNames)].slice(0, 5)

    const rows = uniqueNames.map(name => {
        // Callback data has 64 byte limit — use short format
        const safeName = name.substring(0, 30)
        return [btn(`📝 ${safeName}`, `rn_set:${campaignId}|${safeName}`)]
    })

    rows.push([btn('🧹 Limpar Nome', `rn_clear:${campaignId}`)])
    rows.push([btn('◀️ Voltar', `actions:${campaignId}`)])

    await editMessage(chatId, messageId,
        `✏️ <b>Editar Nome</b>\n\n${esc(c.client)} — ${esc(label)}\nNome atual: <b>${esc(currentName)}</b>\n\nSelecione um novo nome:`,
        keyboard(rows)
    )
}

async function cbRenameSet(chatId: string, messageId: number, payload: string) {
    const [campaignId, ...nameParts] = payload.split('|')
    const newName = nameParts.join('|') // In case name has | char

    const { error } = await supabase
        .from('Campaign')
        .update({ campaignName: newName })
        .eq('id', campaignId)

    if (error) {
        await editMessage(chatId, messageId, `❌ Erro: ${esc(error.message)}`,
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Nome atualizado para "${newName}" (${campaignId})`, 'SYSTEM'); } catch (e) {}

    await editMessage(chatId, messageId,
        `✅ <b>Nome atualizado!</b>\n\nNovo nome: <b>${esc(newName)}</b>`,
        keyboard([[btn('◀️ Voltar', `actions:${campaignId}`)], [btn('◀️ Menu Principal', 'menu:main')]])
    )
}

async function cbRenameClear(chatId: string, messageId: number, campaignId: string) {
    const { error } = await supabase
        .from('Campaign')
        .update({ campaignName: '' })
        .eq('id', campaignId)

    if (error) {
        await editMessage(chatId, messageId, `❌ Erro: ${esc(error.message)}`,
            keyboard([[btn('◀️ Voltar', 'menu:main')]])
        )
        return
    }

    await editMessage(chatId, messageId,
        `✅ <b>Nome removido!</b>`,
        keyboard([[btn('◀️ Voltar', `actions:${campaignId}`)], [btn('◀️ Menu Principal', 'menu:main')]])
    )
}

// =============================================================================
// /ajuda
// =============================================================================
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

⚙️ <b>Gerenciamento</b>
/gerenciar — Menu de ações (botões)

ℹ️ <b>Outros</b>
/ajuda — Esta mensagem
    `.trim()
    await sendMessage(chatId, text)
}

// =============================================================================
// /status — Agrupa por PI
// =============================================================================
async function handleStatus(chatId: string) {
    try {
        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('pi, status, format, lastCaptureAt')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')

        if (error) throw error
        const all = campaigns || []

        const piSet = new Set(all.map(c => c.pi))
        const totalPIs = piSet.size

        const successFormats = all.filter(c => c.status === 'SUCCESS').length
        const failedFormats = all.filter(c => c.status === 'FAILED').length
        const quarantineFormats = all.filter(c => c.status === 'QUARANTINE').length
        const queuedFormats = all.filter(c => c.status === 'QUEUED').length
        const processingFormats = all.filter(c => c.status === 'PROCESSING').length

        const pisComErro = new Set(all.filter(c => c.status === 'FAILED' || c.status === 'QUARANTINE').map(c => c.pi)).size
        const pisSucesso = [...piSet].filter(pi => {
            const formats = all.filter(c => c.pi === pi)
            return formats.every(c => c.status === 'SUCCESS')
        }).length

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

// =============================================================================
// /campanhas — Agrupa por PI
// =============================================================================
async function handleCampanhas(chatId: string) {
    try {
        const fmtMap = await loadFormatMap()

        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('id, pi, client, campaignName, format, status, device, lastCaptureAt')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')
            .order('client', { ascending: true })

        if (error) throw error
        if (!campaigns || campaigns.length === 0) {
            await sendMessage(chatId, '📭 Nenhuma campanha ativa.')
            return
        }

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
                text += `   ${fIcon} ${esc(fmtLabel(fmtMap, f.format))} (${f.device}) • ${last}\n`
            }
            text += '\n'
            piIdx++
        }

        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro ao listar: ${esc(String(err))}`)
    }
}

// =============================================================================
// /fila
// =============================================================================
async function handleFila(chatId: string) {
    try {
        const fmtMap = await loadFormatMap()

        const { data: inQueue, error: qErr } = await supabase
            .from('Campaign')
            .select('id, pi, client, format, status, device')
            .in('status', ['QUEUED', 'PROCESSING'])
            .order('updatedAt', { ascending: true })

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

        if (queue.length > 0) {
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
                    text += `   ${icon}: ${esc(fmtLabel(fmtMap, f.format))} (${f.device})\n`
                }
                text += '\n'
            }
        }

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
                let times = '—'
                try {
                    const parsed = JSON.parse(formats[0].scheduledTimes || '[]') as string[]
                    times = parsed.length > 0 ? parsed.join(', ') : '—'
                } catch { times = '—' }

                text += `📌 <b>${esc(client)}</b> — PI: <code>${esc(pi)}</code>\n`
                text += `   ⏰ Horários: ${times}\n`
                for (const f of formats) {
                    text += `   📐 ${esc(fmtLabel(fmtMap, f.format))} (${f.device})\n`
                }
                text += '\n'
            }
        }

        await sendMessage(chatId, text.trim())
    } catch (err) {
        await sendMessage(chatId, `❌ Erro na fila: ${esc(String(err))}`)
    }
}

// =============================================================================
// /quarentena
// =============================================================================
async function handleQuarentena(chatId: string) {
    try {
        const fmtMap = await loadFormatMap()
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
            text += `🔴 <b>${esc(c.client)}</b> • ${esc(fmtLabel(fmtMap, c.format))}\n`
            text += `   Desde: ${dt}\n`
            text += `   <code>${c.id}</code>\n\n`
        }
        await sendMessage(chatId, text)
    } catch (err) {
        await sendMessage(chatId, `❌ Erro: ${esc(String(err))}`)
    }
}

// =============================================================================
// /storage
// =============================================================================
async function handleStorage(chatId: string) {
    try {
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

// =============================================================================
// /logs
// =============================================================================
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
