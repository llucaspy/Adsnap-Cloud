import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdmin, hashPassword } from '@/lib/auth'

// PUT /api/admin/users/[id] — Update user (admin only)
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireAdmin()

        const { id } = await params
        const body = await request.json()
        const { name, email, role, isActive, password } = body

        // Build update data for Prisma
        const updateData: Record<string, any> = {}
        if (name !== undefined) updateData.name = String(name).trim()
        if (email !== undefined) updateData.email = String(email).trim().toLowerCase()
        if (role !== undefined && ['admin', 'user'].includes(role)) updateData.role = role
        if (isActive !== undefined) updateData.isActive = Boolean(isActive)
        if (password && password.length >= 4) {
            updateData.password = await hashPassword(password)
        }

        try {
            if ((prisma as any).user) {
                const user = await (prisma as any).user.update({
                    where: { id },
                    data: updateData,
                })
                return NextResponse.json({ success: true, user })
            } else {
                // Fallback manual para update
                const sets: string[] = []
                const values: any[] = []

                Object.entries(updateData).forEach(([key, val]) => {
                    sets.push(`"${key}" = ?`)
                    values.push(val)
                })

                if (sets.length > 0) {
                    values.push(id)
                    await (prisma as any).$executeRawUnsafe(
                        `UPDATE "User" SET ${sets.join(', ')}, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                        ...values
                    )
                }
                return NextResponse.json({ success: true })
            }
        } catch (error: any) {
            console.error('[Admin] Update user error:', error)
            return NextResponse.json({ error: 'Erro ao atualizar: ' + error.message }, { status: 500 })
        }
    } catch (error) {
        console.error('[Admin] Update error:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

// DELETE /api/admin/users/[id] — Delete user (admin only)
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await requireAdmin()
        const { id } = await params

        if (session.userId === id) {
            return NextResponse.json({ error: 'Você não pode deletar sua própria conta' }, { status: 400 })
        }

        try {
            if ((prisma as any).user) {
                await (prisma as any).user.delete({ where: { id } })
            } else {
                await (prisma as any).$executeRawUnsafe(`DELETE FROM "User" WHERE id = ?`, id)
            }
            return NextResponse.json({ success: true })
        } catch (error: any) {
            console.error('[Admin] Delete user error:', error)
            return NextResponse.json({ error: 'Erro ao deletar: ' + error.message }, { status: 500 })
        }
    } catch (error) {
        console.error('[Admin] Delete error:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
