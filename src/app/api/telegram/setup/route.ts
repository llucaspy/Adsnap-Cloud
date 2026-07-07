import { NextResponse } from 'next/server'

function appUrl() {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (explicit) return explicit.replace(/\/$/, '')

    const vercelUrl = process.env.VERCEL_URL?.trim()
    if (vercelUrl) {
        return (vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`).replace(/\/$/, '')
    }

    return ''
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

        const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
        const infoData = await infoRes.json()

        return NextResponse.json({
            setup: setData.ok ? 'Webhook registered' : 'Failed',
            webhook_url: webhookUrl,
            secret_token_enabled: Boolean(secretToken),
            telegram_response: setData,
            webhook_info: infoData.result,
        })
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 })
    }
}
