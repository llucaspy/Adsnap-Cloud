import prisma from './prisma'
import { createHash } from 'crypto'

const DEFAULT_ALERT_DEDUPE_MINUTES = 24 * 60

function readAlertDedupeMinutes() {
    const parsed = Number.parseInt(process.env.TELEGRAM_ALERT_DEDUPE_MINUTES || '', 10)
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_ALERT_DEDUPE_MINUTES
    return parsed
}

function buildAlertDedupeKey(title: string, message: string, campaignId?: string) {
    return createHash('sha256')
        .update(JSON.stringify({
            title: title.trim(),
            message: message.trim(),
            campaignId: campaignId || 'global',
        }))
        .digest('hex')
        .slice(0, 32)
}

async function shouldSuppressDuplicateAlert(key: string, dedupeMinutes: number) {
    if (dedupeMinutes <= 0) return false
    const since = new Date(Date.now() - dedupeMinutes * 60 * 1000)
    const existing = await prisma.nexusLog.findFirst({
        where: {
            level: 'SYSTEM',
            message: 'Telegram: alerta enviado',
            details: { contains: key },
            createdAt: { gte: since },
        },
        select: { id: true },
    })
    return Boolean(existing)
}

async function recordSentAlert(key: string, title: string, campaignId?: string) {
    await prisma.nexusLog.create({
        data: {
            level: 'SYSTEM',
            message: 'Telegram: alerta enviado',
            details: JSON.stringify({ key, title, campaignId: campaignId || null }),
            campaignId,
        },
    }).catch(() => null)
}

/**
 * Sends a Telegram alert message.
 * Uses bot token from env (NexusTelegram) and chatId from Settings DB.
 * Fails silently if not configured — never breaks the capture flow.
 */
export async function sendTelegramAlert(
    title: string,
    message: string,
    details?: string,
    campaignId?: string,
    action?: { label: string; url: string },
    options?: { dedupeMinutes?: number; dedupeKey?: string }
): Promise<boolean> {
    try {
        const dedupeMinutes = options?.dedupeMinutes ?? readAlertDedupeMinutes()
        const dedupeKey = options?.dedupeKey || buildAlertDedupeKey(title, message, campaignId)
        if (await shouldSuppressDuplicateAlert(dedupeKey, dedupeMinutes)) {
            console.log(`[Telegram] Alerta duplicado suprimido por ${dedupeMinutes}min: ${title} (${campaignId || 'global'})`)
            return true
        }

        // 1. Get token from env, chatId from env or DB
        const botToken = process.env.NexusTelegram
        if (!botToken) {
            console.log('[Telegram] Bot token não configurado (env NexusTelegram)')
            return false
        }

        // ChatId: env first, then DB fallback
        let chatId = process.env.chatidtelegram
        if (!chatId) {
            const { supabase } = await import('./supabase')
            const { data: settings } = await supabase
                .from('Settings')
                .select('telegramChatId')
                .eq('id', 1)
                .single()
            
            chatId = settings?.telegramChatId || undefined
        }
        if (!chatId) {
            console.log('[Telegram] Chat ID não configurado (env chatidtelegram ou Settings)')
            return false
        }

        // 2. Format message
        const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        let text = `🚨 *ADSNAP ALERT*\n\n`
        text += `📌 *${escapeMarkdown(title)}*\n`
        text += `${escapeMarkdown(message)}\n`
        if (details) text += `\n📋 _${escapeMarkdown(details)}_\n`
        if (campaignId) text += `\n🆔 Campaign: \`${campaignId}\``
        text += `\n\n🕐 ${escapeMarkdown(now)}`

        // 3. Send via Telegram Bot API
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`
        const replyMarkup = action && /^https?:\/\//i.test(action.url)
            ? { inline_keyboard: [[{ text: action.label, url: action.url }]] }
            : undefined
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true,
                reply_markup: replyMarkup,
            }),
        })

        const data = await res.json()

        if (!data.ok) {
            console.error('[Telegram] Falha no envio:', data.description)
            // Retry with plain text if markdown fails
            const plainRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: `🚨 ADSNAP ALERT\n\n${title}\n${message}${details ? '\n' + details : ''}${campaignId ? '\nCampaign: ' + campaignId : ''}\n\n${now}`,
                    reply_markup: replyMarkup,
                }),
            })
            const plainData = await plainRes.json()
            if (!plainData.ok) {
                console.error('[Telegram] Falha no envio (plain):', plainData.description)
                return false
            }
        }

        console.log('[Telegram] Alerta enviado com sucesso')
        await recordSentAlert(dedupeKey, title, campaignId)
        return true
    } catch (err) {
        console.error('[Telegram] Erro ao enviar alerta:', err)
        return false
    }
}

/** Escape special chars for MarkdownV2 */
function escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}
