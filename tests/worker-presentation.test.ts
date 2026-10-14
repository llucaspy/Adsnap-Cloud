import test from 'node:test'
import assert from 'node:assert/strict'
import { groupWorkerRunLogs, hasExpiredLease, readWorkerBatchSize, workerJobHref } from '../src/lib/workerPresentation'

test('batch configuration cannot become zero or Infinity', () => {
    for (const invalid of ['0.5', '0', '-1', 'invalid', undefined]) assert.equal(readWorkerBatchSize(invalid), 5)
    assert.equal(readWorkerBatchSize('8'), 8)
    assert.equal(readWorkerBatchSize('200'), 20)
})

test('events from one run become one card with its newest outcome', () => {
    const logs = ['Ciclo iniciado', 'Processando lote 1', 'Ciclo finalizado'].map((message, i) => ({
        id: `log-${i}`, level: i === 2 ? 'SUCCESS' : 'SYSTEM', message: `Nexus Worker: ${message}`,
        details: JSON.stringify({ runId: 'run-1' }), createdAt: new Date(1000 * i),
    }))
    const cards = groupWorkerRunLogs(logs)
    assert.equal(cards.length, 1)
    assert.equal(cards[0].log.level, 'SUCCESS')
    assert.equal(cards[0].log.id, 'log-2')
})

test('job history preserves job identity and never links to metrics', () => {
    assert.equal(workerJobHref({ id: 'same-campaign', jobId: 'job-old' }), '/workers/jobs/job-old')
    assert.notEqual(workerJobHref({ id: 'same-campaign', jobId: 'job-old' }), workerJobHref({ id: 'same-campaign', jobId: 'job-new' }))
    assert.equal(workerJobHref({ id: 'legacy' }), '/workers/campaigns/legacy')
})

test('a long running task with a valid lease is not labeled expired', () => {
    const now = Date.parse('2026-10-14T15:00:00Z')
    assert.equal(hasExpiredLease({ status: 'PROCESSING', lockedUntil: '2026-10-14T15:05:00Z' }, now), false)
    assert.equal(hasExpiredLease({ status: 'PROCESSING', lockedUntil: '2026-10-14T14:59:00Z' }, now), true)
    assert.equal(hasExpiredLease({ status: 'FAILED', lockedUntil: '2026-10-14T14:59:00Z' }, now), false)
})
