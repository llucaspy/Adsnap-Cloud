'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { nexusLogStore } from '@/lib/nexusLogStore'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FETCH_TIMEOUT_MS = 90_000 // 90 seconds (1min 30s) as requested by user

// ---------------------------------------------------------------------------
// Types for 00px GraphQL API responses
// ---------------------------------------------------------------------------
export interface CpmTotalData {
    impressions: number
    valids: number
    viewability: number
}

export interface ChannelData {
    channel_id: number
    channel_descr: string
    channel_purchased_quantity: number
    total_data: CpmTotalData | Record<string, never>
}

export interface CpmPurchase {
    quantity: number
    total_data?: CpmTotalData | null
    channels?: ChannelData[]
}

export interface SitePurchases {
    cpm: CpmPurchase
}

export interface SiteData {
    site_id: number
    site_name: string
    purchases: SitePurchases | SitePurchases[]
    data_by_date_purchase: unknown // JSON scalar — parsed at runtime
}

export interface CampaignResponse {
    sites: SiteData[]
}

export interface LiveMetricsResult {
    success: boolean
    data?: CampaignResponse
    error?: string
    fetchedAt?: string // ISO timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a fetch with AbortController timeout */
function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    return fetch(url, {
        ...options,
        signal: controller.signal,
    }).finally(() => clearTimeout(timer))
}

// ---------------------------------------------------------------------------
// Public Actions
// ---------------------------------------------------------------------------

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

export async function getLiveMetrics(campaignId: string): Promise<LiveMetricsResult> {
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

        // 1. Handshake JWT -> Session Token (with 15s timeout)
        const authResponse = await fetchWithTimeout(campaign.externalAuthUrl, {
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store'
        }, FETCH_TIMEOUT_MS)

        if (!authResponse.ok) {
            const errMsg = `Handshake falhou: HTTP ${authResponse.status}`
            await nexusLogStore.addLog(`00px: ${errMsg}`, 'API_ERROR', undefined, campaignId)
            return { success: false, error: errMsg }
        }

        const finalUrl = authResponse.url
        const urlObj = new URL(finalUrl)
        const sessionToken = urlObj.searchParams.get('s')

        if (!sessionToken) {
            const errMsg = 'Token de sessão não encontrado na resposta 00px'
            await nexusLogStore.addLog(`00px Auth: ${errMsg}`, 'API_ERROR', undefined, campaignId)
            return { success: false, error: errMsg }
        }

        // 2. Extract Campaign ID from URL if missing
        let externalId = campaign.externalCampaignId;
        if (!externalId || externalId === '') {
            const match = finalUrl.match(/\/campaign\/(\d+)/);
            if (match && match[1]) {
                externalId = match[1];
                await prisma.campaign.update({
                    where: { id: campaign.id },
                    data: { externalCampaignId: externalId }
                });
            }
        }

        if (!externalId) {
            const errMsg = 'ID da campanha externa não encontrado'
            await nexusLogStore.addLog(`00px: ${errMsg}`, 'API_ERROR', undefined, campaignId)
            return { success: false, error: errMsg }
        }

        // 3. GraphQL Query (with 15s timeout)
        const campaignIdInt = parseInt(externalId)
        const filterJson = JSON.stringify({ "campaigns.campaign_id": campaignIdInt })
        const graphqlUrl = `https://graphql.00px.com.br/graphql/?s=${sessionToken}`

        const query = `
            query {
              campaign(filter: ${JSON.stringify(filterJson)}) {
                sites {
                  site_id
                  site_name
                  purchases {
                    cpm {
                      quantity
                      total_data {
                        impressions
                        valids
                        viewability
                      }
                      channels {
                        channel_id
                        channel_descr
                        channel_purchased_quantity
                        total_data {
                          impressions
                          valids
                          viewability
                        }
                      }
                    }
                  }
                  data_by_date_purchase(campaign_id: ${campaignIdInt})
                }
              }
            }
        `

        const gqlResponse = await fetchWithTimeout(graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
            cache: 'no-store'
        }, FETCH_TIMEOUT_MS)

        // Validate HTTP status before parsing
        if (!gqlResponse.ok) {
            const errMsg = `GraphQL HTTP ${gqlResponse.status}: ${gqlResponse.statusText}`
            await nexusLogStore.addLog(`00px: ${errMsg}`, 'API_ERROR', undefined, campaignId)
            return { success: false, error: errMsg }
        }

        const data = await gqlResponse.json()

        if (data.errors) {
            const errMsg = data.errors[0]?.message || 'GraphQL error desconhecido'
            await nexusLogStore.addLog(`00px GraphQL: ${errMsg}`, 'API_ERROR', JSON.stringify(data.errors).substring(0, 500), campaignId)
            return { success: false, error: errMsg }
        }

        // Validate response structure
        if (!data.data?.campaign?.sites) {
            const errMsg = 'Resposta GraphQL sem dados de campanha/sites'
            await nexusLogStore.addLog(`00px: ${errMsg}`, 'API_ERROR', JSON.stringify(data.data).substring(0, 200), campaignId)
            return { success: false, error: errMsg }
        }

        return {
            success: true,
            data: data.data.campaign as CampaignResponse,
            fetchedAt: new Date().toISOString()
        }

    } catch (error) {
        const isTimeout = error instanceof DOMException && error.name === 'AbortError'
        const errMsg = isTimeout
            ? 'Timeout: API 00px não respondeu em 90s'
            : (error instanceof Error ? error.message : 'Erro desconhecido')

        await nexusLogStore.addLog(`00px Fatal: ${errMsg}`, 'API_ERROR', undefined, campaignId)
        return { success: false, error: errMsg }
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
