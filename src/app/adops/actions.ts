'use server'

import prisma from '@/lib/prisma'
import { getLiveMetrics, type LiveMetricsResult } from '@/app/monitoring/actions'
import { differenceInCalendarDays, startOfDay } from 'date-fns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface FormatEntry {
    name: string
    goal: number
    delivered: number
    viewability: number
    pacing: number
}

interface DailyCpmData {
    impressions?: number
    viewability?: number
    total_data_purchase_type_channels?: Record<string, { impressions?: number }>
}

interface DailyEntry {
    datetime: string
    cpm: DailyCpmData | string
}

export interface AdOpsMetrics {
    total: number
    onTrackCount: number
    healthScore: number
    atRiskCount: number
    globalGoal: number
    globalDelivered: number
    globalToday: number
    globalProjected: number
    avgViewability: number
    isSyncing?: boolean
    campaigns: any[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get today's date string in dd/MM/yyyy format, Brazil timezone */
function getTodayBrazil(): string {
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date())
}

/** Safe division that returns a fallback on Infinity/NaN */
function safeDivide(numerator: number, denominator: number, fallback = 0): number {
    const result = numerator / denominator
    return Number.isFinite(result) ? result : fallback
}

/** Parse JSON scalar data_by_date_purchase into array */
function parseDailyData(raw: unknown): DailyEntry[] {
    if (!raw) return []
    if (typeof raw === 'string') {
        try { return JSON.parse(raw) as DailyEntry[] } catch { return [] }
    }
    if (Array.isArray(raw)) return raw as DailyEntry[]
    return []
}

/** Extract impressions from a cpm data object (handles both direct and nested channels) */
function extractDayImpressions(cpmRaw: DailyCpmData | string | undefined): number {
    if (!cpmRaw) return 0

    const cpm: DailyCpmData = typeof cpmRaw === 'string' 
        ? (() => { try { return JSON.parse(cpmRaw) } catch { return {} } })()
        : cpmRaw

    // 1. Direct impressions field (preferred)
    if (typeof cpm.impressions === 'number' && cpm.impressions > 0) {
        return cpm.impressions
    }

    // 2. Sum from nested channels
    if (cpm.total_data_purchase_type_channels && typeof cpm.total_data_purchase_type_channels === 'object') {
        let sum = 0
        for (const ch of Object.values(cpm.total_data_purchase_type_channels)) {
            if (ch && typeof ch.impressions === 'number') {
                sum += ch.impressions
            }
        }
        return sum
    }

    return 0
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------
let metricsCache: { data: AdOpsMetrics, timestamp: number } | null = null
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes
let isRefreshing = false
let currentRefreshPromise: Promise<AdOpsMetrics> | null = null

export async function getAggregatedAdOpsMetrics(): Promise<AdOpsMetrics> {
    const now = Date.now()
    
    // 1. Return fresh cache if available
    if (metricsCache && (now - metricsCache.timestamp < CACHE_TTL)) {
        return metricsCache.data
    }

    // 2. If refresh is already in progress, wait for it if no cache exists
    if (isRefreshing && currentRefreshPromise) {
        console.log('[BI Cache] Refresh in progress, joining promise...')
        try {
            return await currentRefreshPromise
        } catch (err) {
            console.error('[BI Cache] Joined refresh failed, returning empty state:', err)
            return getEmptyState()
        }
    }

    // 3. Stale cache refresh in background
    if (metricsCache) {
        if (!isRefreshing) {
            console.log('[BI Cache] Returning stale metrics, triggering background refresh...')
            currentRefreshPromise = fetchAndCacheMetrics()
            currentRefreshPromise.catch(err => {
                console.error('[BI Cache] Background refresh failed:', err)
            }).finally(() => {
                isRefreshing = false
                currentRefreshPromise = null
            })
        }
        return metricsCache.data
    }

    // 4. No cache at all: Fetch synchronously with timeout
    console.log('[BI Cache] No cache found, performing initial fetch...')
    try {
        currentRefreshPromise = fetchAndCacheMetrics()
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Initial Fetch Timeout')), 18000)
        )
        
        if (currentRefreshPromise) {
            return await Promise.race([currentRefreshPromise, timeoutPromise]) as AdOpsMetrics
        }
        return getEmptyState()
    } catch {
        console.warn('[BI Cache] Initial fetch timed out or failed, returning empty state')
        return getEmptyState()
    }
}

function getEmptyState(): AdOpsMetrics {
    return {
        total: 0,
        onTrackCount: 0,
        healthScore: 0,
        atRiskCount: 0,
        globalGoal: 100,
        globalDelivered: 0,
        globalToday: 0,
        globalProjected: 0,
        avgViewability: 0,
        campaigns: [],
        isSyncing: true
    }
}

/**
 * Core logic to fetch, process and cache metrics
 */
async function fetchAndCacheMetrics(): Promise<AdOpsMetrics> {
    if (isRefreshing && !currentRefreshPromise) {
         return (metricsCache?.data || getEmptyState()) as AdOpsMetrics
    }
    isRefreshing = true
    
    try {
        const campaigns = await prisma.campaign.findMany({
            where: {
                isArchived: false,
                externalAuthUrl: { not: "" }
            }
        })

        if (campaigns.length === 0) {
            const emptyResult: AdOpsMetrics = {
                total: 0,
                onTrackCount: 0,
                healthScore: 100,
                atRiskCount: 0,
                globalGoal: 0,
                globalDelivered: 0,
                globalToday: 0,
                globalProjected: 0,
                avgViewability: 0,
                campaigns: []
            }
            metricsCache = { data: emptyResult, timestamp: Date.now() }
            isRefreshing = false
            return emptyResult
        }

        // Group by PI
        const groupedMap = new Map<string, typeof campaigns>()
        campaigns.forEach(c => {
            const group = groupedMap.get(c.pi) || []
            group.push(c)
            groupedMap.set(c.pi, group)
        })

        const formattedCampaigns = await Promise.all(
            Array.from(groupedMap.entries()).map(async ([pi, group]) => {
                const monitoringCampaign = group.find(c => c.isMonitoringActive) || group[0]
                const main = group[0]
                const manualDashboardUrl = group.find(c => (c as any).manualDashboardUrl)?.manualDashboardUrl || null

                // Fetch real metrics
                const result: LiveMetricsResult = await getLiveMetrics(monitoringCampaign.id)
                const apiAvailable = result.success && !!result.data

                // BI Agent History
                let metricHistory: { date: Date; delivered: number }[] = []
                try {
                    const prismaAny = prisma as any
                    if (prismaAny.dailyMetric) {
                        metricHistory = await prismaAny.dailyMetric.findMany({
                            where: { campaignId: pi },
                            orderBy: { date: 'desc' },
                            take: 7
                        })
                    }
                } catch { /* skip */ }

                let totalDelivered = 0
                let totalGoal = 0
                let avgViewability = 0
                let metricsCount = 0
                let formats: FormatEntry[] = []
                let fetchedAt = result.fetchedAt || null

                if (apiAvailable && result.data) {
                    const sites = result.data.sites || []
                    for (const site of sites) {
                        const purchasesList = Array.isArray(site.purchases) ? site.purchases : [site.purchases]
                        for (const purchase of purchasesList as any[]) {
                            if (!purchase.cpm) continue
                            const q = purchase.cpm.quantity || 0
                            const td = purchase.cpm.total_data
                            const d = td?.impressions ?? td?.valids ?? 0
                            const v = (td?.viewability ?? 0) * 100
                            totalGoal += q
                            if (td) {
                                totalDelivered += d
                                avgViewability += v
                                metricsCount++
                            }
                            formats.push({
                                name: site.site_name,
                                goal: q,
                                delivered: d,
                                viewability: v,
                                pacing: safeDivide(d, q) * 100
                            })
                        }
                    }
                    if (metricsCount > 0) avgViewability = safeDivide(avgViewability, metricsCount)
                } else if (metricsCache) {
                    // Fallback to cache if API is down
                    const previous = metricsCache.data.campaigns.find(c => c.id === pi)
                    if (previous) {
                        totalDelivered = previous.deliveredImpressions
                        totalGoal = previous.goalImpressions
                        avgViewability = previous.viewability
                        formats = previous.formats || []
                        fetchedAt = previous.fetchedAt
                    }
                }

                if (totalGoal === 0) totalGoal = group.length * 1_000_000 

                const allStarts = group.filter(c => c.flightStart).map(c => new Date(c.flightStart!).getTime())
                const allEnds = group.filter(c => c.flightEnd).map(c => new Date(c.flightEnd!).getTime())
                const start = allStarts.length ? Math.min(...allStarts) : Date.now() - (7 * 86400000)
                const end = allEnds.length ? Math.max(...allEnds) : Date.now() + (30 * 86400000)
                const s = startOfDay(new Date(start))
                const e = startOfDay(new Date(end))
                const n = startOfDay(new Date())
                const elapsedDays = Math.max(1, differenceInCalendarDays(n, s) + 1)
                const totalDays = Math.max(1, differenceInCalendarDays(e, s) + 1)
                const daysLeft = Math.max(1, totalDays - elapsedDays)
                const safeGoal = Math.max(1, Number(totalGoal))
                const safeDelivered = Math.max(0, Number(totalDelivered))

                const timeProgress = Math.min(100, safeDivide(elapsedDays, totalDays) * 100)
                const deliveryProgress = safeDivide(safeDelivered, safeGoal) * 100
                const pacing = safeDivide(safeDelivered / safeGoal, elapsedDays / totalDays, 0)
                const pacingPercent = pacing * 100
                const currentDaily = safeDivide(safeDelivered, elapsedDays)
                const remaining = Math.max(0, safeGoal - safeDelivered)
                const requiredDaily = safeDivide(remaining, daysLeft)
                const projectedFinalValue = currentDaily * totalDays
                const projectionPercent = safeDivide(projectedFinalValue, safeGoal) * 100

                let status: 'on-track' | 'warning' | 'critical' | 'over' = 'on-track'
                const isDelayedButHealthy = pacingPercent >= 95 && projectionPercent < 95
                let score = 100
                if (avgViewability < 60) score -= (60 - avgViewability) * 0.5

                const dailyMap = new Map<string, number>()
                let deliveredTodayFromAPI = 0
                const todayStr = getTodayBrazil()

                if (apiAvailable && result.data) {
                    for (const site of result.data.sites || []) {
                        const dailyData = parseDailyData(site.data_by_date_purchase)
                        for (const entry of dailyData) {
                            const impressions = extractDayImpressions(entry.cpm)
                            const dateKey = entry.datetime || ''
                            if (dateKey && impressions > 0) {
                                dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + impressions)
                            }
                        }
                    }
                    deliveredTodayFromAPI = dailyMap.get(todayStr) || 0
                }

                const realHistoryArr = Array.from(dailyMap.entries())
                    .map(([date, value]) => {
                        const [d, m, y] = date.split('/').map(Number)
                        return { date: new Date(y, m - 1, d).toISOString(), value }
                    })
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

                const last3Days = realHistoryArr.slice(-3)
                const recentDailyAvg = last3Days.length > 0 ? last3Days.reduce((sum, h) => sum + h.value, 0) / last3Days.length : currentDaily
                const recalcPressure = safeDivide(requiredDaily, Math.max(1, recentDailyAvg), 1)

                if (projectionPercent < 85 || recalcPressure > 1.3) status = 'critical'
                else if (projectionPercent < 95 || recalcPressure > 1.15) status = 'warning'
                else if (pacingPercent >= 105) status = 'over'

                if (status === 'critical') score = 40
                else if (status === 'warning') score = 75
                else if (status === 'on-track' && isDelayedButHealthy) score = 85
                score = Math.max(0, Math.min(100, Math.round(score)))

                const diagnostics: string[] = []
                if (isDelayedButHealthy) diagnostics.push('⚠️ Risco Oculto: Pacing OK mas projeção baixa')
                if (recalcPressure > 1.2) diagnostics.push(`Pressão de entrega ALTA (${recalcPressure.toFixed(2)}x)`)
                if (avgViewability < 60) diagnostics.push(`Viewability baixa (${avgViewability.toFixed(0)}%)`)
                if (!apiAvailable) diagnostics.push('⚠️ API Indisponível (Dados em cache)')

                const recommendations: string[] = []
                if (recalcPressure > 1.1) recommendations.push(`Acelerar entrega em ${((recalcPressure - 1) * 100).toFixed(0)}%`)
                if (avgViewability < 55) recommendations.push("Otimizar inventário")

                const yesterdayVal = realHistoryArr.length >= 2 ? realHistoryArr[realHistoryArr.length - 2].value : 0
                const realTrend = deliveredTodayFromAPI > yesterdayVal ? 'up' : deliveredTodayFromAPI < yesterdayVal ? 'down' : 'neutral'
                const finalHistory = realHistoryArr.length > 0 ? realHistoryArr.slice(-7).map(h => ({ date: h.date, value: h.value })) : metricHistory.map(h => ({ date: h.date.toISOString(), value: h.delivered }))

                return {
                    id: pi,
                    name: main.campaignName || pi,
                    advertiser: main.client,
                    startDate: new Date(start).toISOString(),
                    endDate: new Date(end).toISOString(),
                    goalImpressions: safeGoal,
                    deliveredImpressions: safeDelivered,
                    pacing,
                    pacingPercent,
                    viewability: avgViewability,
                    status,
                    formats,
                    pi,
                    manualDashboardUrl,
                    apiAvailable,
                    fetchedAt,
                    projection: { completion: projectedFinalValue, completionPercent: projectionPercent, total: projectedFinalValue, dailyRate: currentDaily },
                    timeProgress,
                    deliveryProgress,
                    requiredDaily: Math.max(0, requiredDaily),
                    currentDaily: recentDailyAvg,
                    pressure: recalcPressure,
                    isDelayedButHealthy,
                    diagnostics,
                    score,
                    bi: { trend: realTrend, deliveredToday: apiAvailable ? deliveredTodayFromAPI : Math.max(0, currentDaily), recommendations, history: finalHistory }
                }
            })
        )

        const onTrackCount = formattedCampaigns.filter(c => c.status === 'on-track' || c.status === 'over').length
        const total = formattedCampaigns.length
        const healthScore = total > 0 ? Math.round(safeDivide(onTrackCount, total) * 100) : 100
        const atRiskCount = formattedCampaigns.filter(c => c.status === 'critical' || c.status === 'warning').length

        // BI Aggregations
        const globalGoal = formattedCampaigns.reduce((sum, c) => sum + c.goalImpressions, 0)
        const globalDelivered = formattedCampaigns.reduce((sum, c) => sum + c.deliveredImpressions, 0)
        const globalToday = formattedCampaigns.reduce((sum, c) => sum + (c.bi?.deliveredToday || 0), 0)
        const globalProjected = formattedCampaigns.reduce((sum, c) => sum + (c.projection?.total || 0), 0)
        const avgViewability = total > 0 ? formattedCampaigns.reduce((sum, c) => sum + c.viewability, 0) / total : 0

        const result = { 
            total, 
            onTrackCount, 
            healthScore, 
            atRiskCount, 
            globalGoal,
            globalDelivered,
            globalToday,
            globalProjected,
            avgViewability,
            campaigns: formattedCampaigns 
        }
        metricsCache = { data: result, timestamp: Date.now() }
        isRefreshing = false
        return result
    } catch (error) {
        isRefreshing = false
        console.error('Failed to get aggregated metrics:', error)
        throw error
    }
}
