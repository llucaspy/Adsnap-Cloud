import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { AdminView } from '@/components/AdminView'

export default async function AdminPage() {
    const session = await getSession()

    // Server-side protection (redundant with middleware but extra safe)
    if (!session || session.role !== 'admin') {
        redirect('/login')
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <header className="flex flex-col gap-2">
                <h1 className="text-3xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                    GESTÃO DE <span className="text-gradient">ACESSOS</span>
                </h1>
                <p className="text-white/40 text-sm font-medium">Controle central de usuários e privilégios do Nexus</p>
            </header>

            <AdminView />
        </div>
    )
}
