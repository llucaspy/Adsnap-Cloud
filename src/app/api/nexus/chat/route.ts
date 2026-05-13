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

        const { processNexusCommand } = await import('@/app/aiActions')
        const prisma = (await import('@/lib/prisma')).default

        // 1. Salvar mensagem do usuário
        await prisma.nexusMessage.create({
            data: {
                role: 'user',
                content: message,
                sessionId: sessionId,
                metadata: {}
            }
        })

        // 2. Processar comando via Cérebro Unificado (aiActions)
        const result = await processNexusCommand(message)

        // 3. Salvar resposta da IA
        await prisma.nexusMessage.create({
            data: {
                role: 'assistant',
                content: result.message,
                sessionId: sessionId,
                metadata: {
                    actionPerformed: result.actionPerformed,
                    success: result.success
                }
            }
        })

        return NextResponse.json(result)
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
