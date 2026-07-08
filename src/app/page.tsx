import prisma from '@/lib/prisma'
import { HomeView } from '@/components/HomeView'
import type { Prisma } from '@prisma/client'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'
import { getSession } from '@/lib/auth'

export const revalidate = 30

function getBrazilDayStart() {
  const now = new Date()
  const brtCheck = new Date(now.getTime() - (3 * 60 * 60 * 1000))
  const dateStr = brtCheck.toISOString().split('T')[0]
  return new Date(`${dateStr}T03:00:00.000Z`)
}

function getBrazilDateAnchor() {
  const now = new Date()
  const brtNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
  return new Date(Date.UTC(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate()))
}

type ActivePrintSource = {
  id: string
  pi: string
  client: string
  campaignName: string
  format: string
  device: string
  status: string
  updatedAt: Date
}

const printStatusPriority: Record<string, number> = {
  PROCESSING: 0,
  QUEUED: 1,
  AUTOCONFIG: 2,
  ACTIVE: 3,
  SUCCESS: 4,
  PENDING: 5,
}

function activeCampaignGroupKey(campaign: ActivePrintSource) {
  return [
    campaign.pi.trim(),
    campaign.client.trim().toLowerCase(),
    campaign.campaignName.trim().toLowerCase(),
  ].join('|')
}

function summarizeFormats(labels: string[]) {
  const visible = labels.slice(0, 3).join(', ')
  const remaining = labels.length - 3
  return remaining > 0 ? `${visible} +${remaining}` : visible
}

function groupActivePrintCampaigns(campaigns: ActivePrintSource[], formatLabelMap: Map<string, string>) {
  const groups = new Map<string, {
    id: string
    pi: string
    client: string
    campaignName: string
    status: string
    updatedAt: Date
    formats: Map<string, string>
    devices: Set<string>
  }>()

  for (const campaign of campaigns) {
    const key = activeCampaignGroupKey(campaign)
    const formatLabel = resolveFormatLabel(formatLabelMap, campaign.format)
    const formatKey = `${formatLabel}|${campaign.device}`
    const existing = groups.get(key)

    if (!existing) {
      groups.set(key, {
        id: campaign.id,
        pi: campaign.pi,
        client: campaign.client,
        campaignName: campaign.campaignName,
        status: campaign.status,
        updatedAt: campaign.updatedAt,
        formats: new Map([[formatKey, formatLabel]]),
        devices: new Set([campaign.device]),
      })
      continue
    }

    existing.formats.set(formatKey, formatLabel)
    existing.devices.add(campaign.device)

    if ((printStatusPriority[campaign.status] ?? 9) < (printStatusPriority[existing.status] ?? 9)) {
      existing.status = campaign.status
    }

    if (campaign.updatedAt > existing.updatedAt) {
      existing.updatedAt = campaign.updatedAt
    }
  }

  return Array.from(groups.values())
    .sort((a, b) =>
      (printStatusPriority[a.status] ?? 9) - (printStatusPriority[b.status] ?? 9)
      || b.updatedAt.getTime() - a.updatedAt.getTime()
    )
    .map(group => {
      const formatLabels = Array.from(new Set(group.formats.values()))
      const devices = Array.from(group.devices).filter(Boolean).sort()

      return {
        id: group.id,
        pi: group.pi,
        client: group.client,
        campaignName: group.campaignName,
        status: group.status,
        formatCount: group.formats.size,
        formatSummary: summarizeFormats(formatLabels),
        deviceSummary: devices.join(' / ') || 'device',
      }
    })
}

export default async function HomePage() {
  const session = await getSession()
  const brtStart = getBrazilDayStart()
  const brtDateAnchor = getBrazilDateAnchor()
  const activePrintCampaignWhere: Prisma.CampaignWhereInput = {
    isArchived: false,
    status: { notIn: ['EXPIRED', 'FINISHED', 'FAILED', 'QUARANTINE'] },
    OR: [
      { status: { in: ['PROCESSING', 'QUEUED', 'AUTOCONFIG'] } },
      {
        AND: [
          { flightStart: { lte: brtDateAnchor } },
          { flightEnd: { gte: brtDateAnchor } },
        ],
      },
    ],
  }

  const [
    formatLabelMap,
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
    currentUser,
  ] = await Promise.all([
    getFormatLabelMap(),
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
      where: activePrintCampaignWhere,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        pi: true,
        client: true,
        campaignName: true,
        format: true,
        device: true,
        status: true,
        updatedAt: true,
      },
    }).catch(() => []),
    session?.userId
      ? prisma.user.findUnique({
        where: { id: session.userId },
        select: { name: true, email: true },
      }).catch(() => null)
      : Promise.resolve(null),
  ])

  const distinctPis = new Set(campaigns.map(campaign => campaign.pi)).size
  const distinctCampaigns = new Set(campaigns.map(campaign => `${campaign.pi}-${campaign.campaignName}`)).size
  const successRate = totalToday + failedToday > 0
    ? Math.round((totalToday / (totalToday + failedToday)) * 100)
    : 100
  const activePrintCampaignGroups = groupActivePrintCampaigns(activePrintCampaigns, formatLabelMap)

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
          formatLabel: resolveFormatLabel(formatLabelMap, capture.campaign.format),
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
      activePrintTotal={activePrintCampaignGroups.length}
      activePrintCampaigns={activePrintCampaignGroups.slice(0, 20)}
      currentUserName={currentUser?.name || currentUser?.email || session?.email}
    />
  )
}
