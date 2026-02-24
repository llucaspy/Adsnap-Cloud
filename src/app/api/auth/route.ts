import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
import { verifyPassword, createSession, destroySession } from '@/lib/auth'

// POST /api/auth — Login
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { email, password } = body

        // Input validation
        if (!email || !password) {
            return NextResponse.json(
                { error: 'E-mail e senha são obrigatórios' },
                { status: 400 }
            )
        }

        // Sanitize email (trim, lowercase)
        const sanitizedEmail = String(email).trim().toLowerCase()
        console.log('[Auth API] Attempting login for:', sanitizedEmail)

        // Find user by email
        let user = await prisma.user.findUnique({
            where: { email: sanitizedEmail }
        })

        if (!user) {
            console.warn('[Auth API] User not found:', sanitizedEmail)
            return NextResponse.json(
                { error: 'Credenciais inválidas' },
                { status: 401 }
            )
        }

        console.log('[Auth API] User found, verifying password...')

        // Verify password
        try {
            const isValid = await verifyPassword(password, user.password)
            console.log('[Auth API] Password verification result:', isValid)

            if (!isValid) {
                return NextResponse.json(
                    { error: 'Credenciais inválidas' },
                    { status: 401 }
                )
            }
        } catch (err: any) {
            console.error('[Auth API] Password check error:', err)
            return NextResponse.json({ error: 'Erro ao verificar senha: ' + err.message }, { status: 500 })
        }

        // Create session (sets HttpOnly cookie)
        try {
            console.log('[Auth API] Creating session for user:', user.id)
            await createSession(user.id, user.role, user.email)
        } catch (err: any) {
            console.error('[Auth API] Session creation error:', err)
            return NextResponse.json({ error: 'Erro ao criar sessão: ' + err.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            }
        })
    } catch (error: any) {
        console.error('[Auth API] General error:', error)
        return NextResponse.json(
            { error: 'Erro interno do servidor: ' + (error.message || 'Erro desconhecido') },
            { status: 500 }
        )
    }
}

// DELETE /api/auth — Logout
export async function DELETE() {
    try {
        await destroySession()
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Auth] Logout error:', error)
        return NextResponse.json(
            { error: 'Erro ao encerrar sessão' },
            { status: 500 }
        )
    }
}
