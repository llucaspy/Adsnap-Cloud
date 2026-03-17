'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function saveMonitoringConfig(campaignId: string, payload: { authUrl: string; externalId: string; active: boolean }) {
    try {
        await prisma.campaign.update({
            where: { id: campaignId },
            data: {
                externalAuthUrl: payload.authUrl,
                externalCampaignId: payload.externalId,
                isMonitoringActive: payload.active
            }
        })
        revalidatePath('/monitoring')
        return { success: true }
    } catch (error) {
        console.error('Failed to save monitoring config:', error)
        return { success: false, error: 'Falha ao salvar configuração' }
    }
}

export async function getLiveMetrics(campaignId: string) {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: {
                id: true,
                externalAuthUrl: true,
                externalCampaignId: true,
                isMonitoringActive: true
            }
        })

        if (!campaign || !campaign.externalAuthUrl || !campaign.isMonitoringActive) {
            return { success: false, error: 'Monitoramento não configurado ou inativo' }
        }

        // 1. Handshake JWT -> Session Token
        // Em Node, o fetch segue redirecionamentos por padrão (redirect: 'follow')
        const authResponse = await fetch(campaign.externalAuthUrl, {
            method: 'GET',
            redirect: 'follow'
        })

        const finalUrl = authResponse.url
        const urlObj = new URL(finalUrl)
        const sessionToken = urlObj.searchParams.get('s')

        if (!sessionToken) {
            return { success: false, error: 'Não foi possível obter token de sessão' }
        }

        // 2. Extrair ID da Campanha da URL se estiver faltando ou para validar
        // URL exemplo: https://analytics.adx.space/dashboard/campaign/6988/site/3500?s=...
        let externalId = campaign.externalCampaignId;
        if (!externalId || externalId === '') {
            const match = finalUrl.match(/\/campaign\/(\d+)/);
            if (match && match[1]) {
                externalId = match[1];
                // Atualizar o banco para futuras consultas serem mais rápidas
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { externalCampaignId: externalId }
                });
            }
        }

        if (!externalId) {
            return { success: false, error: 'ID da campanha externa não encontrado na URL' }
        }

        // 3. GraphQL Query
        // Usando o formato de filtro descoberto: {"campaigns.campaign_id": ID}
        const filterJson = JSON.stringify({ "campaigns.campaign_id": parseInt(externalId) })
        const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`

        const query = `
            query {
              campaign(filter: ${JSON.stringify(filterJson)}) {
                sites {
                  site_name
                  purchases {
                    cpm {
                      quantity
                      total_data {
                        impressions
                        valids
                        viewability
                      }
                    }
                  }
                }
              }
            }
        `

        const gqlResponse = await fetch(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        })

        const data = await gqlResponse.json()

        if (data.errors) {
            return { success: false, error: data.errors[0].message }
        }

        return { success: true, data: data.data.campaign }

    } catch (error) {
        console.error('Error fetching live metrics:', error)
        return { success: false, error: 'Erro ao buscar métricas em tempo real' }
    }
}

export async function getActiveMonitoringCampaigns() {
    try {
        return await prisma.campaign.findMany({
            where: { isMonitoringActive: true },
            select: {
                id: true,
                campaignName: true,
                client: true,
                externalCampaignId: true
            }
        })
    } catch (error) {
        console.error('Failed to fetch monitoring campaigns:', error)
        return []
    }
}
