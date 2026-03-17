import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { LiveMonitoringDashboard } from '@/components/LiveMonitoringDashboard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function LiveMonitoringPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const campaign = await prisma.campaign.findUnique({
        where: { id },
        select: {
            id: true,
            campaignName: true,
            client: true,
            isMonitoringActive: true
        }
    })

    if (!campaign || !campaign.isMonitoringActive) {
        notFound()
    }

    return (
        <div className="space-y-8 pb-20">
            <header className="flex items-center gap-4">
                <Link 
                    href="/monitoring"
                    className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                >
                    <ChevronLeft size={20} />
                </Link>
                <div>
                    <h2 className="text-sm font-bold text-white/20 uppercase tracking-widest">Monitoramento em Tempo Real</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white">{campaign.client}</span>
                        <span className="text-white/20">/</span>
                        <span className="text-2xl font-bold text-white/60">{campaign.campaignName}</span>
                    </div>
                </div>
            </header>

            <LiveMonitoringDashboard 
                campaignId={campaign.id} 
                campaignName={campaign.campaignName} 
            />
        </div>
    )
}
