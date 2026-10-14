import test from 'node:test'
import assert from 'node:assert/strict'
import { confirmedQueueSuccess } from '../src/lib/queueTransitions'

const previous = { id: 'c1', updatedAt: '2026-10-14T12:00:00Z', processingStartedAt: '2026-10-14T12:01:00Z' }

test('leaving a limited queue after failure, cancellation or pagination is never success', () => {
    for (const status of ['FAILED', 'QUARANTINE', 'QUEUED', 'PROCESSING', 'CANCELLED', 'PENDING']) {
        assert.equal(confirmedQueueSuccess(previous, { id: 'c1', status, lastCaptureAt: '2026-10-14T12:02:00Z' }), false)
    }
    assert.equal(confirmedQueueSuccess(previous, undefined), false)
})

test('an older capture cannot trigger a completion notification for the current attempt', () => {
    assert.equal(confirmedQueueSuccess(previous, { id: 'c1', status: 'SUCCESS', lastCaptureAt: '2026-10-14T11:00:00Z' }), false)
    assert.equal(confirmedQueueSuccess(previous, { id: 'another', status: 'SUCCESS', lastCaptureAt: '2026-10-14T12:02:00Z' }), false)
    assert.equal(confirmedQueueSuccess(previous, { id: 'c1', status: 'SUCCESS', lastCaptureAt: null }), false)
})

test('success requires an explicit terminal state and a capture from this processing interval', () => {
    assert.equal(confirmedQueueSuccess(previous, { id: 'c1', status: 'SUCCESS', lastCaptureAt: new Date('2026-10-14T12:02:00Z') }), true)
})
