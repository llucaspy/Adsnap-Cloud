import prisma from './prisma'
import { nexusLogStore } from './nexusLogStore'
import { triggerNexusWorker, getStorageUsage, getAdminMetrics } from '@/app/actions'
import { getAggregatedAdOpsMetrics } from '@/app/adops/actions'

export interface BIData {
    total: number
    atRiskCount: number
    healthScore: number
    globalGoal: number
    globalDelivered: number
    globalToday: number
    globalProjected: number
    avgViewability: number
    atRiskCampaigns: string[]
}

export interface ParsedCampaign {
    pi: string
    client: string
    agency?: string
    format?: string
    url?: string
    device?: string
    segmentation?: string
    flightStart?: Date | string | null
    flightEnd?: Date | string | null
    [key: string]: unknown
}

export interface LogEntry {
    message: string
    level: string
    createdAt: string | Date | number
    details?: string
}

export interface BrainResponse {
    success: boolean
    message: string
    data?: BIData | unknown
}

export async function listCampaigns(filter?: { status?: string; archived?: boolean }): Promise<BrainResponse> {
    try {
        const where: Record<string, unknown> = {}
        if (filter?.status) where.status = filter.status
        if (filter?.archived !== undefined) where.isArchived = filter.archived
        
        const campaigns = await prisma.campaign.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 50
        })
        
        return {
            success: true,
            message: `Encontradas ${campaigns.length} campanha(s)`,
            data: campaigns
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function searchCampaigns(rawQuery: string): Promise<BrainResponse> {
    try {
        const query = rawQuery.replace(/[?.,!]+$/, '').trim()
        console.log(`[Nexus Brain] Searching for: "${query}" (Original: "${rawQuery}")`)
        const campaigns = await prisma.campaign.findMany({
            where: {
                OR: [
                    { client: { contains: query, mode: 'insensitive' } },
                    { campaignName: { contains: query, mode: 'insensitive' } },
                    { pi: { contains: query, mode: 'insensitive' } }
                ]
            },
            take: 10
        })

        if (campaigns.length === 0) {
            return { success: false, message: `Nenhuma campanha encontrada para "${query}"` }
        }

        if (campaigns.length === 1) {
            // Se encontrar apenas uma, já retorna os detalhes completos
            return getCampaign(campaigns[0].id)
        }

        const list = campaigns.map(c => `- **${c.client}** (PI: ${c.pi}) [ID: ${c.id}]`).join('\n')
        return {
            success: true,
            message: `Encontrei ${campaigns.length} campanhas para "${query}":\n${list}\n\nQual delas você gostaria de detalhar?`,
            data: campaigns
        }
    } catch (error) {
        return { success: false, message: `Erro na busca: ${error}` }
    }
}

export async function getCampaign(rawIdOrPi: string): Promise<BrainResponse> {
    try {
        const idOrPi = rawIdOrPi.replace(/[?.,!]+$/, '').trim()
        console.log(`[Nexus Brain] Resolving campaign: "${idOrPi}"`)
        
        // Tenta buscar por ID único primeiro
        let campaign = await prisma.campaign.findUnique({ where: { id: idOrPi } }).catch(() => null)
        
        // Se não achar por ID, tenta por PI
        if (!campaign) {
            campaign = await prisma.campaign.findFirst({ where: { pi: idOrPi, isArchived: false } })
        }

        // Se ainda não achar, tenta busca parcial no nome
        if (!campaign) {
            const searchResult = await searchCampaigns(idOrPi)
            return searchResult
        }
        const campaignId = campaign.id
        const captures = await prisma.capture.findMany({
            where: { campaignId },
            orderBy: { createdAt: 'desc' },
            take: 10
        })
        
        const statusLine = campaign.status === 'ACTIVE' ? '🟢 Ativa' : campaign.status === 'PENDING' ? '🟡 Pendente' : '⚪ Arquivada'
        const flightInfo = campaign.flightStart ? `(Período: ${campaign.flightStart.toLocaleDateString()} - ${campaign.flightEnd?.toLocaleDateString() || '?'})` : ''
        
        return {
            success: true,
            message: `**Campanha: ${campaign.client}**\n- **Status:** ${statusLine}\n- **PI:** ${campaign.pi}\n- **Formato:** ${campaign.format} ${flightInfo}\n- **Última Captura:** ${campaign.lastCaptureAt ? campaign.lastCaptureAt.toLocaleString() : 'Nunca'}\n- **Capturas Disponíveis:** ${captures.length}`,
            data: { ...campaign, captures }
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function createCampaign(data: {
    agency: string
    client: string
    pi: string
    format: string
    url: string
    device?: string
    segmentation?: string
}): Promise<BrainResponse> {
    try {
        const campaign = await prisma.campaign.create({
            data: {
                agency: data.agency,
                client: data.client,
                pi: data.pi,
                format: data.format,
                url: data.url,
                device: data.device || 'desktop',
                segmentation: data.segmentation || 'PRIVADO'
            }
        })
        
        nexusLogStore.addLog(`Nexus Brain: Campanha criada - ${data.client} (PI ${data.pi})`, 'SYSTEM')
        
        return {
            success: true,
            message: `Campanha ${data.client} criada com sucesso!`,
            data: campaign
        }
    } catch (error) {
        return { success: false, message: `Erro ao criar: ${error}` }
    }
}

export async function updateCampaign(id: string, data: Partial<{
    url: string
    status: string
    device: string
    segmentation: string
}>): Promise<BrainResponse> {
    try {
        const campaign = await prisma.campaign.update({
            where: { id },
            data
        })
        
        nexusLogStore.addLog(`Nexus Brain: Campanha atualizada - ${campaign.client}`, 'SYSTEM')
        
        return {
            success: true,
            message: 'Campanha atualizada!',
            data: campaign
        }
    } catch (error) {
        return { success: false, message: `Erro ao atualizar: ${error}` }
    }
}

export async function archiveCampaign(id: string): Promise<BrainResponse> {
    try {
        const campaign = await prisma.campaign.update({
            where: { id },
            data: { isArchived: true }
        })
        
        nexusLogStore.addLog(`Nexus Brain: Campanha arquivada - ${campaign.client}`, 'SYSTEM')
        
        return {
            success: true,
            message: `Campanha ${campaign.client} arquivada!`,
            data: campaign
        }
    } catch (error) {
        return { success: false, message: `Erro ao arquivar: ${error}` }
    }
}

export async function runCapture(campaignId: string): Promise<BrainResponse> {
    try {
        await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: 'QUEUED' }
        })
        
        await triggerNexusWorker()
        
        return {
            success: true,
            message: 'Captura iniciada!',
            data: { campaignId }
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function getMetrics(period?: string): Promise<BrainResponse> {
    try {
        const days = period === 'week' ? 7 : period === 'month' ? 30 : 1
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        
        const captures = await prisma.capture.findMany({
            where: { createdAt: { gte: startDate } }
        })
        
        const campaigns = await prisma.campaign.count({
            where: { isArchived: false }
        })
        
        const active = await prisma.campaign.count({
            where: { isArchived: false, status: 'SUCCESS' }
        })
        
        return {
            success: true,
            message: `Métricas dos últimos ${days} dias`,
            data: {
                totalCaptures: captures.length,
                successfulCaptures: captures.filter(c => c.status === 'SUCCESS').length,
                activeCampaigns: campaigns,
                activeToday: active
            }
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function getSettings(): Promise<BrainResponse> {
    try {
        const settings = await prisma.settings.findFirst()
        return {
            success: true,
            message: 'Configurações',
            data: settings
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function getLogs(limit: number = 20): Promise<BrainResponse> {
    try {
        const logs = await prisma.nexusLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit
        })
        
        return {
            success: true,
            message: `${logs.length} logs encontrados`,
            data: logs
        }
    } catch (error) {
        return { success: false, message: `Erro: ${error}` }
    }
}

export async function getAdOpsSummary(): Promise<BrainResponse> {
    try {
        const data = await getAggregatedAdOpsMetrics()
        return {
            success: true,
            message: `### 📊 Resumo AdOps (BI)\n- **Total Campanhas:** ${data.total}\n- **Saúde Geral:** ${data.healthScore}%`,
            data: {
                total: data.total,
                atRiskCount: data.atRiskCount,
                healthScore: data.healthScore,
                globalGoal: data.globalGoal,
                globalDelivered: data.globalDelivered,
                globalToday: data.globalToday,
                globalProjected: data.globalProjected,
                avgViewability: data.avgViewability,
                atRiskCampaigns: data.campaigns.filter((c: any) => c.status === 'critical' || c.status === 'warning').map((c: any) => c.name)
            }
        }
    } catch (error) {
        return { success: false, message: `Erro ao buscar AdOps: ${error}` }
    }
}

export async function getStorageStats(): Promise<BrainResponse> {
    try {
        const usage = await getStorageUsage()
        const admin = await getAdminMetrics()
        return {
            success: true,
            message: 'Estatísticas de Armazenamento',
            data: {
                screenshots: usage,
                database: admin.database
            }
        }
    } catch (error) {
        return { success: false, message: `Erro ao buscar storage: ${error}` }
    }
}