import prisma from '@/lib/prisma'
import { CreateCampaignFlow } from '@/components/CreateCampaignFlow'
import { FilePlus2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
    const existingCampaigns = await prisma.campaign.findMany({
        select: { pi: true },
        distinct: ['pi'],
    })
    const existingPis = existingCampaigns.map(campaign => campaign.pi)

    return (
        <main className="max-w-7xl mx-auto space-y-6 animate-slide-up pt-20 pb-6 md:py-7">
            <header className="flex items-start gap-3">
                <div
                    className="w-10 h-10 flex items-center justify-center shrink-0"
                    style={{ color: '#a78bfa', background: 'rgba(124,58,237,0.12)', borderRadius: '8px' }}
                >
                    <FilePlus2 size={19} />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold" style={{ color: '#171717' }}>Novo setup</h1>
                    <p className="mt-1 text-sm" style={{ color: '#737373' }}>
                        Importe uma Order do GAM ou conclua o cadastro manual da campanha.
                    </p>
                </div>
            </header>

            <CreateCampaignFlow existingPis={existingPis} />
        </main>
    )
}
