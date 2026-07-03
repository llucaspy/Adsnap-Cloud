import prisma from '@/lib/prisma'
import { HomeView } from '@/components/HomeView'

export const revalidate = 30

function getBrazilDayStart() {
  const now = new Date()
  const brtCheck = new Date(now.getTime() - (3 * 60 * 60 * 1000))
  const dateStr = brtCheck.toISOString().split('T')[0]
  return new Date(`${dateStr}T03:00:00.000Z`)
}

export default async function HomePage() {
  const brtStart = getBrazilDayStart()

  const [
    totalToday,
    failedToday,
    quarantined,
    campaigns,
    recentCaptures,
    recentLogs,
    queuedJobs,
    runningJobs,
    failedJobs,
    queuedCampaigns,
    processingCampaigns,
    activePrintCampaigns,
  ] = await Promise.all([
    prisma.capture.count({ where: { createdAt: { gte: brtStart }, status: 'SUCCESS' } }).catch(() => 0),
    prisma.capture.count({ where: { createdAt: { gte: brtStart }, status: 'FAILED' } }).catch(() => 0),
    prisma.campaign.count({ where: { status: 'QUARANTINE', isArchived: false } }).catch(() => 0),
    prisma.campaign.findMany({ where: { isArchived: false } }).catch(() => []),
    prisma.capture.findMany({
      where: { status: 'SUCCESS' },
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { campaign: true, baseCapture: true },
    }).catch(() => []),
    prisma.nexusLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
    }).catch(() => []),
    prisma.workerJob.count({ where: { status: 'QUEUED' } }).catch(() => 0),
    prisma.workerJob.count({ where: { status: { in: ['RUNNING', 'PROCESSING'] } } }).catch(() => 0),
    prisma.workerJob.count({ where: { status: { in: ['FAILED', 'ERROR'] } } }).catch(() => 0),
    prisma.campaign.count({ where: { status: { in: ['QUEUED', 'AUTOCONFIG'] }, isArchived: false } }).catch(() => 0),
    prisma.campaign.count({ where: { status: 'PROCESSING', isArchived: false } }).catch(() => 0),
    prisma.campaign.findMany({
      where: {
        status: { in: ['PROCESSING', 'QUEUED', 'AUTOCONFIG'] },
        isArchived: false,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        pi: true,
        client: true,
        campaignName: true,
        format: true,
        device: true,
        status: true,
      },
    }).catch(() => []),
  ])

  const distinctPis = new Set(campaigns.map(campaign => campaign.pi)).size
  const distinctCampaigns = new Set(campaigns.map(campaign => `${campaign.pi}-${campaign.campaignName}`)).size
  const successRate = totalToday + failedToday > 0
    ? Math.round((totalToday / (totalToday + failedToday)) * 100)
    : 100

  return (
    <HomeView
      generatedAt={new Date().toISOString()}
      stats={{
        totalCapturesToday: totalToday,
        failedToday,
        quarantined,
        activePis: distinctPis,
        activeCampaigns: distinctCampaigns,
        totalFormats: campaigns.length,
        successRate,
        queued: queuedJobs + queuedCampaigns,
        processing: runningJobs + processingCampaigns,
        failedJobs,
      }}
      recentCaptures={recentCaptures.map(capture => ({
        id: capture.id,
        createdAt: capture.createdAt.toISOString(),
        isAssembly: capture.isAssembly,
        campaign: capture.campaign ? {
          pi: capture.campaign.pi,
          client: capture.campaign.client,
          format: capture.campaign.format,
          device: capture.campaign.device,
          campaignName: capture.campaign.campaignName,
        } : null,
      }))}
      recentLogs={recentLogs.map(log => ({
        id: log.id,
        level: log.level,
        message: log.message,
        createdAt: log.createdAt.toISOString(),
      }))}
      activePrintTotal={queuedCampaigns + processingCampaigns}
      activePrintCampaigns={activePrintCampaigns
        .slice()
        .sort((a, b) => {
          const priority: Record<string, number> = { PROCESSING: 0, QUEUED: 1, AUTOCONFIG: 2 }
          return (priority[a.status] ?? 9) - (priority[b.status] ?? 9)
        })
        .map(campaign => ({
        id: campaign.id,
        pi: campaign.pi,
        client: campaign.client,
        campaignName: campaign.campaignName,
        format: campaign.format,
        device: campaign.device,
        status: campaign.status,
      }))}
    />
  )
}
