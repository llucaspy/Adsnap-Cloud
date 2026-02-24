import prisma from '@/lib/prisma'
import { MonitoringView } from '@/components/MonitoringView'

export const dynamic = 'force-dynamic'

export default async function MonitoringPage() {
    // Data fetching on server
    const campaigns = await prisma.campaign.findMany({
        where: { isArchived: false },
        orderBy: { createdAt: 'desc' }
        // include: { captures: { take: 1, orderBy: { createdAt: 'desc' } } } // We might need this for thumbnails later
    })

    const settings = await prisma.settings.findFirst()
    const bannerFormats = (settings as any)?.bannerFormats
    const formats = bannerFormats ? JSON.parse(bannerFormats) : []

    // Convert Date objects to ISO strings for Client Component serialization
    const serializedCampaigns = campaigns.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        flightStart: c.flightStart?.toISOString() || null,
        flightEnd: c.flightEnd?.toISOString() || null
    }))

    return (
        <MonitoringView
            initialCampaigns={serializedCampaigns}
            formats={formats}
        />
    )
}
