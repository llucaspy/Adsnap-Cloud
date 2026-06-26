'use server'

import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { nexusLogStore } from '@/lib/nexusLogStore'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const FETCH_TIMEOUT_MS = 15_000 // 15 seconds
const DEFAULT_IMPRESSIONS_REFRESH_DELAY_MINUTES = 10

function getImpressionsRefreshDelayMs() {
    const configuredMinutes = Number(process.env.MONITORING_IMPRESSIONS_REFRESH_DELAY_MINUTES)
    const minutes = Number.isFinite(configuredMinutes) && configuredMinutes > 0
        ? configuredMinutes
        : DEFAULT_IMPRESSIONS_REFRESH_DELAY_MINUTES

    return minutes * 60 * 1000
}

// ---------------------------------------------------------------------------
// Types for 00px GraphQL API responses
// ---------------------------------------------------------------------------
export interface CpmTotalData {
    impressions: number
    valids: number
    viewability: number
}

export interface CpmPurchase {
    quantity: number
    total_data: CpmTotalData
}

export interface SitePurchases {
    cpm: CpmPurchase
}

export interface SiteData {
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
    fromCache?: boolean
    stale?: boolean
    nextRefreshAt?: string
    cacheAgeMs?: number
}

const liveMetricsMemoryCache = new Map<string, LiveMetricsResult>()

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

function getPurchases(site: SiteData): SitePurchases[] {
    return Array.isArray(site.purchases) ? site.purchases : [site.purchases].filter(Boolean)
}

function summarizeMetrics(data: CampaignResponse) {
    let goal = 0
    let delivered = 0
    let viewabilitySum = 0
    let viewabilityCount = 0

    for (const site of data.sites || []) {
        for (const purchase of getPurchases(site)) {
            if (!purchase?.cpm) continue

            const totalData = purchase.cpm.total_data
            goal += purchase.cpm.quantity || 0

            if (totalData) {
                delivered += totalData.impressions ?? totalData.valids ?? 0
                viewabilitySum += totalData.viewability || 0
                viewabilityCount++
            }
        }
    }

    return {
        goal,
        delivered,
        viewability: viewabilityCount > 0 ? viewabilitySum / viewabilityCount : 0,
    }
}

function buildCachedCampaignResponse(campaign: {
    campaignName: string
    lastDelivered: number
    lastGoal: number
    lastViewability: number
}): CampaignResponse {
    return {
        sites: [{
            site_name: campaign.campaignName || 'Snapshot de impressoes',
            purchases: {
                cpm: {
                    quantity: campaign.lastGoal,
                    total_data: {
                        impressions: campaign.lastDelivered,
                        valids: campaign.lastDelivered,
                        viewability: campaign.lastViewability,
                    },
                },
            },
            data_by_date_purchase: [],
        }],
    }
}

function withCacheMeta(result: LiveMetricsResult, fetchedAt: Date, stale = false): LiveMetricsResult {
    const delayMs = getImpressionsRefreshDelayMs()
    const cacheAgeMs = Math.max(0, Date.now() - fetchedAt.getTime())

    return {
        ...result,
        fetchedAt: fetchedAt.toISOString(),
        fromCache: true,
        stale,
        cacheAgeMs,
        nextRefreshAt: new Date(fetchedAt.getTime() + delayMs).toISOString(),
    }
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

export async function getLiveMetrics(campaignId: string, options: { forceRefresh?: boolean } = {}): Promise<LiveMetricsResult> {
    try {
        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: {
                id: true,
                campaignName: true,
                externalAuthUrl: true,
                externalCampaignId: true,
                isMonitoringActive: true,
                lastDelivered: true,
                lastFetchedAt: true,
                lastGoal: true,
                lastViewability: true,
            }
        })

        if (!campaign || !campaign.externalAuthUrl || !campaign.isMonitoringActive) {
            return { success: false, error: 'Monitoramento não configurado ou inativo' }
        }

        const delayMs = getImpressionsRefreshDelayMs()
        const now = Date.now()
        const memoryCached = liveMetricsMemoryCache.get(campaignId)

        if (
            !options.forceRefresh &&
            memoryCached?.success &&
            memoryCached.fetchedAt &&
            now - new Date(memoryCached.fetchedAt).getTime() < delayMs
        ) {
            return withCacheMeta(memoryCached, new Date(memoryCached.fetchedAt))
        }

        if (
            !options.forceRefresh &&
            campaign.lastFetchedAt &&
            campaign.lastGoal > 0 &&
            now - campaign.lastFetchedAt.getTime() < delayMs
        ) {
            return withCacheMeta({
                success: true,
                data: buildCachedCampaignResponse(campaign),
            }, campaign.lastFetchedAt)
        }

        const savedSnapshot = (errMsg: string): LiveMetricsResult => {
            if (campaign.lastFetchedAt && campaign.lastGoal > 0) {
                return withCacheMeta({
                    success: true,
                    data: buildCachedCampaignResponse(campaign),
                    error: errMsg,
                }, campaign.lastFetchedAt, true)
            }

            return { success: false, error: errMsg }
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
            return savedSnapshot(errMsg)
        }

        const finalUrl = authResponse.url
        const urlObj = new URL(finalUrl)
        const sessionToken = urlObj.searchParams.get('s')

        if (!sessionToken) {
            const errMsg = 'Token de sessão não encontrado na resposta 00px'
            await nexusLogStore.addLog(`00px Auth: ${errMsg}`, 'API_ERROR', undefined, campaignId)
            return savedSnapshot(errMsg)
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
            return savedSnapshot(errMsg)
        }

        // 3. GraphQL Query (with 15s timeout)
        const campaignIdInt = parseInt(externalId)
        const filterJson = JSON.stringify({ "campaigns.campaign_id": campaignIdInt })
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
            return savedSnapshot(errMsg)
        }

        const data = await gqlResponse.json()

        if (data.errors) {
            const errMsg = data.errors[0]?.message || 'GraphQL error desconhecido'
            await nexusLogStore.addLog(`00px GraphQL: ${errMsg}`, 'API_ERROR', JSON.stringify(data.errors).substring(0, 500), campaignId)
            return savedSnapshot(errMsg)
        }

        // Validate response structure
        if (!data.data?.campaign?.sites) {
            const errMsg = 'Resposta GraphQL sem dados de campanha/sites'
            await nexusLogStore.addLog(`00px: ${errMsg}`, 'API_ERROR', JSON.stringify(data.data).substring(0, 200), campaignId)
            return savedSnapshot(errMsg)
        }

        const responseData = data.data.campaign as CampaignResponse
        const summary = summarizeMetrics(responseData)
        const fetchedAt = new Date()

        await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
                lastDelivered: Math.round(summary.delivered),
                lastGoal: Math.round(summary.goal),
                lastViewability: summary.viewability,
                lastFetchedAt: fetchedAt,
            },
        })

        const result: LiveMetricsResult = {
            success: true,
            data: responseData,
            fetchedAt: fetchedAt.toISOString(),
            fromCache: false,
            nextRefreshAt: new Date(fetchedAt.getTime() + delayMs).toISOString()
        }

        liveMetricsMemoryCache.set(campaignId, result)
        return result

    } catch (error) {
        const isTimeout = error instanceof DOMException && error.name === 'AbortError'
        const errMsg = isTimeout
            ? 'Timeout: API 00px não respondeu em 15s'
            : (error instanceof Error ? error.message : 'Erro desconhecido')

        await nexusLogStore.addLog(`00px Fatal: ${errMsg}`, 'API_ERROR', undefined, campaignId)

        const campaign = await prisma.campaign.findUnique({
            where: { id: campaignId },
            select: {
                campaignName: true,
                lastDelivered: true,
                lastFetchedAt: true,
                lastGoal: true,
                lastViewability: true,
            },
        })

        if (campaign?.lastFetchedAt && campaign.lastGoal > 0) {
            return withCacheMeta({
                success: true,
                data: buildCachedCampaignResponse(campaign),
                error: errMsg,
            }, campaign.lastFetchedAt, true)
        }

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
