import prisma from './prisma'

/**
 * Sends a Telegram alert message.
 * Uses bot token from env (NexusTelegram) and chatId from Settings DB.
 * Fails silently if not configured — never breaks the capture flow.
 */
export async function sendTelegramAlert(
    title: string,
    message: string,
    details?: string,
    campaignId?: string
): Promise<boolean> {
    try {
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
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true,
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
                }),
            })
            const plainData = await plainRes.json()
            if (!plainData.ok) {
                console.error('[Telegram] Falha no envio (plain):', plainData.description)
                return false
            }
        }

        console.log('[Telegram] Alerta enviado com sucesso')
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
