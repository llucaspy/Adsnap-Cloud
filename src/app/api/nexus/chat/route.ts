import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: Request) {
    try {
        const body = await req.json()
        const { message, sessionId } = body

        if (!message || !sessionId) {
            return NextResponse.json({ error: 'message and sessionId are required' }, { status: 400 })
        }

        // Get authenticated user info
        const { getSession } = await import('@/lib/auth')
        const session = await getSession()
        const callerRole = session?.role || 'guest'
        const callerEmail = session?.email || 'anonymous'

        // Invoke the Edge Function
        const edgeFnUrl = `${SUPABASE_URL}/functions/v1/nexus-chat`
        
        const response = await fetch(edgeFnUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({ 
                message, 
                sessionId, 
                callerRole, 
                callerEmail 
            }),
        })

        const data = await response.json()
        
        return NextResponse.json(data)
    } catch (error) {
        console.error('[Nexus API] Error:', error)
        return NextResponse.json(
            { error: String(error), success: false },
            { status: 500 }
        )
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url)
        const sessionId = searchParams.get('sessionId') || 'default'

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/NexusMessage?sessionId=eq.${sessionId}&order=createdAt.asc&limit=50`,
            {
                headers: {
                    'apikey': SUPABASE_SERVICE_KEY,
                    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                },
            }
        )

        const messages = await response.json()

        return NextResponse.json({ messages, success: true })
    } catch (error) {
        console.error('[Nexus API] Error:', error)
        return NextResponse.json({ error: String(error), success: false }, { status: 500 })
    }
}
