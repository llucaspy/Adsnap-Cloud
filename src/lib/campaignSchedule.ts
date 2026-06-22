import { normalizeCaptureCadence } from './governmentReportScope'

const BRASILIA_TIME_ZONE = 'America/Sao_Paulo'

export type ScheduledCampaign = {
    segmentation: string
    captureCadence: string | null
    flightStart: Date | null
    flightEnd: Date | null
    scheduledTimes: string | null
    lastCaptureAt: Date | null
}

type BrasiliaClock = {
    dateKey: string
    minuteOfDay: number
}

function getBrasiliaClock(date: Date): BrasiliaClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BRASILIA_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value)
    const year = value('year')
    const month = value('month')
    const day = value('day')
    const hour = value('hour')
    const minute = value('minute')

    return {
        dateKey: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
        minuteOfDay: (hour * 60) + minute,
    }
}

export function getCampaignDateKey(date: Date) {
    const isLegacyUtcDate = date.getUTCHours() === 0
        && date.getUTCMinutes() === 0
        && date.getUTCSeconds() === 0
        && date.getUTCMilliseconds() === 0

    // Older records stored date-only values at UTC midnight. Converting those
    // to Brasilia would incorrectly move them to the previous calendar day.
    return isLegacyUtcDate ? date.toISOString().slice(0, 10) : getBrasiliaClock(date).dateKey
}

function readScheduledMinutes(raw: string | null) {
    try {
        const values = JSON.parse(raw || '[]') as unknown
        if (!Array.isArray(values)) return []

        return values.flatMap(value => {
            if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return []
            const [hour, minute] = value.split(':').map(Number)
            if (hour > 23 || minute > 59) return []
            return [(hour * 60) + minute]
        })
    } catch {
        return []
    }
}

export function shouldQueueScheduledCampaign(campaign: ScheduledCampaign, now = new Date()) {
    const clock = getBrasiliaClock(now)
    const startKey = campaign.flightStart ? getCampaignDateKey(campaign.flightStart) : null
    const endKey = campaign.flightEnd ? getCampaignDateKey(campaign.flightEnd) : null
    const isFederal = campaign.segmentation.trim().toUpperCase() === 'GOV_FEDERAL'
    const isBoundaryFederal = isFederal
        && normalizeCaptureCadence(campaign.segmentation, campaign.captureCadence) === 'BOUNDARY'
    const hasNoFlightDates = !startKey && !endKey

    if (isBoundaryFederal) {
        if (!startKey || !endKey || (clock.dateKey !== startKey && clock.dateKey !== endKey)) return false
    } else if (!hasNoFlightDates) {
        if (!startKey || !endKey || clock.dateKey < startKey || clock.dateKey > endKey) return false
    }

    const scheduledMinutes = readScheduledMinutes(campaign.scheduledTimes)
    if (scheduledMinutes.length === 0) return false

    const lastCaptureClock = campaign.lastCaptureAt ? getBrasiliaClock(campaign.lastCaptureAt) : null
    if (isBoundaryFederal && lastCaptureClock?.dateKey === clock.dateKey) return false

    return scheduledMinutes.some(scheduledMinute => {
        if (clock.minuteOfDay < scheduledMinute) return false
        if (!lastCaptureClock || lastCaptureClock.dateKey < clock.dateKey) return true
        return lastCaptureClock.dateKey === clock.dateKey && lastCaptureClock.minuteOfDay < scheduledMinute
    })
}

export function isFederalCampaignBoundaryToday(campaign: ScheduledCampaign, now = new Date()) {
    if (campaign.segmentation.trim().toUpperCase() !== 'GOV_FEDERAL') return false
    if (normalizeCaptureCadence(campaign.segmentation, campaign.captureCadence) !== 'BOUNDARY') return false
    const todayKey = getBrasiliaClock(now).dateKey
    const startKey = campaign.flightStart ? getCampaignDateKey(campaign.flightStart) : null
    const endKey = campaign.flightEnd ? getCampaignDateKey(campaign.flightEnd) : null
    return Boolean(startKey && endKey && (todayKey === startKey || todayKey === endKey))
}
