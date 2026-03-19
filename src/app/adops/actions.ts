'use server'

import prisma from '@/lib/prisma'
import { getLiveMetrics, type LiveMetricsResult } from '@/app/monitoring/actions'
import { nexusLogStore } from '@/lib/nexusLogStore'
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const isDev = process.env.NODE_ENV === 'development'

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
export async function getAggregatedAdOpsMetrics() {
    try {
        const campaigns = await prisma.campaign.findMany({
            where: {
                isArchived: false,
                externalAuthUrl: { not: "" }
            }
        })

        if (campaigns.length === 0) {
            return {
                total: 0,
                onTrackCount: 0,
                healthScore: 100,
                atRiskCount: 0,
                campaigns: []
            }
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
                const manualDashboardUrl = group.find(c => c.manualDashboardUrl)?.manualDashboardUrl || null

                // Fetch real metrics
                const result: LiveMetricsResult = await getLiveMetrics(monitoringCampaign.id)
                const apiAvailable = result.success && !!result.data

                // BI Agent History (fallback source)
                const metricHistory = await prisma.dailyMetric.findMany({
                    where: { campaignId: pi },
                    orderBy: { date: 'desc' },
                    take: 7
                })

                // -------------------------------------------------------
                // Step 1: Extract totals from API purchases
                // -------------------------------------------------------
                let totalDelivered = 0
                let totalGoal = 0
                let avgViewability = 0
                let metricsCount = 0
                const formats: FormatEntry[] = []

                if (apiAvailable && result.data) {
                    const sites = result.data.sites || []

                    for (const site of sites) {
                        if (!site.purchases) continue
                        const purchasesList = Array.isArray(site.purchases) ? site.purchases : [site.purchases]

                        for (const purchase of purchasesList) {
                            if (!purchase.cpm) continue

                            const q = purchase.cpm.quantity || 0
                            // Use impressions (consistent with 00px dashboard), fallback to valids
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

                    if (metricsCount > 0) {
                        avgViewability = safeDivide(avgViewability, metricsCount)
                    }
                } else {
                    // API unavailable — log and flag, but DON'T inject fake data
                    if (result.error) {
                        await nexusLogStore.addLog(
                            `PI ${pi}: API indisponível — ${result.error}`,
                            'API_ERROR', undefined, monitoringCampaign.id
                        )
                    }
                }

                // If no goal from API, we can't calculate meaningful KPIs
                if (totalGoal === 0) {
                    totalGoal = group.length * 1_000_000 // minimal fallback to prevent div/0
                }

                // -------------------------------------------------------
                // Step 2: Time calculations
                // -------------------------------------------------------
                const MS_PER_DAY = 86400000
                const allStarts = group.filter(c => c.flightStart).map(c => new Date(c.flightStart!).getTime())
                const allEnds = group.filter(c => c.flightEnd).map(c => new Date(c.flightEnd!).getTime())

                const start = allStarts.length ? Math.min(...allStarts) : Date.now() - (7 * MS_PER_DAY)
                const end = allEnds.length ? Math.max(...allEnds) : Date.now() + (30 * MS_PER_DAY)

                const s = startOfDay(new Date(start))
                const e = startOfDay(new Date(end))
                const n = startOfDay(new Date())

                const elapsedDays = Math.max(1, differenceInCalendarDays(n, s) + 1)
                const totalDays = Math.max(1, differenceInCalendarDays(e, s) + 1)
                const daysLeft = Math.max(1, totalDays - elapsedDays)

                const safeGoal = Math.max(1, Number(totalGoal))
                const safeDelivered = Math.max(0, Number(totalDelivered))

                // -------------------------------------------------------
                // Step 3: KPI Calculations (with safe division)
                // -------------------------------------------------------
                const timeProgress = Math.min(100, safeDivide(elapsedDays, totalDays) * 100)
                const deliveryProgress = safeDivide(safeDelivered, safeGoal) * 100
                const pacing = safeDivide(safeDelivered / safeGoal, elapsedDays / totalDays, 0)
                const pacingPercent = pacing * 100

                const currentDaily = safeDivide(safeDelivered, elapsedDays)
                const remaining = Math.max(0, safeGoal - safeDelivered)
                const requiredDaily = safeDivide(remaining, daysLeft)
                const pressure = safeDivide(requiredDaily, Math.max(1, currentDaily), 1)

                const projectedFinalValue = currentDaily * totalDays
                const projectionPercent = safeDivide(projectedFinalValue, safeGoal) * 100

                // -------------------------------------------------------
                // Step 4: Status Classification
                // -------------------------------------------------------
                let status: 'on-track' | 'warning' | 'critical' | 'over' = 'on-track'

                if (projectionPercent < 85 || pressure > 1.3) {
                    status = 'critical'
                } else if (projectionPercent < 95 || pressure > 1.15) {
                    status = 'warning'
                } else if (pacingPercent >= 105) {
                    status = 'over'
                }

                const isDelayedButHealthy = pacingPercent >= 95 && projectionPercent < 95

                // BI Score (0–100)
                let score = 100
                if (status === 'critical') score = 40
                else if (status === 'warning') score = 75
                else if (status === 'on-track' && isDelayedButHealthy) score = 85
                if (avgViewability < 60) score -= (60 - avgViewability) * 0.5
                score = Math.max(0, Math.min(100, Math.round(score)))

                // Dev-only debug log
                if (isDev) {
                    console.log(`[BI] PI ${pi}: delivered=${safeDelivered} goal=${safeGoal} proj=${projectionPercent.toFixed(1)}% status=${status}`)
                }

                // -------------------------------------------------------
                // Step 5: Daily impressions from data_by_date_purchase
                // -------------------------------------------------------
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

                // Build history array sorted by date
                const realHistoryArr = Array.from(dailyMap.entries())
                    .map(([date, value]) => {
                        const [d, m, y] = date.split('/').map(Number)
                        return { date: new Date(y, m - 1, d).toISOString(), value }
                    })
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

                // Recent velocity (last 3 days average)
                const last3Days = realHistoryArr.slice(-3)
                const recentDailyAvg = last3Days.length > 0
                    ? last3Days.reduce((sum, h) => sum + h.value, 0) / last3Days.length
                    : currentDaily

                // Trend detection
                const yesterdayVal = realHistoryArr.length >= 2 ? realHistoryArr[realHistoryArr.length - 2].value : 0
                const realTrend: 'up' | 'down' | 'neutral' = realHistoryArr.length >= 1
                    ? (deliveredTodayFromAPI > yesterdayVal ? 'up' : deliveredTodayFromAPI < yesterdayVal ? 'down' : 'neutral')
                    : 'neutral'

                // Use API history when available, fallback to DB history
                const finalHistory = realHistoryArr.length > 0
                    ? realHistoryArr.slice(-7).map(h => ({ date: h.date, value: h.value }))
                    : metricHistory.map(h => ({ date: h.date.toISOString(), value: h.delivered }))

                const finalDeliveredToday = apiAvailable ? deliveredTodayFromAPI : Math.max(0, currentDaily)

                // -------------------------------------------------------
                // Step 6: Diagnostics & Recommendations
                // -------------------------------------------------------
                const diagnostics: string[] = []
                const smartAlert = isDelayedButHealthy ? '⚠️ Risco Oculto: Pacing OK mas projeção baixa' : null
                if (smartAlert) diagnostics.push(smartAlert)
                if (pressure > 1.2) diagnostics.push(`Pressão de entrega ALTA (${pressure.toFixed(2)}x)`)
                if (avgViewability < 60) diagnostics.push(`Viewability baixa (${avgViewability.toFixed(0)}%)`)
                if (!apiAvailable) diagnostics.push('⚠️ API 00px indisponível — dados podem estar desatualizados')

                const recommendations: string[] = []
                if (pressure > 1.1) recommendations.push(`Necessário acelerar entrega em ${((pressure - 1) * 100).toFixed(0)}%`)
                if (avgViewability < 55) recommendations.push("Otimizar inventário / whitelist")
                if (daysLeft < 3 && projectionPercent < 98) recommendations.push("Aceleração máxima imediata")

                // -------------------------------------------------------
                // Step 7: Return campaign object
                // -------------------------------------------------------
                const recalcPressure = safeDivide(requiredDaily, Math.max(1, recentDailyAvg), 1)

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
                    fetchedAt: result.fetchedAt || null,
                    projection: {
                        completion: projectedFinalValue,
                        completionPercent: projectionPercent,
                        total: projectedFinalValue,
                        dailyRate: currentDaily
                    },
                    timeProgress,
                    deliveryProgress,
                    requiredDaily: Math.max(0, requiredDaily),
                    currentDaily: recentDailyAvg,
                    pressure: recalcPressure,
                    isDelayedButHealthy,
                    diagnostics,
                    smartAlert,
                    score,
                    bi: {
                        trend: realTrend,
                        deliveredToday: finalDeliveredToday,
                        recommendations,
                        history: finalHistory
                    }
                }
            })
        )

        const onTrackCount = formattedCampaigns.filter(c => c.status === 'on-track' || c.status === 'over').length
        const total = formattedCampaigns.length
        const healthScore = total > 0 ? Math.round(safeDivide(onTrackCount, total) * 100) : 100
        const atRiskCount = formattedCampaigns.filter(c => c.status === 'critical' || c.status === 'warning').length

        return {
            total,
            onTrackCount,
            healthScore,
            atRiskCount,
            campaigns: formattedCampaigns
        }
    } catch (error) {
        console.error('Failed to get aggregated metrics:', error)
        throw error
    }
}
