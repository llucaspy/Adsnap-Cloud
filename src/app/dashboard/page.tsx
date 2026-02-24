import { DashboardView } from '@/components/DashboardView'
import prisma from '@/lib/prisma'
import fs from 'fs'
import { startOfDay } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
    const today = startOfDay(new Date())

    // Fetch Stats
    const [totalToday, campaigns, failedToday, quarantined, rawRecentCaptures] = await Promise.all([
        prisma.capture.count({ where: { createdAt: { gte: today }, status: 'SUCCESS' } }),
        prisma.campaign.findMany({ where: { isArchived: false } }),
        prisma.capture.count({ where: { createdAt: { gte: today }, status: 'FAILED' } }),
        prisma.campaign.count({ where: { status: 'QUARANTINE', isArchived: false } }),
        prisma.capture.findMany({
            where: { createdAt: { gte: today } },
            take: 8,
            orderBy: { createdAt: 'desc' },
            include: { campaign: true }
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

    // Filter out captures where the file doesn't exist on disk
    const recentCaptures = rawRecentCaptures.filter(capture => {
        try {
            return fs.existsSync(capture.screenshotPath)
        } catch {
            return false
        }
    })

    return <DashboardView stats={stats} recentCaptures={recentCaptures} />
}
