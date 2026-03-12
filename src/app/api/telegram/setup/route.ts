import { NextResponse } from 'next/server'

/**
 * GET /api/telegram/setup — Registers the Telegram webhook
 * Call this once after deploy: https://your-domain.vercel.app/api/telegram/setup
 */
export async function GET() {
    const botToken = process.env.NexusTelegram
    if (!botToken) {
        return NextResponse.json({ error: 'NexusTelegram env not set' }, { status: 500 })
    }

    // Determine the base URL
    const vercelUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_SUPABASE_URL
            ? null // We'll need the user to provide it
            : null

    // For local dev, use NEXT_PUBLIC_APP_URL or construct from headers
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || vercelUrl

    if (!baseUrl) {
        return NextResponse.json({ 
            error: 'Cannot determine app URL. Set NEXT_PUBLIC_APP_URL env variable.',
            hint: 'Example: NEXT_PUBLIC_APP_URL=https://adsnap-cloud.vercel.app'
        }, { status: 400 })
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`

    try {
        // Set webhook
        const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query'],
                drop_pending_updates: true,
            }),
        })
        const setData = await setRes.json()

        // Get webhook info
        const infoRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
        const infoData = await infoRes.json()

        return NextResponse.json({
            setup: setData.ok ? '✅ Webhook registered!' : '❌ Failed',
            webhook_url: webhookUrl,
            telegram_response: setData,
            webhook_info: infoData.result,
        })
    } catch (err) {
        return NextResponse.json({ error: String(err) }, { status: 500 })
    }
}
