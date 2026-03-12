import { NextResponse } from 'next/server'
import { handleUpdate } from '@/lib/telegramBot'

/**
 * Telegram Webhook — receives updates from Telegram Bot API
 * POST /api/telegram/webhook
 * 
 * IMPORTANT: On Vercel serverless, the function dies after returning.
 * We MUST await handleUpdate before returning, otherwise it gets killed.
 */
export async function POST(request: Request) {
    try {
        const update = await request.json()
        
        // MUST await — Vercel kills the function after response
        await handleUpdate(update)

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[Telegram Webhook] Error:', err)
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
