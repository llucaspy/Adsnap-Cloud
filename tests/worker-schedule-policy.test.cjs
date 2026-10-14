const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const schedule = require('../src/lib/campaignSchedule.ts')

const now = new Date('2026-10-14T15:00:00Z')
const campaign = (id, extra = {}) => ({ id, client: 'Fixture', pi: 'TEST', isScheduled: true, isArchived: false,
    status: 'PENDING', segmentation: 'PRIVADO', captureCadence: 'DAILY', flightStart: new Date('2026-10-01T00:00:00Z'),
    flightEnd: new Date('2026-10-14T00:00:00Z'), scheduledTimes: '["09:00"]', lastCaptureAt: null, ...extra })

function functions(prisma, enqueue = async () => ({ created: 0, campaignIds: [] })) {
    let source = fs.readFileSync('src/scripts/worker.ts', 'utf8')
        .replace(/^import\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^export\s+/gm, '')
    source = source.slice(0, source.indexOf('startWorker().catch'))
    const context = vm.createContext({ ...schedule, Date, Error, Buffer, AbortController, setTimeout, clearTimeout,
        process: { env: {} }, console: { log() {}, warn() {}, error() {} }, prisma,
        nexusLogStore: { addLog: async () => {} }, enqueueCaptureJobs: enqueue, WORKER_JOB_TYPE_CAPTURE: 'CAPTURE' })
    vm.runInContext(stripTypeScriptTypes(source + '\nglobalThis.unit={queueFinalDayRecoveryCaptures,cleanupOffScheduleFederalQueue}'), context)
    return context.unit
}

test('closing recovery respects manual mode, terminal states and the configured time', async () => {
    let query
    const rows = [campaign('manual', { isScheduled: false }), campaign('failed', { status: 'FAILED' }),
        campaign('quarantine', { status: 'QUARANTINE' }), campaign('future', { scheduledTimes: '["18:00"]' }), campaign('due')]
    const requests = []
    const unit = functions({ campaign: { findMany: async input => { query = input; return rows } } }, async (ids, options) => {
        requests.push({ ids: [...ids], options }); return { created: ids.length, campaignIds: ids }
    })
    await unit.queueFinalDayRecoveryCaptures(now)
    assert.deepEqual(requests.map(item => item.ids), [['due']])
    assert.equal(query.where.isScheduled, true)
    assert.ok(query.where.status.notIn.includes('QUARANTINE'))
    assert.equal(query.where.flightEnd.gte.toISOString(), '2026-10-14T00:00:00.000Z')
    assert.equal(requests[0].options.allowTerminalStatuses, false)
    assert.equal(requests[0].options.maxAttempts, undefined)
})

test('closing recovery continues past a full page of unrelated civil dates', async () => {
    const calls = [], requests = []
    const first = Array.from({ length: 250 }, (_, i) => campaign(`early-${i}`, { flightEnd: new Date('2026-10-15T00:00:00Z') }))
    const unit = functions({ campaign: { findMany: async input => { calls.push(input); return calls.length === 1 ? first : [campaign('due-after-page')] } } }, async ids => {
        requests.push(...ids); return { created: ids.length, campaignIds: ids }
    })
    await unit.queueFinalDayRecoveryCaptures(now)
    assert.deepEqual(requests, ['due-after-page'])
    assert.equal(calls.length, 2)
    assert.equal(calls[1].cursor.id, 'early-249')
    assert.equal(calls[1].skip, 1)
    assert.equal(calls[1].orderBy.id, 'asc')
})

test('boundary cleanup cancels automatic queued jobs while preserving manual requests and live claims', async () => {
    const writes = [], campaignWrites = []
    const rows = ['automatic', 'manual', 'running'].map(id => campaign(id, { status: 'QUEUED', segmentation: 'GOV_FEDERAL', captureCadence: 'BOUNDARY', flightEnd: new Date('2026-10-20T00:00:00Z') }))
    const prisma = { campaign: { findMany: async () => rows }, $transaction: async callback => {
        let id
        return callback({
            $queryRawUnsafe: async (_query, value) => { id = value; return [{ id }] },
            workerJob: {
                findMany: async () => [{ id: `job-${id}`, status: id === 'running' ? 'PROCESSING' : 'QUEUED', payload: { source: id === 'manual' ? 'manual-single' : 'worker-schedule' } }],
                updateMany: async input => { writes.push(input); return { count: 1 } },
            },
            campaign: { updateMany: async input => { campaignWrites.push(input); return { count: 1 } } },
        })
    } }
    await functions(prisma).cleanupOffScheduleFederalQueue(now)
    assert.equal(writes.length, 1)
    assert.equal(writes[0].where.id.in[0], 'job-automatic')
    assert.equal(writes[0].data.status, 'CANCELLED')
    assert.equal(campaignWrites.length, 1)
    assert.equal(campaignWrites[0].where.id, 'automatic')
})
