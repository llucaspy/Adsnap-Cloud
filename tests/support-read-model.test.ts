import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supportFlightState } from '../src/lib/supportReadModel'

const now = new Date('2026-11-03T23:00:00-03:00')
const campaign = { flightStart: new Date('2026-11-03T00:00:00Z'), flightEnd: new Date('2026-11-03T00:00:00Z'), adOpsStatus: 'ATIVA', status: 'FAILED' }
test('live flight includes final civil day in Brasilia and capture failure does not end flight', () => {
    assert.equal(supportFlightState(campaign, now), 'ACTIVE')
    assert.equal(supportFlightState({ ...campaign, status: 'QUARANTINE' }, now), 'ACTIVE')
    assert.equal(supportFlightState(campaign, new Date('2026-11-04T03:00:00Z')), 'FINISHED')
})
test('flight distinguishes unknown dates, future, paused, finished and actual zoned dates', () => {
    assert.equal(supportFlightState({ ...campaign, flightStart: null }, now), 'NO_DATES')
    assert.equal(supportFlightState({ ...campaign, flightStart: new Date('2026-11-04T00:00:00Z') }, now), 'UPCOMING')
    assert.equal(supportFlightState({ ...campaign, adOpsStatus: 'PAUSADA' }, now), 'INACTIVE')
    assert.equal(supportFlightState({ ...campaign, status: 'FINISHED' }, now), 'FINISHED')
    assert.equal(supportFlightState({ ...campaign, flightEnd: new Date('2026-11-04T02:30:00Z') }, now), 'ACTIVE')
})
