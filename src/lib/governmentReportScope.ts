export const CAPTURE_CADENCES = ['DAILY', 'BOUNDARY'] as const
export type CaptureCadence = (typeof CAPTURE_CADENCES)[number]

export function normalizeCaptureCadence(segmentation: string, cadence?: string | null): CaptureCadence {
    if (segmentation.trim().toUpperCase() !== 'GOV_FEDERAL') return 'DAILY'
    return cadence?.trim().toUpperCase() === 'DAILY' ? 'DAILY' : 'BOUNDARY'
}

export function campaignReportScopeKey(pi: string, flightEnd: Date) {
    return `CAMPAIGN:${pi}:${flightEnd.getTime()}`
}

export function dailyReportScopeKey(pi: string, dateKey: string) {
    return `DAY:${pi}:${dateKey}`
}

export function getBrasiliaDayRange(dateKey: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
        throw new Error('Data do book invalida')
    }

    const start = new Date(`${dateKey}T00:00:00.000-03:00`)
    if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== dateKey) {
        throw new Error('Data do book invalida')
    }

    return {
        start,
        end: new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1),
    }
}
