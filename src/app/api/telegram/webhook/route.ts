import { NextResponse } from 'next/server'
import { handleUpdate } from '@/lib/telegramBot'

/**
 * Telegram Webhook — receives updates from Telegram Bot API
 * POST /api/telegram/webhook
 */
export async function POST(request: Request) {
    try {
        const update = await request.json()
        
        // Process asynchronously — return 200 immediately to avoid Telegram retries
        // (Telegram retries if it doesn't get 200 within ~60s)
        handleUpdate(update).catch(err => {
            console.error('[Telegram Webhook] Handler error:', err)
        })

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[Telegram Webhook] Parse error:', err)
        return NextResponse.json({ ok: true }) // Always 200 to prevent retries
    }
}

// GET — health check / info
export async function GET() {
    return NextResponse.json({
        bot: 'Adsnap Cloud Telegram Bot',
        status: 'active',
        webhook: 'listening',
    })
}
