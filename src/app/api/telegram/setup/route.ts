import { NextResponse } from 'next/server'

const DEFAULT_APP_URL = 'https://adsnap-cloud.vercel.app'

const BOT_COMMANDS = [
    { command: 'start', description: 'Abrir menu principal' },
    { command: 'status', description: 'Resumo do sistema' },
    { command: 'workers', description: 'Fila e workers de captura' },
    { command: 'fila', description: 'Ver fila de captura' },
    { command: 'gam', description: 'Orders GAM e revisoes' },
    { command: 'capturas', description: 'Disparar capturas' },
    { command: 'books', description: 'Books e prints por PI' },
    { command: 'logs', description: 'Ultimos logs do Nexus' },
    { command: 'alertas', description: 'Alertas e lembretes' },
    { command: 'quarentena', description: 'Falhas e quarentena' },
]

function appUrl() {
    const explicit = (process.env.TELEGRAM_APP_URL || process.env.NEXT_PUBLIC_APP_URL)?.trim()
    if (explicit) return explicit.replace(/\/$/, '')

    return DEFAULT_APP_URL
}

export async function GET() {
    const botToken = process.env.NexusTelegram
    if (!botToken) {
        return NextResponse.json({ error: 'NexusTelegram env not set' }, { status: 500 })
    }

    const baseUrl = appUrl()
    if (!baseUrl) {
        return NextResponse.json({
            error: 'Cannot determine app URL. Set NEXT_PUBLIC_APP_URL env variable.',
            hint: 'Example: NEXT_PUBLIC_APP_URL=https://adsnap-cloud.vercel.app',
        }, { status: 400 })
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.TELEGRAM_SECRET_TOKEN || ''

    try {
        const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query'],
                drop_pending_updates: true,
                ...(secretToken ? { secret_token: secretToken } : {}),
            }),
        })
        const setData = await setRes.json()

        const commandsRes = await fetch(`https://api.telegram.org/bot${botToken}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                commands: BOT_COMMANDS,
            }),
        })
        const commandsData = await commandsRes.json()

        const menuRes = await fetch(`https://api.telegram.org/bot${botToken}/setChatMenuButton`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                menu_button: { type: 'commands' },
            }),
        })
        const menuData = await menuRes.json()

        const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
        const infoData = await infoRes.json()

        const commandInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getMyCommands`)
        const commandInfoData = await commandInfoRes.json()

        return NextResponse.json({
            setup: setData.ok ? 'Webhook registered' : 'Failed',
            webhook_url: webhookUrl,
            secret_token_enabled: Boolean(secretToken),
            commands_registered: Boolean(commandsData.ok),
            menu_button_registered: Boolean(menuData.ok),
            telegram_response: setData,
            commands_response: commandsData,
            menu_button_response: menuData,
            webhook_info: infoData.result,
            commands: commandInfoData.result || [],
        })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
