import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

// GET /api/auth/me — Get current user info from session
export async function GET() {
    try {
        const session = await getSession()

        if (!session) {
            return NextResponse.json(
                { authenticated: false },
                { status: 401 }
            )
        }

        return NextResponse.json({
            authenticated: true,
            user: {
                userId: session.userId,
                email: session.email,
                role: session.role,
            }
        })
    } catch (error) {
        console.error('[Auth] Session check error:', error)
        return NextResponse.json(
            { authenticated: false },
            { status: 401 }
        )
    }
}
