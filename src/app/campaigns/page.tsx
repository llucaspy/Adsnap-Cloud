import prisma from '@/lib/prisma'
import { CreateCampaignFlow } from '@/components/CreateCampaignFlow'
import { FilePlus2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage({
    searchParams,
}: {
    searchParams: Promise<{ jobId?: string }>
}) {
    const params = await searchParams
    const existingCampaigns = await prisma.campaign.findMany({
        select: { pi: true },
        distinct: ['pi'],
    })
    const existingPis = existingCampaigns.map(campaign => campaign.pi)

    return (
        <main className="max-w-7xl mx-auto space-y-6 animate-slide-up pt-20 pb-6 md:py-7 px-4 md:px-0">
            <header className="flex items-start gap-4">
                <div
                    className="w-10 h-10 flex items-center justify-center shrink-0"
                    style={{ color: '#e5e5e5', background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', boxShadow: 'rgba(0,0,0,0.20) 0px 2px 8px 0px' }}
                >
                    <FilePlus2 size={19} />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: '#ffffff' }}>Novo setup</h1>
                    <p className="mt-1 text-sm" style={{ color: '#737373' }}>
                        Importe uma Order do Google Ad Manager ou conclua o cadastro manual da campanha.
                    </p>
                </div>
            </header>

            <CreateCampaignFlow existingPis={existingPis} initialGamJobId={params.jobId || null} />
        </main>
    )
}
