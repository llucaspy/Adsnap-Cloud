'use server'

import prisma from '@/lib/prisma'

export interface TemplateCapture {
    screenshotUrl: string
    captureDate: string  // YYYY-MM-DD
}

export interface TemplateInfo {
    campaignId: string
    format: string
    device: string
    latestScreenshot: string
    /** Todas as capturas disponíveis, indexadas por data (YYYY-MM-DD) */
    capturesByDate: Record<string, string>  // date -> screenshotUrl
}

/**
 * Busca TODAS as capturas de PI 000, agrupadas por campanha e por data.
 * Isso permite que a montagem use o print do dia correto.
 */
export async function getMontagemTemplates(): Promise<{
    templates: TemplateInfo[]
}> {
    const campaigns = await prisma.campaign.findMany({
        where: { pi: '000' },
        select: {
            id: true,
            format: true,
            device: true,
            captures: {
                where: { status: 'SUCCESS' },
                select: {
                    screenshotPath: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
            }
        }
    })

    const templates: TemplateInfo[] = campaigns
        .filter(c => c.captures.length > 0)
        .map(c => {
            // Agrupar capturas por data (YYYY-MM-DD)
            // Se houver múltiplas capturas no mesmo dia, usar a mais recente
            const capturesByDate: Record<string, string> = {}
            for (const cap of c.captures) {
                const dateStr = cap.createdAt.toISOString().split('T')[0]
                if (!capturesByDate[dateStr]) {
                    capturesByDate[dateStr] = cap.screenshotPath
                }
            }

            return {
                campaignId: c.id,
                format: c.format,
                device: c.device || 'desktop',
                latestScreenshot: c.captures[0].screenshotPath,
                capturesByDate,
            }
        })

    return { templates }
}
