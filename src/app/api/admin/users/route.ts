import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
import { requireAdmin, hashPassword } from '@/lib/auth'

// GET /api/admin/users — List all users (admin only)
export async function GET() {
    try {
        await requireAdmin()

        let users: any[] = []
        try {
            if ((prisma as any).user) {
                users = await (prisma as any).user.findMany({
                    orderBy: { createdAt: 'desc' },
                })
            } else {
                users = await (prisma as any).$queryRawUnsafe(
                    `SELECT id, email, name, role, isActive, createdAt, updatedAt FROM "User" ORDER BY createdAt DESC`
                )
            }
        } catch (err: any) {
            console.error('[Admin] List users error, trying fallback...', err.message)
            users = await (prisma as any).$queryRawUnsafe(
                `SELECT * FROM User ORDER BY createdAt DESC`
            )
        }

        return NextResponse.json({ users })
    } catch (error) {
        const msg = (error as Error).message
        if (msg.includes('Unauthorized')) {
            return NextResponse.json({ error: msg }, { status: 403 })
        }
        console.error('[Admin] List users error:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

// POST /api/admin/users — Create a new user (admin only)
export async function POST(request: NextRequest) {
    try {
        await requireAdmin()

        const body = await request.json()
        const { name, email, password, role } = body

        // Validate inputs
        if (!name || !email || !password) {
            return NextResponse.json(
                { error: 'Nome, e-mail e senha são obrigatórios' },
                { status: 400 }
            )
        }

        // Validate role
        const validRoles = ['admin', 'user']
        const userRole = validRoles.includes(role) ? role : 'user'

        // Sanitize email
        const sanitizedEmail = String(email).trim().toLowerCase()

        // Check password strength (min 4 chars)
        if (password.length < 4) {
            return NextResponse.json(
                { error: 'Senha deve ter no mínimo 4 caracteres' },
                { status: 400 }
            )
        }

        // Check if email already exists
        let existing = null
        try {
            if ((prisma as any).user) {
                existing = await (prisma as any).user.findUnique({
                    where: { email: sanitizedEmail }
                })
            } else {
                const users = await (prisma as any).$queryRawUnsafe(
                    `SELECT id FROM "User" WHERE email = ? LIMIT 1`,
                    sanitizedEmail
                )
                existing = Array.isArray(users) ? users[0] : null
            }
        } catch (err: any) {
            console.error('[Admin] Existence check error, trying fallback...', err.message)
            const users = await (prisma as any).$queryRawUnsafe(
                `SELECT id FROM User WHERE email = '${sanitizedEmail}' LIMIT 1`
            )
            existing = Array.isArray(users) ? users[0] : null
        }

        if (existing) {
            return NextResponse.json(
                { error: 'Este e-mail já está cadastrado' },
                { status: 409 }
            )
        }

        // Hash password
        const hashedPassword = await hashPassword(password)

        // Create user
        try {
            if ((prisma as any).user) {
                const user = await (prisma as any).user.create({
                    data: {
                        name: String(name).trim(),
                        email: sanitizedEmail,
                        password: hashedPassword,
                        role: userRole,
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        role: true,
                        isActive: true,
                        createdAt: true,
                    }
                })
                return NextResponse.json({ success: true, user }, { status: 201 })
            } else {
                // Fallback para criação manual caso o client esteja travado
                const id = Math.random().toString(36).substring(2, 15)
                await (prisma as any).$executeRawUnsafe(
                    `INSERT INTO "User" (id, name, email, password, role, isActive, createdAt, updatedAt) 
                     VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                    id, String(name).trim(), sanitizedEmail, hashedPassword, userRole
                )
                return NextResponse.json({
                    success: true,
                    user: { id, name, email: sanitizedEmail, role: userRole, isActive: true }
                }, { status: 201 })
            }
        } catch (error: any) {
            console.error('[Admin] Create user error:', error)
            return NextResponse.json({ error: 'Erro ao criar usuário: ' + error.message }, { status: 500 })
        }
    } catch (error) {
        const msg = (error as Error).message
        if (msg.includes('Unauthorized')) {
            return NextResponse.json({ error: msg }, { status: 403 })
        }
        console.error('[Admin] Create user error:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
