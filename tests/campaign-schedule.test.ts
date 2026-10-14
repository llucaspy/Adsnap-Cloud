import assert from 'node:assert/strict'
import test from 'node:test'
import { getCampaignDateKey, isCampaignFinalDayToday, isCampaignStartDayToday, isFederalCampaignBoundaryToday, shouldQueueScheduledCampaign } from '../src/lib/campaignSchedule'

const campaign = { segmentation: 'GOV_FEDERAL', captureCadence: 'BOUNDARY', flightStart: new Date('2026-10-14T00:00:00Z'), flightEnd: new Date('2026-10-20T00:00:00Z'), scheduledTimes: '["12:00"]', lastCaptureAt: null }

test('legacy UTC date maps to exactly one civil day in all boundary helpers', () => {
    assert.equal(getCampaignDateKey(campaign.flightStart), '2026-10-14')
    for (const [day, expected] of [['13', false], ['14', true], ['15', false]] as const) {
        const now = new Date(`2026-10-${day}T16:00:00Z`)
        assert.equal(isCampaignStartDayToday(campaign, now), expected)
        assert.equal(isFederalCampaignBoundaryToday(campaign, now), expected)
        assert.equal(shouldQueueScheduledCampaign(campaign, now), expected)
    }
})

test('closing legacy date does not start recovery on previous Brasilia date', () => {
    assert.equal(isCampaignFinalDayToday(campaign, new Date('2026-10-19T23:00:00Z')), false)
    assert.equal(isCampaignFinalDayToday(campaign, new Date('2026-10-20T03:00:00Z')), true)
    assert.equal(isCampaignFinalDayToday(campaign, new Date('2026-10-21T03:00:00Z')), false)
})

test('timestamps stored at Brasilia midnight preserve intended start and end dates', () => {
    const modern = { ...campaign, flightStart: new Date('2026-12-31T03:00:00Z'), flightEnd: new Date('2027-01-01T03:00:00Z') }
    assert.equal(isCampaignStartDayToday(modern, new Date('2026-12-31T15:00:00Z')), true)
    assert.equal(isCampaignFinalDayToday(modern, new Date('2026-12-31T23:59:00Z')), false)
    assert.equal(isCampaignFinalDayToday(modern, new Date('2027-01-01T03:00:00Z')), true)
})
