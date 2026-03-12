import { NextResponse } from 'next/server'
import { alertStore } from '@/lib/alertStore'

// GET /api/alerts — retorna alertas ativos
export async function GET() {
    try {
        const alerts = alertStore.getActiveAlerts()
        return NextResponse.json({ alerts })
    } catch (err) {
        return NextResponse.json({ alerts: [] })
    }
}

// DELETE /api/alerts?id=xxx — dismiss um alerta
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')
        if (!id) {
            return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })
        }
        alertStore.dismissAlert(id)
        return NextResponse.json({ success: true })
    } catch (err) {
        return NextResponse.json({ error: 'Erro ao remover alerta' }, { status: 500 })
    }
}
