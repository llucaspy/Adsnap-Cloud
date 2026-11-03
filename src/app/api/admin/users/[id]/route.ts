import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, hashPassword } from '@/lib/auth'
import { mayManageNexusAccount } from '@/lib/nexusPolicy'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
    try {
        const session = await requireAdmin(), { id } = await params
        if (!await mayManageNexusAccount(prisma, session.userId, id)) return NextResponse.json({ error: 'A conta principal só pode ser alterada pelo próprio titular.' }, { status: 403 })
        const { name, email, role, isActive, password } = await request.json()
        const data: Prisma.UserUpdateInput = {}
        if (name !== undefined) { if (typeof name !== 'string' || !name.trim() || name.length > 200) throw new Error('name'); data.name = name.trim() }
        if (email !== undefined) { if (typeof email !== 'string' || !email.trim() || email.length > 254) throw new Error('email'); data.email = email.trim().toLowerCase() }
        if (role !== undefined) { if (!['admin', 'user'].includes(role)) throw new Error('role'); data.role = role }
        if (isActive !== undefined) { if (typeof isActive !== 'boolean') throw new Error('active'); data.isActive = isActive }
        if (password !== undefined && password !== '') { if (typeof password !== 'string' || password.length < 4 || password.length > 1000) throw new Error('password'); data.password = await hashPassword(password) }
        const user = await prisma.user.update({ where: { id }, data, select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true } })
        return NextResponse.json({ success: true, user })
    } catch { return NextResponse.json({ error: 'Não foi possível atualizar o usuário.' }, { status: 400 }) }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
    try {
        const session = await requireAdmin(), { id } = await params
        if (!await mayManageNexusAccount(prisma, session.userId, id)) return NextResponse.json({ error: 'A conta principal é protegida.' }, { status: 403 })
        if (session.userId === id) return NextResponse.json({ error: 'Você não pode deletar sua própria conta.' }, { status: 400 })
        await prisma.user.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch { return NextResponse.json({ error: 'Não foi possível excluir o usuário.' }, { status: 400 }) }
}
