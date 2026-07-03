'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { processManualCapture } from '@/lib/assemblyService'
import { getFormatLabelMap, resolveFormatLabel } from '@/lib/formatLabels'

export async function getAvailableCampaigns() {
    const [formatLabelMap, campaigns] = await Promise.all([
        getFormatLabelMap(),
        prisma.campaign.findMany({
            where: { isArchived: false },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                pi: true,
                client: true,
                campaignName: true,
                format: true,
                device: true
            }
        }),
    ])

    return campaigns.map(campaign => ({
        ...campaign,
        formatLabel: resolveFormatLabel(formatLabelMap, campaign.format),
    }))
}

export async function runManualCaptureAction(campaignId: string, customDate: string, customTime: string) {
    try {
        const result = await processManualCapture(campaignId, customDate, customTime)

        if (result.success) {
            revalidatePath('/books')
            revalidatePath('/books/' + campaignId) // Though the path might be PI based
        }

        return result
    } catch (error) {
        return { success: false, error: (error as Error).message }
    }
}
