import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
    try {
        const session = await getSession()
        if (!session) {
            return NextResponse.json({ userId: null, role: 'guest', email: 'anonymous' })
        }
        return NextResponse.json(session)
    } catch {
        return NextResponse.json({ userId: null, role: 'guest', email: 'anonymous' })
    }
}
