import prisma from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { EditCampaignForm } from '@/components/EditCampaignForm'

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const campaign = await prisma.campaign.findUnique({
        where: { id }
    })

    if (!campaign) {
        notFound()
    }

    const existingCampaigns = await prisma.campaign.findMany({
        select: { pi: true },
        distinct: ['pi']
    })
    const existingPis = existingCampaigns.map(c => c.pi)

    return (
        <div className="max-w-3xl mx-auto space-y-12 animate-slide-up py-8">
            <header className="relative text-center">
                <div
                    className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
                    style={{ background: 'var(--gradient-secondary)' }}
                />

                <h1
                    className="text-5xl font-extrabold tracking-tight mb-4 relative"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    Editar <span className="text-gradient">Campanha</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Atualize os detalhes da campanha {campaign.campaignName || campaign.client}.
                </p>
            </header>

            <EditCampaignForm campaign={campaign} existingPis={existingPis} />
        </div>
    )
}
