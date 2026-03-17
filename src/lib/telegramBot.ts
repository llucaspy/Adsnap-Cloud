import { supabase } from './supabase'
import { nexusLogStore } from './nexusLogStore'
import prisma from './prisma'

// =============================================================================
// TELEGRAM BOT ENGINE — 100% Interactive Menu (SDK + Inline Keyboards)
// =============================================================================

const BOT_TOKEN = () => process.env.NexusTelegram || ''
const ALLOWED_CHAT_ID = () => process.env.chatidtelegram || ''
const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://adsnap-cloud.vercel.app'

// ---------------------------------------------------------------------------
// Format ID → Label resolver (cached)
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
            for (const f of formats) _formatMapCache[f.id] = f.label
        }
    } catch (e) {
        console.error('[TelegramBot] Erro ao carregar formatos:', e)
    }
    return _formatMapCache || {}
}

function fl(formatMap: Record<string, string>, formatId: string): string {
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

async function editMsg(chatId: string, msgId: number, text: string, markup?: any) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/editMessageText`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                message_id: msgId,
                text,
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                reply_markup: markup,
            }),
        })
        return await res.json()
    } catch (err) {
        console.error('[TelegramBot] Edit error:', err)
        return null
    }
}

async function sendPhoto(chatId: string, photoUrl: string, caption?: string) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/sendPhoto`
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                photo: photoUrl,
                caption: caption || '',
                parse_mode: 'HTML',
            }),
        })
        return await res.json()
    } catch (err) {
        console.error('[TelegramBot] Photo error:', err)
        return null
    }
}

async function ackCallback(callbackQueryId: string, text?: string) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN()}/answerCallbackQuery`
    try { await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }) }) } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isAuthorized(chatId: string | number): boolean {
    const allowed = ALLOWED_CHAT_ID()
    if (!allowed) return false
    return String(chatId) === String(allowed)
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function btn(text: string, data: string) { return { text, callback_data: data } }
function kb(rows: { text: string, callback_data: string }[][]) { return { inline_keyboard: rows } }

// Persistent Menu (Reply Keyboard)
function getPersistentMenu() {
    return {
        keyboard: [
            [{ text: '📊 Status' }, { text: '⚙️ Gerenciar' }],
            [{ text: '📚 Books' }, { text: '🔄 Fila' }],
            [{ text: '📜 Logs' }, { text: 'ℹ️ Ajuda' }]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
    }
}

// =============================================================================
// MAIN ROUTER
// =============================================================================
export async function handleUpdate(update: any) {
    // Callback query (button press)
    if (update?.callback_query) {
        return await handleCallback(update.callback_query)
    }

    // Text message
    const message = update?.message
    if (!message?.text) return

    const chatId = String(message.chat.id)
    const text = message.text.trim()

    if (!isAuthorized(chatId)) {
        await sendMessage(chatId, '🚫 <b>Acesso negado.</b>\nSeu Chat ID não está autorizado.')
        return
    }

    try {
        console.log(`[TelegramBot] Recebido: ${text} de ${chatId}`)

        // Map persistent buttons text to commands
        const cmdText = text.toLowerCase()
        if (text === '📊 Status') return await cbStatus(chatId, 0, true)
        if (text === '⚙️ Gerenciar') return await cbGerenciar(chatId, 0, true)
        if (text === '📚 Books') return await cbBooks(chatId, 0, true)
        if (text === '🔄 Fila') return await cbFila(chatId, 0, true)
        if (text === '📜 Logs') return await cbLogs(chatId, 0, true)
        if (text === 'ℹ️ Ajuda' || cmdText === '/ajuda' || cmdText === '/start') return await showMainMenu(chatId)

        // Default: show main menu (and send persistent buttons)
        return await showMainMenu(chatId)
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[TelegramBot] Erro:`, err)
        await sendMessage(chatId, `❌ Erro: <code>${esc(errorMsg)}</code>`)
    }
}

// =============================================================================
// MAIN MENU — Entry point for everything
// =============================================================================
async function showMainMenu(chatId: string) {
    const text = `
🤖 <b>ADSNAP CLOUD</b>
<i>Centro de Comando</i>

Selecione uma opção no menu abaixo ou use os botões fixos:
    `.trim()

    await sendMessage(chatId, text, {
        reply_markup: {
            ...kb([
                [btn('📊 Status do Sistema', 'menu:status')],
                [btn('📋 Campanhas Ativas', 'menu:campanhas'), btn('🔄 Fila', 'menu:fila')],
                [btn('⚙️ Gerenciar Campanhas', 'menu:gerenciar')],
                [btn('📚 Books / Comprovantes', 'menu:books')],
                [btn('⚠️ Quarentena', 'menu:quarentena'), btn('📜 Logs', 'menu:logs')],
                [btn('💾 Storage', 'menu:storage'), btn('🔔 Alertas', 'menu:alerts')],
            ]),
            ...getPersistentMenu() // Add both for first message
        },
    })
}

// Edit an existing message to show main menu
async function editMainMenu(chatId: string, msgId: number) {
    const text = `
🤖 <b>ADSNAP CLOUD</b>
<i>Centro de Comando</i>

Selecione uma opção:
    `.trim()

    await editMsg(chatId, msgId, text, kb([
        [btn('📊 Status do Sistema', 'menu:status')],
        [btn('📋 Campanhas Ativas', 'menu:campanhas'), btn('🔄 Fila', 'menu:fila')],
        [btn('⚙️ Gerenciar Campanhas', 'menu:gerenciar')],
        [btn('📚 Books / Comprovantes', 'menu:books')],
        [btn('⚠️ Quarentena', 'menu:quarentena'), btn('📜 Logs', 'menu:logs')],
        [btn('💾 Storage', 'menu:storage'), btn('🔔 Alertas', 'menu:alerts')],
    ]))
}

// =============================================================================
// CALLBACK ROUTER
// =============================================================================
async function handleCallback(query: any) {
    const chatId = String(query.message.chat.id)
    const msgId = query.message.message_id
    const data = query.data as string

    if (!isAuthorized(chatId)) {
        await ackCallback(query.id, '🚫 Acesso negado')
        return
    }

    await ackCallback(query.id)

    try {
        console.log(`[TelegramBot] Callback: ${data}`)

        // --- Menu navigation ---
        if (data === 'menu:main') return await editMainMenu(chatId, msgId)
        if (data === 'menu:status') return await cbStatus(chatId, msgId)
        if (data === 'menu:campanhas') return await cbCampanhas(chatId, msgId)
        if (data === 'menu:fila') return await cbFila(chatId, msgId)
        if (data === 'menu:quarentena') return await cbQuarentena(chatId, msgId)
        if (data === 'menu:logs') return await cbLogs(chatId, msgId)
        if (data === 'menu:storage') return await cbStorage(chatId, msgId)
        if (data === 'menu:gerenciar') return await cbGerenciar(chatId, msgId)
        if (data === 'menu:books') return await cbBooks(chatId, msgId)
        if (data === 'menu:alerts') return await cbAlerts(chatId, msgId)
        if (data.startsWith('alerts:toggle:')) return await cbToggleAlerts(chatId, msgId, data.slice(14))

        // --- Gerenciar: PI/Campaign actions ---
        if (data.startsWith('pi:')) return await cbShowPI(chatId, msgId, data.slice(3))
        if (data.startsWith('actions:')) return await cbActions(chatId, msgId, data.slice(8))

        // --- Capture ---
        if (data.startsWith('cap:')) return await cbCapture(chatId, msgId, data.slice(4))
        if (data.startsWith('cap_go:')) return await cbCaptureGo(chatId, msgId, data.slice(7))
        if (data.startsWith('cap_nophoto:')) return await cbCaptureNoPhoto(chatId, msgId, data.slice(12))
        if (data.startsWith('cap_all:')) return await cbCaptureAll(chatId, msgId, data.slice(8))
        if (data.startsWith('cap_all_go:')) return await cbCaptureAllGo(chatId, msgId, data.slice(11))

        // --- Delete ---
        if (data.startsWith('del:')) return await cbDelete(chatId, msgId, data.slice(4))
        if (data.startsWith('del_yes:')) return await cbDeleteYes(chatId, msgId, data.slice(8))
        if (data.startsWith('del_pi:')) return await cbDeletePI(chatId, msgId, data.slice(7))
        if (data.startsWith('del_pi_yes:')) return await cbDeletePIYes(chatId, msgId, data.slice(11))

        // --- Rename ---
        if (data.startsWith('rename:')) return await cbRename(chatId, msgId, data.slice(7))
        if (data.startsWith('rn:')) return await cbRenameSet(chatId, msgId, data.slice(3))
        if (data.startsWith('rn_clr:')) return await cbRenameClear(chatId, msgId, data.slice(7))

        // --- Schedule ---
        if (data.startsWith('sched:')) return await cbShowSchedule(chatId, msgId, data.slice(6))

        // --- Books ---
        if (data.startsWith('book:')) return await cbBookDetail(chatId, msgId, data.slice(5))
        if (data.startsWith('bookphoto:')) return await cbBookPhoto(chatId, msgId, data.slice(10))

        await editMsg(chatId, msgId, '❓ Ação desconhecida.', kb([[btn('◀️ Menu', 'menu:main')]]))
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error(`[TelegramBot] Callback error:`, err)
        await editMsg(chatId, msgId, `❌ Erro: <code>${esc(errorMsg)}</code>`, kb([[btn('◀️ Menu', 'menu:main')]]))
    }
}

// =============================================================================
// 📊 STATUS
// =============================================================================
async function cbStatus(chatId: string, msgId: number, isNewMsg: boolean = false) {
    try {
        const { data: campaigns, error } = await supabase
            .from('Campaign')
            .select('pi, status')
            .eq('isArchived', false)
            .not('status', 'in', '("EXPIRED","FINISHED")')

        if (error) throw error
        const all = campaigns || []

        const piSet = new Set(all.map(c => c.pi))
        const pisSucesso = [...piSet].filter(pi => all.filter(c => c.pi === pi).every(c => c.status === 'SUCCESS')).length
        const pisComErro = new Set(all.filter(c => c.status === 'FAILED' || c.status === 'QUARANTINE').map(c => c.pi)).size
        const successF = all.filter(c => c.status === 'SUCCESS').length
        const failedF = all.filter(c => c.status === 'FAILED').length
        const quarantineF = all.filter(c => c.status === 'QUARANTINE').length
        const queuedF = all.filter(c => c.status === 'QUEUED').length
        const processingF = all.filter(c => c.status === 'PROCESSING').length

        const todayStr = new Date().toISOString().split('T')[0]
        const { count: todayCount } = await supabase.from('Capture').select('*', { count: 'exact', head: true }).gte('createdAt', todayStr)

        const text = `
📊 <b>STATUS DO SISTEMA</b>

📁 <b>Campanhas (PIs)</b>
├ Total PIs: <b>${piSet.size}</b>
├ 100% capturados: ✅ ${pisSucesso}
└ Com erro: ❌ ${pisComErro}

📐 <b>Formatos</b>
├ Total: <b>${all.length}</b>
├ Sucesso: ✅ ${successF}
├ Falhas: ❌ ${failedF}
└ Quarentena: ⚠️ ${quarantineF}

🔄 <b>Fila</b>
├ Na fila: ${queuedF}
└ Processando: ${processingF}

📸 <b>Capturas hoje:</b> ${todayCount || 0}
    `.trim()

        const markup = kb([[btn('🔄 Atualizar', 'menu:status'), btn('◀️ Menu', 'menu:main')]])
        if (isNewMsg) {
            await sendMessage(chatId, text, { reply_markup: markup })
        } else {
            await editMsg(chatId, msgId, text, markup)
        }
    } catch (e) {
        console.error('[TelegramBot] Status error:', e)
        const errTxt = `❌ Erro ao buscar status: ${esc(String(e))}`
        if (isNewMsg) await sendMessage(chatId, errTxt)
        else await editMsg(chatId, msgId, errTxt, kb([[btn('◀️ Menu', 'menu:main')]]))
    }
}

// =============================================================================
// 📋 CAMPANHAS
// =============================================================================
async function cbCampanhas(chatId: string, msgId: number) {
    const fmtMap = await loadFormatMap()
    const { data: campaigns, error } = await supabase
        .from('Campaign')
        .select('id, pi, client, format, status, device, lastCaptureAt')
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')
        .order('client', { ascending: true })

    if (error) throw error
    if (!campaigns || campaigns.length === 0) {
        await editMsg(chatId, msgId, '📭 Nenhuma campanha ativa.', kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    const piGroups = new Map<string, typeof campaigns>()
    for (const c of campaigns) {
        const key = c.pi || 'SEM_PI'
        if (!piGroups.has(key)) piGroups.set(key, [])
        piGroups.get(key)!.push(c)
    }

    const sIcon: Record<string, string> = { PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️', SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️' }

    let text = `📋 <b>CAMPANHAS ATIVAS</b>\n${piGroups.size} PIs • ${campaigns.length} formatos\n\n`

    let idx = 0
    for (const [pi, formats] of piGroups) {
        if (idx >= 10) { text += `\n<i>...e mais ${piGroups.size - 10} PIs</i>`; break }
        const client = formats[0].client
        const allOk = formats.every(f => f.status === 'SUCCESS')
        const hasErr = formats.some(f => f.status === 'FAILED' || f.status === 'QUARANTINE')
        text += `${allOk ? '✅' : hasErr ? '❌' : '🔄'} <b>${esc(client)}</b>\n`
        text += `   PI: <code>${esc(pi)}</code>\n`
        for (const f of formats) {
            const last = f.lastCaptureAt ? new Date(f.lastCaptureAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'
            text += `   ${sIcon[f.status] || '❓'} ${esc(fl(fmtMap, f.format))} (${f.device}) • ${last}\n`
        }
        text += '\n'
        idx++
    }

    await editMsg(chatId, msgId, text, kb([[btn('🔄 Atualizar', 'menu:campanhas'), btn('◀️ Menu', 'menu:main')]]))
}

// =============================================================================
// 🔄 FILA
// =============================================================================
async function cbFila(chatId: string, msgId: number, isNewMsg: boolean = false) {
    try {
        const fmtMap = await loadFormatMap()

        const { data: inQueue } = await supabase.from('Campaign').select('id, pi, client, format, status, device').in('status', ['QUEUED', 'PROCESSING']).order('updatedAt', { ascending: true })
        const { data: scheduled } = await supabase.from('Campaign').select('id, pi, client, format, device, scheduledTimes').eq('isScheduled', true).eq('isArchived', false).not('status', 'in', '("EXPIRED","FINISHED","QUEUED","PROCESSING")')

        const queue = inQueue || []
        const sched = scheduled || []

        const markup = kb([[btn('🔄 Atualizar', 'menu:fila'), btn('◀️ Menu', 'menu:main')]])

        if (queue.length === 0 && sched.length === 0) {
            const emptyText = '✅ <b>Fila vazia!</b>'
            if (isNewMsg) return await sendMessage(chatId, emptyText, { reply_markup: markup })
            return await editMsg(chatId, msgId, emptyText, markup)
        }

        let text = ''
        if (queue.length > 0) {
            const groups = groupByPI(queue)
            text += `🔄 <b>NA FILA</b> (${queue.length} formatos)\n\n`
            for (const [pi, fmts] of groups) {
                text += `📌 <b>${esc(fmts[0].client)}</b> — PI: <code>${esc(pi)}</code>\n`
                for (const f of fmts) text += `   ${f.status === 'PROCESSING' ? '⚙️' : '🔄'} ${esc(fl(fmtMap, f.format))} (${f.device})\n`
                text += '\n'
            }
        }
        if (sched.length > 0) {
            const groups = groupByPI(sched)
            text += `📅 <b>AGENDADAS</b> (${sched.length})\n\n`
            for (const [pi, fmts] of groups) {
                let times = '—'
                try { const p = JSON.parse(fmts[0].scheduledTimes || '[]') as string[]; times = p.length > 0 ? p.join(', ') : '—' } catch { times = '—' }
                text += `📌 <b>${esc(fmts[0].client)}</b> — PI: <code>${esc(pi)}</code>\n   ⏰ ${times}\n`
                for (const f of fmts) text += `   📐 ${esc(fl(fmtMap, f.format))} (${f.device})\n`
                text += '\n'
            }
        }

        if (isNewMsg) {
            await sendMessage(chatId, text.trim(), { reply_markup: markup })
        } else {
            await editMsg(chatId, msgId, text.trim(), markup)
        }
    } catch (e) {
        console.error('[TelegramBot] Fila error:', e)
    }
}

// =============================================================================
// ⚠️ QUARENTENA
// =============================================================================
async function cbQuarentena(chatId: string, msgId: number) {
    const fmtMap = await loadFormatMap()
    const { data: quarantined } = await supabase.from('Campaign').select('id, client, format, updatedAt').eq('status', 'QUARANTINE').eq('isArchived', false).order('updatedAt', { ascending: false }).limit(10)

    if (!quarantined || quarantined.length === 0) {
        await editMsg(chatId, msgId, '✅ <b>Sem quarentena!</b>', kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    let text = `⚠️ <b>QUARENTENA</b> (${quarantined.length})\n\n`
    for (const c of quarantined) {
        const dt = new Date(c.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        text += `🔴 <b>${esc(c.client)}</b> • ${esc(fl(fmtMap, c.format))}\n   Desde: ${dt}\n\n`
    }

    await editMsg(chatId, msgId, text, kb([[btn('◀️ Menu', 'menu:main')]]))
}

// =============================================================================
// 📜 LOGS
// =============================================================================
async function cbLogs(chatId: string, msgId: number, isNewMsg: boolean = false) {
    const { data: logs } = await supabase.from('NexusLog').select('level, message, campaignId, createdAt').order('createdAt', { ascending: false }).limit(10)

    const markup = kb([[btn('🔄 Atualizar', 'menu:logs'), btn('◀️ Menu', 'menu:main')]])

    if (!logs || logs.length === 0) {
        const emptyText = '📭 Nenhum log.'
        if (isNewMsg) return await sendMessage(chatId, emptyText, { reply_markup: markup })
        return await editMsg(chatId, msgId, emptyText, markup)
    }

    const fmtMap = await loadFormatMap()

    // Map Campaign IDs to names
    const campaignIdSet = new Set<string>()
    for (const log of logs) {
        if (log.campaignId) campaignIdSet.add(log.campaignId)
    }

    const campaignNamesMap = new Map<string, string>()
    if (campaignIdSet.size > 0) {
        const { data: camps } = await supabase.from('Campaign').select('id, client, format').in('id', [...campaignIdSet])
        for (const c of (camps || [])) {
            const label = fl(fmtMap, c.format)
            campaignNamesMap.set(c.id, `${c.client} — ${label}`)
        }
    }

    const icons: Record<string, string> = { INFO: 'ℹ️', SUCCESS: '✅', ERROR: '❌', SYSTEM: '⚙️' }
    let text = `📜 <b>ÚLTIMOS LOGS</b>\n\n`
    for (const log of logs.reverse()) {
        const icon = icons[log.level] || '•'
        const time = new Date(log.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        
        let resolvedMsg = log.message

        // 1. Resolve exact campaign ID mentions
        for (const [cid, name] of campaignNamesMap.entries()) {
            resolvedMsg = resolvedMsg.replace(new RegExp(cid, 'g'), name)
        }

        // 2. Resolve format IDs in message
        for (const [id, label] of Object.entries(fmtMap)) {
            resolvedMsg = resolvedMsg.replace(new RegExp(id, 'g'), label)
        }

        text += `${icon} <code>${time}</code> ${esc(resolvedMsg.substring(0, 100))}\n`
    }

    if (isNewMsg) {
        await sendMessage(chatId, text, { reply_markup: markup })
    } else {
        await editMsg(chatId, msgId, text, markup)
    }
}

// =============================================================================
// 💾 STORAGE
// =============================================================================
async function cbStorage(chatId: string, msgId: number) {
    try {
        // 1. Supabase Storage (SQL for accuracy)
        const storageResult = await (prisma as any).$queryRawUnsafe(
            `SELECT SUM((metadata->>'size')::bigint) as total_size 
             FROM storage.objects 
             WHERE bucket_id = 'screenshots'`
        ) as any[]
        const storageBytes = Number(storageResult[0]?.total_size || 0)
        const storageLimit = 1024 * 1024 * 1024 // 1GB
        const storagePerc = (storageBytes / storageLimit) * 100

        // 2. Database Size
        const dbResult = await (prisma as any).$queryRawUnsafe(
            `SELECT pg_database_size(current_database()) as total_size`
        ) as any[]
        const dbBytes = Number(dbResult[0]?.total_size || 0)
        const dbLimit = 500 * 1024 * 1024 // 500MB Free Tier
        const dbPerc = (dbBytes / dbLimit) * 100

        const sMB = (storageBytes / (1024 * 1024)).toFixed(2)
        const dMB = (dbBytes / (1024 * 1024)).toFixed(2)

        // Warnings
        const getStatusIcon = (perc: number) => {
            if (perc >= 80) return '🔴'
            if (perc >= 50) return '⚠️'
            return '✅'
        }

        const text = `
💾 <b>INFRAESTRUTURA & LIMITES</b>

📦 <b>Storage (Prints)</b>
├ Uso: <b>${sMB} MB</b> / 1 GB
├ Status: ${getStatusIcon(storagePerc)} <b>${storagePerc.toFixed(1)}%</b>
└ <i>Bucket: screenshots</i>

🗄️ <b>Banco de Dados (Postgres)</b>
├ Uso: <b>${dMB} MB</b> / 500 MB
└ Status: ${getStatusIcon(dbPerc)} <b>${dbPerc.toFixed(1)}%</b>

${(storagePerc > 50 || dbPerc > 50) ? `⚠️ <b>AVISO:</b> Ocupação acima de 50%! Considere uma limpeza em breve.` : '🟢 Sistema operando dentro dos limites.'}

<i>Valores refletem exatamente o Painel Admin.</i>
        `.trim()

        await editMsg(chatId, msgId, text, kb([[btn('🔄 Atualizar', 'menu:storage'), btn('◀️ Menu', 'menu:main')]]))
    } catch (e) {
        console.error('[TelegramBot] Storage error:', e)
        await editMsg(chatId, msgId, '❌ Erro ao buscar estatísticas de infraestrutura.', kb([[btn('◀️ Menu', 'menu:main')]]))
    }
}

// =============================================================================
// ⚙️ GERENCIAR — Lista PIs com botões
// =============================================================================
async function cbGerenciar(chatId: string, msgId: number, isNewMsg: boolean = false) {
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
    rows.push([btn('◀️ Menu', 'menu:main')])

    const markup = kb(rows)
    const text = '⚙️ <b>GERENCIAR</b>\n\nSelecione um PI:'

    if (piMap.size === 0) {
        const emptyText = '📭 Nenhuma campanha para gerenciar.'
        if (isNewMsg) return await sendMessage(chatId, emptyText, { reply_markup: markup })
        return await editMsg(chatId, msgId, emptyText, markup)
    }

    if (isNewMsg) {
        await sendMessage(chatId, text, { reply_markup: markup })
    } else {
        await editMsg(chatId, msgId, text, markup)
    }
}

// =============================================================================
// Gerenciar: Show PI formats
// =============================================================================
async function cbShowPI(chatId: string, msgId: number, pi: string) {
    const fmtMap = await loadFormatMap()
    const { data: campaigns } = await supabase
        .from('Campaign')
        .select('id, pi, client, campaignName, format, status, device')
        .eq('pi', pi)
        .eq('isArchived', false)
        .not('status', 'in', '("EXPIRED","FINISHED")')

    if (!campaigns || campaigns.length === 0) {
        await editMsg(chatId, msgId, '📭 Nenhum formato.', kb([[btn('◀️ Voltar', 'menu:gerenciar')]]))
        return
    }

    const sIcon: Record<string, string> = { PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️', SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️' }
    const client = campaigns[0].client

    let text = `📁 <b>${esc(client)}</b>\nPI: <code>${esc(pi)}</code>\n\n`
    for (const c of campaigns) {
        const name = c.campaignName ? ` • ${esc(c.campaignName)}` : ''
        text += `${sIcon[c.status] || '❓'} ${esc(fl(fmtMap, c.format))} (${c.device})${name}\n`
    }

    const rows = campaigns.map(c => {
        const label = fl(fmtMap, c.format)
        const short = label.length > 18 ? label.substring(0, 16) + '…' : label
        return [btn(`⚡ ${short}`, `actions:${c.id}`)]
    })

    if (campaigns.length > 1) {
        rows.push([btn(`🚀 Capturar TODOS (${campaigns.length})`, `cap_all:${pi}`)])
    }
    rows.push([btn(`🗑️ Deletar PI Inteira`, `del_pi:${pi}`)])
    rows.push([btn('◀️ Voltar', 'menu:gerenciar')])

    await editMsg(chatId, msgId, text, kb(rows))
}

// =============================================================================
// Gerenciar: Actions for a format
// =============================================================================
async function cbActions(chatId: string, msgId: number, id: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase.from('Campaign').select('id, pi, client, campaignName, format, status, device').eq('id', id).single()

    if (!c) {
        await editMsg(chatId, msgId, '❌ Não encontrado.', kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    const sIcon: Record<string, string> = { PENDING: '⏳', QUEUED: '🔄', PROCESSING: '⚙️', SUCCESS: '✅', FAILED: '❌', QUARANTINE: '⚠️' }
    const label = fl(fmtMap, c.format)
    const name = c.campaignName ? `\n📝 Nome: ${esc(c.campaignName)}` : ''

    const text = `
${sIcon[c.status] || '❓'} <b>${esc(label)}</b> (${c.device})
📁 ${esc(c.client)} — PI: <code>${esc(c.pi)}</code>${name}
Status: ${c.status}

<b>O que deseja fazer?</b>
    `.trim()

    await editMsg(chatId, msgId, text, kb([
        [btn('📸 Capturar', `cap:${c.id}`)],
        [btn('✏️ Editar Nome', `rename:${c.id}`)],
        [btn('⏰ Ver Agendamento', `sched:${c.id}`)],
        [btn('🗑️ Deletar', `del:${c.id}`)],
        [btn(`◀️ Voltar`, `pi:${c.pi}`)],
    ]))
}

// =============================================================================
// 📸 CAPTURE — Single (with photo option)
// =============================================================================
async function cbCapture(chatId: string, msgId: number, id: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase.from('Campaign').select('id, client, format, pi').eq('id', id).single()
    if (!c) return

    const label = fl(fmtMap, c.format)

    await editMsg(chatId, msgId,
        `📸 <b>Captura Manual</b>\n\n${esc(c.client)} — ${esc(label)}\nPI: <code>${esc(c.pi)}</code>\n\n<b>Deseja ver a foto quando a captura terminar?</b>`,
        kb([
            [btn('📸 Sim, ver foto', `cap_go:${c.id}`)],
            [btn('⚡ Capturar sem foto', `cap_nophoto:${c.id}`)],
            [btn('❌ Cancelar', `actions:${c.id}`)],
        ])
    )
}

async function cbCaptureGo(chatId: string, msgId: number, id: string) {
    // Set to QUEUED
    const { error } = await supabase.from('Campaign').update({ status: 'QUEUED' }).eq('id', id)
    if (error) {
        await editMsg(chatId, msgId, `❌ Erro: ${esc(error.message)}`, kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Captura manual disparada para ${id}`, 'SYSTEM'); } catch (e) {}

    await editMsg(chatId, msgId,
        `⏳ <b>Captura em andamento...</b>\n\nA campanha foi enfileirada. Aguardando o Worker processar.\n\n<i>Quando a captura for concluída, a foto será enviada aqui.</i>`,
        kb([[btn('◀️ Menu', 'menu:main')]])
    )

    // Poll for completion and send photo
    await pollAndSendPhoto(chatId, id)
}

async function cbCaptureNoPhoto(chatId: string, msgId: number, id: string) {
    const { error } = await supabase.from('Campaign').update({ status: 'QUEUED' }).eq('id', id)
    if (error) {
        await editMsg(chatId, msgId, `❌ Erro: ${esc(error.message)}`, kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Captura disparada (sem foto) para ${id}`, 'SYSTEM'); } catch (e) {}

    await editMsg(chatId, msgId,
        `✅ <b>Captura disparada!</b>\n\nA campanha foi colocada na fila.\nO Worker irá processá-la no próximo ciclo.`,
        kb([[btn('◀️ Menu', 'menu:main')]])
    )
}

// Poll for capture completion (up to ~2 minutes)
async function pollAndSendPhoto(chatId: string, campaignId: string) {
    const maxAttempts = 24 // 24 * 5s = 120s = 2 min
    const delay = 5000

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, delay))

        const { data: campaign } = await supabase
            .from('Campaign')
            .select('status, client, format')
            .eq('id', campaignId)
            .single()

        if (!campaign) return

        if (campaign.status === 'SUCCESS') {
            // Get the latest capture
            const { data: capture } = await supabase
                .from('Capture')
                .select('screenshotPath, createdAt')
                .eq('campaignId', campaignId)
                .eq('status', 'SUCCESS')
                .order('createdAt', { ascending: false })
                .limit(1)
                .single()

            if (capture?.screenshotPath?.startsWith('http')) {
                const fmtMap = await loadFormatMap()
                const label = fl(fmtMap, campaign.format)
                await sendPhoto(chatId, capture.screenshotPath, `✅ <b>Captura concluída!</b>\n${esc(campaign.client)} — ${esc(label)}`)
            } else {
                await sendMessage(chatId, `✅ <b>Captura concluída!</b>\n${esc(campaign.client)}\n\n<i>Foto indisponível (arquivo local).</i>`)
            }
            return
        }

        if (campaign.status === 'FAILED' || campaign.status === 'QUARANTINE') {
            await sendMessage(chatId, `❌ <b>Captura falhou.</b>\n${esc(campaign.client)}\nStatus: ${campaign.status}`)
            return
        }
        // Still QUEUED or PROCESSING — keep polling
    }

    await sendMessage(chatId, '⏰ <b>Timeout</b>\nA captura ainda está processando. Verifique depois com /status.')
}

// =============================================================================
// 📸 CAPTURE ALL — entire PI
// =============================================================================
async function cbCaptureAll(chatId: string, msgId: number, pi: string) {
    const { data: campaigns } = await supabase.from('Campaign').select('id, client').eq('pi', pi).eq('isArchived', false).not('status', 'in', '("EXPIRED","FINISHED")')
    const count = campaigns?.length || 0
    const client = campaigns?.[0]?.client || pi

    await editMsg(chatId, msgId,
        `🚀 <b>Capturar TODOS?</b>\n\n${esc(client)} — PI: <code>${esc(pi)}</code>\n${count} formatos serão enfileirados.`,
        kb([
            [btn(`✅ Sim, capturar ${count}`, `cap_all_go:${pi}`), btn('❌ Cancelar', `pi:${pi}`)],
        ])
    )
}

async function cbCaptureAllGo(chatId: string, msgId: number, pi: string) {
    const { error } = await supabase.from('Campaign').update({ status: 'QUEUED' }).eq('pi', pi).eq('isArchived', false).not('status', 'in', '("EXPIRED","FINISHED","PROCESSING")')
    if (error) {
        await editMsg(chatId, msgId, `❌ Erro: ${esc(error.message)}`, kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }

    try { await nexusLogStore.addLog(`Bot Telegram: Captura em lote PI ${pi}`, 'SYSTEM'); } catch (e) {}

    await editMsg(chatId, msgId,
        `✅ <b>Captura em lote disparada!</b>\n\nTodos os formatos da PI <code>${esc(pi)}</code> foram enfileirados.`,
        kb([[btn('◀️ Menu', 'menu:main')]])
    )
}

// =============================================================================
// 🗑️ DELETE
// =============================================================================
async function cbDelete(chatId: string, msgId: number, id: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase.from('Campaign').select('id, client, format, pi').eq('id', id).single()
    if (!c) return

    await editMsg(chatId, msgId,
        `🗑️ <b>Confirmar EXCLUSÃO?</b>\n\n⚠️ <b>Ação irreversível!</b>\n\n${esc(c.client)} — ${esc(fl(fmtMap, c.format))}\nPI: <code>${esc(c.pi)}</code>`,
        kb([[btn('🗑️ DELETAR', `del_yes:${c.id}`), btn('❌ Cancelar', `actions:${c.id}`)]])
    )
}

async function cbDeleteYes(chatId: string, msgId: number, id: string) {
    const { data: c } = await supabase.from('Campaign').select('pi').eq('id', id).single()
    await supabase.from('Capture').delete().eq('campaignId', id)
    const { error } = await supabase.from('Campaign').delete().eq('id', id)
    if (error) {
        await editMsg(chatId, msgId, `❌ Erro: ${esc(error.message)}`, kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }
    try { await nexusLogStore.addLog(`Bot Telegram: Campanha deletada: ${id}`, 'SYSTEM'); } catch (e) {}
    await editMsg(chatId, msgId, '✅ <b>Campanha deletada!</b>', kb([[btn('◀️ Menu', 'menu:main')]]))
}

async function cbDeletePI(chatId: string, msgId: number, pi: string) {
    const { data: campaigns } = await supabase.from('Campaign').select('id, client').eq('pi', pi).eq('isArchived', false)
    const count = campaigns?.length || 0
    const client = campaigns?.[0]?.client || pi

    await editMsg(chatId, msgId,
        `🗑️ <b>Deletar PI INTEIRA?</b>\n\n⚠️ <b>Aviso:</b> Isso irá remover todos os <b>${count}</b> formatos e suas capturas.\n\n${esc(client)} — PI: <code>${esc(pi)}</code>\n\n<b>Confirmar exclusão em massa?</b>`,
        kb([
            [btn(`🗑️ SIM, DELETAR TUDO`, `del_pi_yes:${pi}`)],
            [btn('❌ Cancelar', `pi:${pi}`)],
        ])
    )
}

async function cbDeletePIYes(chatId: string, msgId: number, pi: string) {
    const { data: campaigns } = await supabase.from('Campaign').select('id').eq('pi', pi)
    
    if (campaigns && campaigns.length > 0) {
        const ids = campaigns.map(c => c.id)
        // Delete captures first
        await supabase.from('Capture').delete().in('campaignId', ids)
        // Delete campaigns
        await supabase.from('Campaign').delete().in('id', ids)
    }

    try { await nexusLogStore.addLog(`Bot Telegram: PI Deletada em lote: ${pi}`, 'SYSTEM'); } catch (e) {}

    await editMsg(chatId, msgId, `✅ <b>PI <code>${pi}</code> deletada com sucesso!</b>`, kb([[btn('◀️ Menu', 'menu:main')]]))
}

// =============================================================================
// 📅 SCHEDULE
// =============================================================================
async function cbShowSchedule(chatId: string, msgId: number, id: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase.from('Campaign').select('client, format, isScheduled, scheduledTimes, pi').eq('id', id).single()

    if (!c) return

    let times = 'Sem horários agendados.'
    try {
        const parsed = JSON.parse(c.scheduledTimes || '[]') as string[]
        if (parsed.length > 0) {
            times = parsed.join(', ')
        }
    } catch { /* ignore */ }

    const text = `
📅 <b>AGENDAMENTO</b>

🏢 <b>Cliente:</b> ${esc(c.client)}
📐 <b>Formato:</b> ${esc(fl(fmtMap, c.format))}
🔔 <b>Ativo:</b> ${c.isScheduled ? '✅ Sim' : '❌ Não'}

⏰ <b>Horários:</b>
<code>${times}</code>
    `.trim()

    await editMsg(chatId, msgId, text, kb([[btn('◀️ Voltar', `actions:${id}`)]]))
}

// =============================================================================
// ✏️ RENAME
// =============================================================================
async function cbRename(chatId: string, msgId: number, id: string) {
    const fmtMap = await loadFormatMap()
    const { data: c } = await supabase.from('Campaign').select('id, client, campaignName, format, pi').eq('id', id).single()
    if (!c) return

    const label = fl(fmtMap, c.format)
    const current = c.campaignName || '(sem nome)'

    const suggestions = [...new Set([
        `${c.client} - ${label}`,
        `${c.client} - ${c.pi}`,
        label,
        c.client,
        `${c.pi} - ${label}`,
    ])].slice(0, 5)

    const rows = suggestions.map(name => {
        const safe = name.substring(0, 28)
        return [btn(`📝 ${safe}`, `rn:${id}|${safe}`)]
    })
    rows.push([btn('🧹 Limpar Nome', `rn_clr:${id}`)])
    rows.push([btn('◀️ Voltar', `actions:${id}`)])

    await editMsg(chatId, msgId,
        `✏️ <b>Editar Nome</b>\n\n${esc(c.client)} — ${esc(label)}\nAtual: <b>${esc(current)}</b>\n\nSelecione:`,
        kb(rows)
    )
}

async function cbRenameSet(chatId: string, msgId: number, payload: string) {
    const [id, ...parts] = payload.split('|')
    const newName = parts.join('|')
    const { error } = await supabase.from('Campaign').update({ campaignName: newName }).eq('id', id)
    if (error) {
        await editMsg(chatId, msgId, `❌ Erro: ${esc(error.message)}`, kb([[btn('◀️ Menu', 'menu:main')]]))
        return
    }
    try { await nexusLogStore.addLog(`Bot: Nome → "${newName}" (${id})`, 'SYSTEM'); } catch (e) {}
    await editMsg(chatId, msgId, `✅ <b>Nome atualizado!</b>\nNovo: <b>${esc(newName)}</b>`, kb([[btn('◀️ Voltar', `actions:${id}`)], [btn('◀️ Menu', 'menu:main')]]))
}

async function cbRenameClear(chatId: string, msgId: number, id: string) {
    await supabase.from('Campaign').update({ campaignName: '' }).eq('id', id)
    await editMsg(chatId, msgId, '✅ <b>Nome removido!</b>', kb([[btn('◀️ Voltar', `actions:${id}`)], [btn('◀️ Menu', 'menu:main')]]))
}

// =============================================================================
// 📚 BOOKS — Lista PIs com capturas
// =============================================================================
async function cbBooks(chatId: string, msgId: number, isNewMsg: boolean = false) {
    // Get unique PIs that have captures
    const { data: campaigns } = await supabase
        .from('Campaign')
        .select('pi, client')
        .eq('isArchived', false)
        .order('client', { ascending: true })

    const piMap = new Map<string, string>()
    for (const c of (campaigns || [])) {
        if (!piMap.has(c.pi)) piMap.set(c.pi, c.client)
    }

    if (piMap.size === 0) {
        const emptyText = '📭 Nenhum book disponível.'
        const markup = kb([[btn('◀️ Menu', 'menu:main')]])
        if (isNewMsg) return await sendMessage(chatId, emptyText, { reply_markup: markup })
        return await editMsg(chatId, msgId, emptyText, markup)
    }

    // Count captures per PI
    const rows: { text: string, callback_data: string }[][] = []
    const entries = [...piMap.entries()].slice(0, 12)

    for (const [pi, client] of entries) {
        const short = client.length > 15 ? client.substring(0, 13) + '…' : client
        rows.push([btn(`📚 ${short} — ${pi}`, `book:${pi}`)])
    }

    rows.push([btn('🌐 Abrir Books no Browser', 'menu:books_url')])
    rows.push([btn('◀️ Menu', 'menu:main')])

    const markup = kb(rows)
    const text = `📚 <b>BOOKS</b>\n\nSelecione um PI para ver os comprovantes:`

    if (isNewMsg) {
        await sendMessage(chatId, text, { reply_markup: markup })
    } else {
        await editMsg(chatId, msgId, text, markup)
    }
}

// Book: show last captures for a PI
async function cbBookDetail(chatId: string, msgId: number, pi: string) {
    const fmtMap = await loadFormatMap()

    const { data: campaigns } = await supabase
        .from('Campaign')
        .select('id, client, format, device')
        .eq('pi', pi)
        .eq('isArchived', false)

    if (!campaigns || campaigns.length === 0) {
        await editMsg(chatId, msgId, '📭 Nenhuma campanha para este PI.', kb([[btn('◀️ Voltar', 'menu:books')]]))
        return
    }

    const client = campaigns[0].client
    let text = `📚 <b>${esc(client)}</b>\nPI: <code>${esc(pi)}</code>\n\n<b>Últimas capturas:</b>\n\n`

    const rows: { text: string, callback_data: string }[][] = []

    for (const camp of campaigns.slice(0, 8)) {
        const label = fl(fmtMap, camp.format)

        // Get latest capture
        const { data: capture } = await supabase
            .from('Capture')
            .select('id, screenshotPath, createdAt')
            .eq('campaignId', camp.id)
            .eq('status', 'SUCCESS')
            .order('createdAt', { ascending: false })
            .limit(1)
            .single()

        if (capture?.screenshotPath) {
            const time = new Date(capture.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
            text += `✅ ${esc(label)} (${camp.device}) • ${time}\n`

            if (capture.screenshotPath.startsWith('http')) {
                const short = label.length > 18 ? label.substring(0, 16) + '…' : label
                rows.push([btn(`📷 Ver: ${short}`, `bookphoto:${camp.id}`)])
            }
        } else {
            text += `⏳ ${esc(label)} (${camp.device}) • sem captura\n`
        }
    }

    const appUrl = APP_URL()
    rows.push([btn('🌐 Abrir Book Completo', `menu:books`)])
    rows.push([btn('◀️ Voltar', 'menu:books')])

    await editMsg(chatId, msgId, text, kb(rows))

    // Send a separate message with the web link
    await sendMessage(chatId, `🔗 <b>Link direto:</b>\n${appUrl}/books/${encodeURIComponent(pi)}`)
}

// Book: send photo
async function cbBookPhoto(chatId: string, msgId: number, campaignId: string) {
    const fmtMap = await loadFormatMap()

    const { data: campaign } = await supabase.from('Campaign').select('client, format, pi').eq('id', campaignId).single()
    const { data: capture } = await supabase.from('Capture').select('screenshotPath').eq('campaignId', campaignId).eq('status', 'SUCCESS').order('createdAt', { ascending: false }).limit(1).single()

    if (capture?.screenshotPath?.startsWith('http') && campaign) {
        const label = fl(fmtMap, campaign.format)
        await sendPhoto(chatId, capture.screenshotPath, `📷 <b>${esc(campaign.client)}</b>\n${esc(label)} — PI: ${esc(campaign.pi)}`)
    } else {
        await sendMessage(chatId, '❌ Foto indisponível.')
    }
}

// =============================================================================
// ALERT SETTINGS
// =============================================================================
async function cbAlerts(chatId: string, msgId: number) {
    try {
        const settings = await prisma.settings.findUnique({ where: { id: 1 } })
        const enabled = settings?.telegramAlertsEnabled ?? true
        const lastAlert = settings?.telegramLastAlertAt 
            ? new Date(settings.telegramLastAlertAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) 
            : 'Nunca'

        const text = `
🔔 <b>CONFIGURAÇÕES DE ALERTAS</b>

As notificações diárias de performance (Under, Over e Crítico) automatizadas via Worker estão:

Status: ${enabled ? '✅ <b>ATIVADO</b>' : '🔕 <b>SILENCIADO</b>'}
Último alerta enviado: <code>${lastAlert}</code>

<i>Quando silenciado, o Worker não enviará o resumo diário de performance para o Telegram.</i>
        `.trim()

        const markup = kb([
            [btn(enabled ? '🔕 Silenciar Alertas' : '🔔 Ativar Alertas', `alerts:toggle:${enabled ? 'off' : 'on'}`)],
            [btn('◀️ Menu', 'menu:main')]
        ])

        await editMsg(chatId, msgId, text, markup)
    } catch (e) {
        console.error('[TelegramBot] Alertas error:', e)
        await editMsg(chatId, msgId, '❌ Erro ao buscar configurações de alerta.', kb([[btn('◀️ Menu', 'menu:main')]]))
    }
}

async function cbToggleAlerts(chatId: string, msgId: number, state: string) {
    try {
        const enabled = state === 'on'
        await prisma.settings.upsert({
            where: { id: 1 },
            update: { telegramAlertsEnabled: enabled },
            create: { id: 1, telegramAlertsEnabled: enabled }
        })

        await cbAlerts(chatId, msgId)
    } catch (e) {
        console.error('[TelegramBot] Toggle error:', e)
    }
}

// =============================================================================
// Helper: Group campaigns by PI
// =============================================================================
function groupByPI<T extends { pi: string }>(items: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>()
    for (const item of items) {
        const key = item.pi || 'SEM_PI'
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(item)
    }
    return map
}
