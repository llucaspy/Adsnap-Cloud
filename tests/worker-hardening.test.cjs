const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const { randomUUID } = require('node:crypto')
const root = path.resolve(__dirname, '..')
function source(file) {
    return fs.readFileSync(path.join(root, file), 'utf8')
        .replace(/^import\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^export\s+/gm, '')
}
function load(file, names, bindings = {}, patch = '') {
    let code = source(file)
    if (file.endsWith('worker.ts')) code = code.slice(0, code.indexOf('startWorker().catch'))
    const logs = []
    const context = vm.createContext({
        Error, Date, Buffer, randomUUID, setTimeout, clearTimeout, AbortController,
        console: { log() {}, warn() {}, error() {} }, process: { env: {}, exit() {} },
        normalizeCaptureDelaySeconds: value => Math.min(10, Math.max(1, Number(value ?? 3))),
        WORKER_JOB_TYPE_CAPTURE: 'CAPTURE', WORKER_JOB_STATUS_QUEUED: 'QUEUED',
        WORKER_JOB_STATUS_PROCESSING: 'PROCESSING', WORKER_JOB_STATUS_SUCCESS: 'SUCCESS', WORKER_JOB_STATUS_FAILED: 'FAILED',
        isWorkerJobStorageMissing: error => error?.code === 'P2021',
        nexusLogStore: { addLog: async (message, type, details) => logs.push({ message, type, details }) },
        CAPTURE_ATTEMPT_EVENT: 'Nexus: tentativa de captura',
        reconcileCaptureIncidents: async () => {}, dispatchCaptureIncidentAlerts: async () => {},
        processCampaign: async () => ({ success: true }), processComposition: async () => ({ success: true }),
        processGovernmentReportQueue: async () => {}, processPendingGamJobs: async () => {},
        ...bindings,
    })
    vm.runInContext(stripTypeScriptTypes(code + '\n' + patch + '\nglobalThis.unit = {' + names.join(',') + '};'), context)
    return { unit: context.unit, logs, context }
}
const ownership = load('src/lib/captureOwnership.ts', ['assertCaptureOwnership', 'completeCaptureOwnership', 'CaptureOwnershipLostError']).unit
const worker = (names, prisma, extra, patch) => load('src/scripts/worker.ts', names, { prisma, ...ownership, ...extra }, patch)
const summary = () => ({ claimed: 1, success: 0, failed: 0, timeout: 0, quarantine: 0, requeued: 0,
    deadletter: 0, ownershipLost: 0, cycleErrors: 0, unconfirmed: 0 })
const job = () => ({ id: 'campaign-1', jobId: 'job-1', runId: 'run-A', attempts: 1, maxAttempts: 2, captureDelaySeconds: 1 })

test('each retry emits an identified start and retry outcome for the same attempt', async () => {
    const tx = { workerJob: { updateMany: async () => ({ count: 1 }) }, campaign: { updateMany: async () => ({ count: 1 }) } }
    const state = summary()
    const { unit, logs } = worker(['processWorkerCaptureJob'], { $transaction: callback => callback(tx) }, {
        assertCaptureOwnership: async () => {}, processCampaign: async () => ({ success: false, error: 'Timeout de 120s' }),
    })
    await unit.processWorkerCaptureJob(job(), null, state)
    const events = logs.filter(log => log.message === 'Nexus: tentativa de captura').map(log => JSON.parse(log.details))
    assert.deepEqual(events.map(event => event.phase), ['STARTED', 'RETRY'])
    for (const event of events) { assert.equal(event.jobId, 'job-1'); assert.equal(event.attempt, 1); assert.equal(event.runId, 'run-A') }
    assert.equal(state.requeued, 1); assert.equal(state.failed, 0)
})

test('non-retryable quarantine emits its terminal diagnosis without requeueing', async () => {
    const state = summary()
    const { unit, logs } = worker(['processWorkerCaptureJob'], { workerJob: { updateMany: async () => ({ count: 1 }) } }, {
        processCampaign: async () => ({ success: false, quarantined: true, error: 'Invalid destination' }),
    })
    await unit.processWorkerCaptureJob(job(), null, state)
    const events = logs.filter(log => log.message === 'Nexus: tentativa de captura').map(log => JSON.parse(log.details))
    assert.deepEqual(events.map(event => event.phase), ['STARTED', 'QUARANTINE'])
    assert.equal(state.quarantine, 1); assert.equal(state.requeued, 0)
})

test('integer parser rejects fractions and run ID is unique even within the same GitHub run', () => {
    const { unit } = worker(['readPositiveInt', 'createWorkerRunId'], {}, { process: { env: { GITHUB_RUN_ID: '123' } } })
    for (const value of ['0.5', '-1', 'NaN', 'Infinity', '1.1']) assert.equal(unit.readPositiveInt(value, 2, 4), 2)
    assert.equal(unit.readPositiveInt('7', 2, 4), 4)
    assert.notEqual(unit.createWorkerRunId(), unit.createWorkerRunId())
})

test('enqueue is serialized inside transaction and creates one active job for concurrent requests', async () => {
    const jobs = []; const campaign = { id: 'campaign-1', status: 'PENDING' }; let tail = Promise.resolve()
    const tx = { $queryRawUnsafe: async sql => { assert.match(sql, /order by id for update/); return [campaign] },
        workerJob: { findMany: async () => jobs, createMany: async ({ data }) => jobs.push(...data) },
        campaign: { updateMany: async ({ data }) => { Object.assign(campaign, data); return { count: 1 } } } }
    const prisma = { $transaction: callback => {
        const result = tail.then(() => callback(tx)); tail = result.catch(() => {}); return result
    } }
    const { unit } = load('src/lib/workerJobs.ts', ['enqueueCaptureJobs'], { prisma })
    const responses = await Promise.all([unit.enqueueCaptureJobs([campaign.id]), unit.enqueueCaptureJobs([campaign.id])])
    assert.equal(jobs.length, 1); assert.equal(responses.reduce((n, response) => n + response.created, 0), 1)
})

test('failed enqueue does not reset campaign state before job insert', async () => {
    let campaignWrites = 0
    const tx = { $queryRawUnsafe: async () => [{ id: 'campaign-1' }],
        workerJob: { findMany: async () => [], createMany: async () => { throw Error('job insert failed') } },
        campaign: { updateMany: async () => { campaignWrites++; return { count: 1 } } } }
    const { unit } = load('src/lib/workerJobs.ts', ['enqueueCaptureJobs'], { prisma: { $transaction: callback => callback(tx) } })
    await assert.rejects(unit.enqueueCaptureJobs(['campaign-1']), /job insert failed/)
    assert.equal(campaignWrites, 0)
})

test('claim job and campaign writes are in one rollback boundary', async () => {
    let status = 'QUEUED', transactionCalls = 0
    const tx = { $queryRawUnsafe: async sql => {
        if (sql.includes('join lateral')) { assert.match(sql, /for update of c skip locked/); return [{ id: 'campaign-1' }] }
        status = 'PROCESSING'; return [job()]
    }, campaign: { updateMany: async () => { throw Error('campaign unavailable') } } }
    const prisma = { $transaction: async callback => {
        transactionCalls++; const before = status
        try { return await callback(tx) } catch (error) { status = before; throw error }
    } }
    const { unit } = worker(['claimWorkerJobBatch'], prisma)
    await assert.rejects(unit.claimWorkerJobBatch('run-A', 1, new Date()), /campaign unavailable/)
    assert.equal(transactionCalls, 1); assert.equal(status, 'QUEUED')
})

test('ownership guard rejects expired or replaced campaign before writing job', async () => {
    let queries = 0
    const tx = { $queryRawUnsafe: async sql => { queries++; assert.match(sql, /"lockedUntil" > \(now\(\) at time zone 'UTC'\)/); return [] } }
    await assert.rejects(ownership.assertCaptureOwnership(tx, { campaignId: 'campaign-1', runId: 'old', jobId: 'job-1', attempt: 1 }), ownership.CaptureOwnershipLostError)
    assert.equal(queries, 1)
})

test('obsolete completion requires exact job owner and attempt', async () => {
    const tx = { workerJob: { updateMany: async ({ where }) => {
        assert.equal(where.runId, 'old'); assert.equal(where.attempts, 1); assert.equal(where.status, 'PROCESSING'); return { count: 0 }
    } } }
    await assert.rejects(ownership.completeCaptureOwnership(tx, { campaignId: 'campaign-1', runId: 'old', jobId: 'job-1', attempt: 1 }), ownership.CaptureOwnershipLostError)
})

test('lease recovery cannot resurrect a job completed after stale read', async () => {
    let campaignWrites = 0
    const tx = { $queryRawUnsafe: async () => [{ id: 'campaign-1' }], workerJob: { updateMany: async ({ where }) => {
        assert.equal(where.status, 'PROCESSING'); assert.equal(where.runId, 'run-A'); assert.equal(where.attempts, 1)
        assert.ok(where.lockedUntil.lt); return { count: 0 }
    } }, campaign: { updateMany: async () => { campaignWrites++; return { count: 1 } } } }
    const prisma = { workerJob: { findMany: async () => [{ id: 'job-1', campaignId: 'campaign-1', runId: 'run-A', attempts: 1, maxAttempts: 2 }] },
        $transaction: callback => callback(tx) }
    await worker(['cleanupStuckWorkerJobs'], prisma).unit.cleanupStuckWorkerJobs()
    assert.equal(campaignWrites, 0)
})

test('lost owner cannot requeue a new claim', async () => {
    const prisma = { $transaction: callback => callback({ $queryRawUnsafe: async () => [] }) }
    const state = summary()
    await worker(['retryOrFailWorkerJob'], prisma).unit.retryOrFailWorkerJob(job(), 'old timeout', state)
    assert.equal(state.requeued, 0); assert.equal(state.failed, 0); assert.equal(state.ownershipLost, 1)
})

test('unreadable ACK after capture success never triggers capture retry or double counts', async () => {
    let transactions = 0
    const prisma = { workerJob: { updateMany: async () => { throw Error('ACK DB unavailable') } },
        $transaction: async () => { transactions++ } }
    const state = summary()
    await worker(['processWorkerCaptureJob'], prisma).unit.processWorkerCaptureJob(job(), null, state)
    assert.equal(state.success, 0); assert.equal(state.failed, 0); assert.equal(state.requeued, 0)
    assert.equal(state.cycleErrors, 1); assert.equal(state.unconfirmed, 1); assert.equal(transactions, 0)
})

test('capture ACK already committed atomically is accepted without second terminal outcome', async () => {
    const prisma = { workerJob: { updateMany: async () => ({ count: 0 }), findFirst: async ({ where }) => {
        assert.equal(where.runId, 'run-A'); assert.equal(where.status, 'SUCCESS'); return { id: 'job-1' }
    } } }
    const state = summary()
    await worker(['processWorkerCaptureJob'], prisma).unit.processWorkerCaptureJob(job(), null, state)
    assert.equal(state.success, 1); assert.equal(state.failed, 0); assert.equal(state.requeued, 0)
})

test('legacy fallback SQL excludes queued and processing jobs, including future jobs', async () => {
    const prisma = { $queryRawUnsafe: async sql => {
        assert.match(sql, /not exists[\s\S]*"WorkerJob"[\s\S]*'QUEUED', 'PROCESSING'/)
        return []
    } }
    await worker(['claimCampaignBatch'], prisma).unit.claimCampaignBatch(['campaign-1'], 'run-A', 1)
})

test('timeout budget remains below the lease', () => {
    const { unit } = worker(['deriveCaptureTimeoutMs'], {}, { process: { env: { NEXUS_CAPTURE_LEASE_MINUTES: '1' } } })
    assert.equal(unit.deriveCaptureTimeoutMs(10, 20 * 60_000), 30_000)
})

test('a cycle with retries waiting is deferred even when other captures succeeded', () => {
    const { unit } = worker(['captureCycleStatus'], {})
    const state = { ...summary(), claimed: 2, success: 1, requeued: 1, deferred: 0, stoppedByDeadline: false }
    assert.equal(unit.captureCycleStatus(state), 'DEFERRED')
    assert.equal(unit.captureCycleStatus({ ...state, success: 0 }), 'DEFERRED')
    assert.equal(unit.captureCycleStatus({ ...state, failed: 1 }), 'FAILED')
    assert.equal(unit.captureCycleStatus({ ...state, requeued: 0 }), 'SUCCESS')
    assert.equal(unit.captureCycleStatus({ ...state, claimed: 0, success: 0, requeued: 0 }), 'IDLE')
})

test('parallel runner waits for sibling completion before propagating a failure', async () => {
    let completed = false
    const { unit } = worker(['runWithConcurrency'], {})
    await assert.rejects(unit.runWithConcurrency([1, 2], 2, async n => {
        if (n === 1) throw Error('first task failed')
        await new Promise(resolve => setTimeout(resolve, 10)); completed = true
    }), /first task failed/)
    assert.equal(completed, true)
})

test('capture claim DB outage produces FAILED final log and rejects CI run', async () => {
    let disconnected = false
    const prisma = { campaign: { findMany: async () => [] }, settings: { findUnique: async () => ({}) },
        $transaction: async () => { throw Error('capture claim DB unavailable') }, $disconnect: async () => { disconnected = true } }
    const patch = ['cleanupStuckWorkerJobs','cleanupStuckCampaigns','cleanupOffScheduleFederalQueue','backfillQueuedCaptureJobs','queueFinalDayRecoveryCaptures']
        .map(name => `${name} = async () => {};`).join('\n')
    const { unit, logs } = worker(['startWorker'], prisma, { process: { env: { GITHUB_ACTIONS: 'true' }, exit() {} } }, patch)
    await assert.rejects(unit.startWorker(), /terminou com falhas/)
    const final = logs.find(log => log.message.includes('Ciclo finalizado'))
    assert.equal(final.type, 'ERROR'); assert.equal(JSON.parse(final.details).cycleStatus, 'FAILED')
    assert.equal(disconnected, true)
})
