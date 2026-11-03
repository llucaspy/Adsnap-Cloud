import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { mayManageNexusAccount } from '@/lib/nexusPolicy'

export const dynamic = 'force-dynamic'
const publicUser = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true } as const

export async function GET() {
    try {
        const session = await requireAdmin()
        if (!await mayManageNexusAccount(prisma, session.userId)) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })
        return NextResponse.json({ users: await prisma.user.findMany({ select: publicUser, orderBy: { createdAt: 'desc' } }) })
    } catch { return NextResponse.json({ error: 'Não foi possível consultar os usuários.' }, { status: 403 }) }
}

export async function POST(request: NextRequest) {
    try {
        const session = await requireAdmin()
        if (!await mayManageNexusAccount(prisma, session.userId)) return NextResponse.json({ error: 'Acesso não autorizado.' }, { status: 403 })
        const { name, email, password, role } = await request.json()
        if (typeof name !== 'string' || !name.trim() || name.length > 200 || typeof email !== 'string' || !email.trim() || email.length > 254 || typeof password !== 'string' || password.length < 4 || password.length > 1000) return NextResponse.json({ error: 'Informe nome, login e senha válida.' }, { status: 400 })
        const login = email.trim().toLowerCase()
        if (await prisma.user.findUnique({ where: { email: login }, select: { id: true } })) return NextResponse.json({ error: 'Este login já está cadastrado.' }, { status: 409 })
        const user = await prisma.user.create({ data: { name: name.trim(), email: login, password: await hashPassword(password), role: role === 'admin' ? 'admin' : 'user' }, select: publicUser })
        return NextResponse.json({ success: true, user }, { status: 201 })
    } catch { return NextResponse.json({ error: 'Não foi possível criar o usuário.' }, { status: 400 }) }
}
