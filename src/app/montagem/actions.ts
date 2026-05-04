'use server'

import prisma from '@/lib/prisma'

export interface TemplateInfo {
    campaignId: string
    format: string
    device: string
    screenshotUrl: string
    captureDate: string
}

/**
 * Busca todos os templates de PI 000 (Modelo de prints) com suas capturas mais recentes.
 * Agrupa por campaign (formato) para o wizard de seleção.
 */
export async function getMontagemTemplates(): Promise<{
    templates: TemplateInfo[]
    grouped: Record<string, TemplateInfo[]>
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
                take: 1, // Último capture por campanha
            }
        }
    })

    const templates: TemplateInfo[] = campaigns
        .filter(c => c.captures.length > 0)
        .map(c => ({
            campaignId: c.id,
            format: c.format,
            device: c.device || 'desktop',
            screenshotUrl: c.captures[0].screenshotPath,
            captureDate: c.captures[0].createdAt.toISOString().split('T')[0],
        }))

    // Agrupar por device
    const grouped: Record<string, TemplateInfo[]> = {}
    for (const t of templates) {
        const key = t.device
        if (!grouped[key]) grouped[key] = []
        grouped[key].push(t)
    }

    return { templates, grouped }
}
