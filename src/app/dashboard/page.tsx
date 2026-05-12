import { DashboardView } from '@/components/DashboardView'
import prisma from '@/lib/prisma'

export const revalidate = 30

export default async function DashboardPage() {
    // Robust construction for "Today" in Brazil Time (UTC-3)
    const now = new Date()
    const brtCheck = new Date(now.getTime() - (3 * 60 * 60 * 1000))
    const dateStr = brtCheck.toISOString().split('T')[0]
    const brtStart = new Date(`${dateStr}T03:00:00.000Z`)

    // Fetch Stats
    const [totalToday, campaigns, failedToday, quarantined, recentCaptures] = await Promise.all([
        prisma.capture.count({ where: { createdAt: { gte: brtStart }, status: 'SUCCESS' } }),
        prisma.campaign.findMany({ where: { isArchived: false } }),
        prisma.capture.count({ where: { createdAt: { gte: brtStart }, status: 'FAILED' } }),
        prisma.campaign.count({ where: { status: 'QUARANTINE', isArchived: false } }),
        prisma.capture.findMany({
            where: { status: 'SUCCESS' },
            take: 8,
            orderBy: { createdAt: 'desc' },
            include: { campaign: true, baseCapture: true }
        })
    ])

    // Calculate Aggregated Stats
    const distinctPis = new Set(campaigns.map(c => c.pi)).size
    const distinctCampaigns = new Set(campaigns.map(c => `${c.pi}-${c.campaignName}`)).size
    const totalFormats = campaigns.length

    const stats = {
        totalCapturesToday: totalToday,
        activePis: distinctPis,
        activeCampaigns: distinctCampaigns,
        totalFormats: totalFormats,
        successRate: totalToday + failedToday > 0
            ? Math.round((totalToday / (totalToday + failedToday)) * 100)
            : 100,
        failedToday: failedToday,
        quarantined: quarantined
    }

    return <DashboardView stats={stats as any} recentCaptures={recentCaptures} />
}
