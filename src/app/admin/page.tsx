import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { AdminView } from '@/components/AdminView'
import { MetricsDashboard } from '@/components/MetricsDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
    const session = await getSession()

    // Server-side protection
    if (!session || session.role !== 'admin') {
        redirect('/login')
    }

    return (
        <div className="space-y-12 animate-fade-in pb-20">
            {/* Infrastructure Dashboard Section */}
            <header className="flex flex-col gap-2">
                <h1 className="text-4xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                    PAINEL <span className="text-gradient">ADMIN</span>
                </h1>
                <p className="text-white/40 text-sm font-medium">Monitoramento de infraestrutura e limites do plano gratuito</p>
            </header>

            <MetricsDashboard />

            <div className="h-px w-full bg-white/5" />

            {/* Access Management Section */}
            <header className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                    Gestão de Acessos
                </h2>
                <p className="text-white/40 text-sm font-medium">Controle de usuários e privilégios do sistema</p>
            </header>

            <AdminView />
        </div>
    )
}
