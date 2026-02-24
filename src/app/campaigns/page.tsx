import prisma from '@/lib/prisma'
import { CreateCampaignFlow } from '@/components/CreateCampaignFlow'
import { Sparkles, Zap } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
    const existingCampaigns = await prisma.campaign.findMany({
        select: { pi: true },
        distinct: ['pi']
    })
    const existingPis = existingCampaigns.map(c => c.pi)

    return (
        <div className="max-w-3xl mx-auto space-y-12 animate-slide-up py-8">
            {/* Header */}
            <header className="text-center space-y-6 relative">
                {/* Background glow */}
                <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full blur-3xl opacity-20 pointer-events-none"
                    style={{ background: 'var(--gradient-primary)' }}
                />

                <div className="relative">
                    <div
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold tracking-wide uppercase mb-6"
                        style={{
                            background: 'var(--gradient-primary)',
                            color: 'white',
                            boxShadow: 'var(--shadow-glow)'
                        }}
                    >
                        <Zap size={14} />
                        SETUP DE CAMPANHA
                    </div>

                    <h1
                        className="text-6xl font-extrabold tracking-tight mb-4"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        <span className="text-gradient">Nova</span>
                        <span style={{ color: 'var(--text-primary)' }}> Campanha</span>
                    </h1>

                    <p
                        className="max-w-xl mx-auto text-lg"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        Configure os detalhes de veiculação, PI e automação em poucos passos.
                    </p>
                </div>
            </header>

            <div className="relative">
                <CreateCampaignFlow existingPis={existingPis} />
            </div>

            <footer className="text-center">
                <p
                    className="text-sm font-medium flex items-center justify-center gap-2"
                    style={{ color: 'var(--text-muted)' }}
                >
                    <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                    As capturas agendadas começarão automaticamente no horário definido.
                </p>
            </footer>
        </div>
    )
}
