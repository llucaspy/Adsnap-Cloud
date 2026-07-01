import { Prisma, type PrismaClient } from '@prisma/client'
import type { GamImportDraft, GamImportMediaEntry } from './gamImportPlanner'
import { DEFAULT_CAPTURE_DELAY_SECONDS } from './captureTiming'

export interface GamImportWriteResult {
    created: number
    skipped: number
    blocked: number
    campaignIds: string[]
}

function isReady(entry: GamImportMediaEntry) {
    return entry.confidence === 'high' || entry.confidence === 'review'
}

function withCreativeAsset(existing: Prisma.JsonValue | null | undefined, creativeAssetUrl?: string) {
    if (!creativeAssetUrl) return undefined

    const current = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? existing as Record<string, Prisma.JsonValue>
        : {}

    return {
        ...current,
        creativeAssetUrl,
    } satisfies Prisma.InputJsonObject
}

export async function createCampaignsFromGamDraft(
    prisma: PrismaClient,
    draft: GamImportDraft
): Promise<GamImportWriteResult> {
    const campaignIds: string[] = []
    let created = 0
    let skipped = 0
    let blocked = draft.blockedItems.length

    if (!draft.agency || !draft.client || !draft.pi) {
        throw new Error('Rascunho GAM sem agencia, cliente ou PI.')
    }

    for (const entry of draft.mediaEntries) {
        if (!isReady(entry)) {
            blocked++
            continue
        }

        const existing = await prisma.campaign.findFirst({
            where: {
                externalCampaignId: entry.externalCampaignId,
                format: entry.format,
                device: entry.device,
                url: entry.url,
                isArchived: false,
            },
            select: { id: true, compositionBox: true },
        })

        if (existing) {
            const compositionBox = withCreativeAsset(existing.compositionBox, entry.creativeAssetUrl)
            await prisma.campaign.update({
                where: { id: existing.id },
                data: {
                    segmentation: draft.segmentation,
                    captureCadence: draft.captureCadence,
                    ...(compositionBox ? { compositionBox } : {}),
                },
            })
            skipped++
            campaignIds.push(existing.id)
            continue
        }

        const campaign = await prisma.campaign.create({
            data: {
                agency: draft.agency,
                client: draft.client,
                campaignName: draft.campaignName,
                pi: draft.pi,
                segmentation: draft.segmentation,
                captureCadence: draft.captureCadence,
                captureDelaySeconds: DEFAULT_CAPTURE_DELAY_SECONDS,
                flightStart: draft.flightStart ? new Date(`${draft.flightStart}T00:00:00-03:00`) : null,
                flightEnd: draft.flightEnd ? new Date(`${draft.flightEnd}T23:59:59-03:00`) : null,
                isScheduled: draft.isScheduled,
                scheduledTimes: draft.scheduledTimes,
                format: entry.format,
                url: entry.url,
                device: entry.device,
                status: 'PENDING',
                externalCampaignId: entry.externalCampaignId,
                externalAuthUrl: draft.orderUrl || null,
                compositionBox: withCreativeAsset(null, entry.creativeAssetUrl),
                showOnDashboard: true,
            },
        })

        created++
        campaignIds.push(campaign.id)
    }

    return { created, skipped, blocked, campaignIds }
}
