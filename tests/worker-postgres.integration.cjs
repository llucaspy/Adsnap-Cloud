/* Explicit local-only integration test. Never loads .env or imports worker main. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const { stripTypeScriptTypes } = require('node:module')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const root = path.resolve(__dirname, '..')
const database = new URL(process.argv[2] || 'postgresql://adsnap_test@127.0.0.1:55473/adsnap_worker_test')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || database.pathname !== '/adsnap_worker_test') {
    throw Error('Refusing non-loopback or non-test database')
}
database.searchParams.set('connection_limit', '5')
const prisma = new PrismaClient({ datasources: { db: { url: database.toString() } } })
const prefix = 'audit_queue_' + randomUUID().replaceAll('-', '')
const campaignIds = []
const results = []
function load(file, names, bindings = {}) {
    let code = fs.readFileSync(path.join(root, file), 'utf8')
        .replace(/^import\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '')
        .replace(/^export\s+/gm, '')
    if (file.endsWith('worker.ts')) code = code.slice(0, code.indexOf('startWorker().catch'))
    const context = vm.createContext({ Error, Date, Buffer, randomUUID, setTimeout, clearTimeout, AbortController,
        console: { log() {}, error() {}, warn() {} }, process: { env: {} }, prisma,
        nexusLogStore: { addLog: async () => {} }, normalizeCaptureDelaySeconds: value => Number(value ?? 3),
        WORKER_JOB_TYPE_CAPTURE: 'CAPTURE', WORKER_JOB_STATUS_QUEUED: 'QUEUED', WORKER_JOB_STATUS_PROCESSING: 'PROCESSING',
        WORKER_JOB_STATUS_SUCCESS: 'SUCCESS', WORKER_JOB_STATUS_FAILED: 'FAILED',
        isWorkerJobStorageMissing: () => false, ...bindings })
    vm.runInContext(stripTypeScriptTypes(code + '\nglobalThis.unit = {' + names.join(',') + '};'), context)
    return context.unit
}
const ownership = load('src/lib/captureOwnership.ts', ['assertCaptureOwnership', 'completeCaptureOwnership', 'CaptureOwnershipLostError'])
const queue = load('src/lib/workerJobs.ts', ['enqueueCaptureJobs'])
const scheduleScope = load('src/lib/governmentReportScope.ts', ['normalizeCaptureCadence'])
const scheduling = load('src/lib/campaignSchedule.ts', ['getBrasiliaDayRangeFor', 'isCampaignFinalDayToday', 'isFederalCampaignBoundaryToday', 'shouldQueueScheduledCampaign'], scheduleScope)
const worker = (adapter = prisma) => load('src/scripts/worker.ts', ['claimWorkerJobBatch', 'claimCampaignBatch',
    'finishWorkerJob', 'retryOrFailWorkerJob', 'cleanupStuckWorkerJobs', 'releaseUnstartedWorkerJob',
    'queueFinalDayRecoveryCaptures', 'cleanupOffScheduleFederalQueue'], { prisma: adapter, ...ownership, ...scheduling, enqueueCaptureJobs: queue.enqueueCaptureJobs })
async function seed(label) {
    const id = prefix + '_' + label; campaignIds.push(id)
    return prisma.campaign.create({ data: { id, agency: 'Audit', client: 'Fixture', pi: id,
        format: '300x250', url: 'https://fixture.invalid/', status: 'PENDING' } })
}
async function claimed(label) {
    const campaign = await seed(label)
    await queue.enqueueCaptureJobs([campaign.id])
    const jobs = await worker().claimWorkerJobBatch(prefix + '_ownerA', 1, new Date(), [campaign.id])
    assert.equal(jobs.length, 1)
    return jobs[0]
}
async function run(name, callback) {
    const start = Date.now()
    try { const evidence = await callback(); results.push({ name, passed: true, durationMs: Date.now() - start, evidence }); console.log('PASS ' + name) }
    catch (error) { results.push({ name, passed: false, durationMs: Date.now() - start, error: error.stack }); console.error('FAIL ' + name + ': ' + error.message) }
}
function summary() { return { success: 0, failed: 0, requeued: 0, deadletter: 0, ownershipLost: 0 } }
async function main() {
    await prisma.$connect()
    try {
        await run('terminal failure is reconciled into an idempotent durable Telegram incident', async () => {
            const campaign = await seed('incident')
            const job = await prisma.workerJob.create({ data: { campaignId: campaign.id, status: 'FAILED', attempts: 2,
                maxAttempts: 2, finishedAt: new Date(), lastError: 'Timeout de 120s https://fixture.invalid/?token=incident-secret' } })
            const redaction = load('src/lib/logRedaction.ts', ['sanitizeLogMessage'])
            const diagnosis = load('src/lib/captureFailure.ts', ['describeCaptureFailure'], redaction)
            const notifications = load('src/lib/quarantineNotifications.ts', ['reconcileCaptureIncidents'], { ...redaction, ...diagnosis })
            await notifications.reconcileCaptureIncidents(); await notifications.reconcileCaptureIncidents()
            const incident = await prisma.nexusLog.findUnique({ where: { id: `capture-incident-${job.id}` } })
            assert.equal(incident.level, 'CAPTURE_ALERT_PENDING')
            assert.equal(JSON.parse(incident.details).jobId, job.id)
            assert.equal(incident.details.includes('incident-secret'), false)
            assert.equal(await prisma.nexusLog.count({ where: { id: incident.id } }), 1)
            return { persistentIncident: true, deduplicated: true, secretsRedacted: true }
        })
        await run('quarantine retry cannot enqueue a campaign whose failure was already resolved', async () => {
            const campaign = await seed('quarantine_retry')
            await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'SUCCESS' } })
            const rejected = await queue.enqueueCaptureJobs([campaign.id], { allowTerminalStatuses: true, requireFailureStatus: true })
            assert.equal(rejected.created, 0)
            assert.equal((await prisma.campaign.findUnique({ where: { id: campaign.id } })).status, 'SUCCESS')
            await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'QUARANTINE' } })
            const results = await Promise.all(Array.from({ length: 4 }, () => queue.enqueueCaptureJobs([campaign.id], { allowTerminalStatuses: true, requireFailureStatus: true })))
            assert.equal(results.reduce((sum, item) => sum + item.created, 0), 1)
            assert.equal(await prisma.workerJob.count({ where: { campaignId: campaign.id } }), 1)
            return { resolvedCampaignPreserved: true, simultaneousRetries: 4, created: 1 }
        })
        await run('twenty concurrent enqueues create one active job', async () => {
            const campaign = await seed('enqueue')
            const responses = await Promise.all(Array.from({ length: 20 }, () => queue.enqueueCaptureJobs([campaign.id])))
            const count = await prisma.workerJob.count({ where: { campaignId: campaign.id, status: { in: ['QUEUED', 'PROCESSING'] } } })
            assert.equal(count, 1); assert.equal(responses.reduce((n, r) => n + r.created, 0), 1)
            return { requests: 20, activeJobs: count }
        })
        await run('concurrent claims are exclusive even with duplicate historical jobs', async () => {
            const campaign = await seed('claim')
            await queue.enqueueCaptureJobs([campaign.id])
            await prisma.workerJob.create({ data: { campaignId: campaign.id } })
            const results = await Promise.all(['A', 'B'].map(owner => worker().claimWorkerJobBatch(prefix + '_' + owner, 1, new Date(), [campaign.id])))
            assert.equal(results.flat().length, 1)
            assert.equal(await prisma.workerJob.count({ where: { campaignId: campaign.id, status: 'PROCESSING' } }), 1)
            return { existingJobs: 2, simultaneousClaims: results.map(r => r.length) }
        })
        await run('campaign update failure rolls job claim back in real PostgreSQL', async () => {
            const campaign = await seed('rollback'); await queue.enqueueCaptureJobs([campaign.id])
            const adapter = new Proxy(prisma, { get(target, prop) {
                if (prop === '$transaction') return (callback, options) => target.$transaction(tx => callback(new Proxy(tx, { get(inner, key) {
                    if (key === 'campaign') return new Proxy(inner.campaign, { get(delegate, method) {
                        if (method === 'updateMany') return async () => { throw Error('injected campaign update failure') }
                        const value = Reflect.get(delegate, method); return typeof value === 'function' ? value.bind(delegate) : value
                    } })
                    const value = Reflect.get(inner, key); return typeof value === 'function' ? value.bind(inner) : value
                } })), options)
                const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value
            } })
            await assert.rejects(worker(adapter).claimWorkerJobBatch(prefix + '_rollback', 1, new Date(), [campaign.id]), /injected/)
            const job = await prisma.workerJob.findFirst({ where: { campaignId: campaign.id } })
            assert.equal(job.status, 'QUEUED'); assert.equal(job.attempts, 0)
            return { status: job.status, attempts: job.attempts }
        })
        await run('stale finish and retry cannot mutate a newer owner', async () => {
            const old = await claimed('fence')
            await prisma.$transaction([
                prisma.workerJob.update({ where: { id: old.jobId }, data: { runId: prefix + '_ownerB', attempts: old.attempts + 1 } }),
                prisma.campaign.update({ where: { id: old.id }, data: { processingRunId: prefix + '_ownerB' } }),
            ])
            await assert.rejects(worker().finishWorkerJob(old, 'SUCCESS'), ownership.CaptureOwnershipLostError)
            assert.equal(await worker().releaseUnstartedWorkerJob(old), false)
            const state = summary(); await worker().retryOrFailWorkerJob(old, 'old timeout', state)
            const current = await prisma.workerJob.findUnique({ where: { id: old.jobId } })
            assert.equal(current.status, 'PROCESSING'); assert.equal(current.runId, prefix + '_ownerB'); assert.equal(state.ownershipLost, 1)
            return { status: current.status, attempts: current.attempts, lostOwnerRecorded: state.ownershipLost }
        })
        await run('stale recovery read cannot resurrect a completed job', async () => {
            const old = await claimed('recovery')
            await prisma.workerJob.update({ where: { id: old.jobId }, data: { lockedUntil: new Date(Date.now() - 1000) } })
            const adapter = new Proxy(prisma, { get(target, prop) {
                if (prop === 'workerJob') return new Proxy(target.workerJob, { get(delegate, method) {
                    if (method === 'findMany') return async args => {
                        const found = await delegate.findMany({ ...args, where: { ...args.where, id: old.jobId } })
                        await target.$transaction([
                            target.workerJob.update({ where: { id: old.jobId }, data: { status: 'SUCCESS', lockedUntil: null } }),
                            target.campaign.update({ where: { id: old.id }, data: { status: 'SUCCESS', processingRunId: null, lockedUntil: null } }),
                        ])
                        return found
                    }
                    const value = Reflect.get(delegate, method); return typeof value === 'function' ? value.bind(delegate) : value
                } })
                const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value
            } })
            await worker(adapter).cleanupStuckWorkerJobs()
            const current = await prisma.workerJob.findUnique({ where: { id: old.jobId } })
            assert.equal(current.status, 'SUCCESS')
            assert.equal((await prisma.campaign.findUnique({ where: { id: old.id } })).status, 'SUCCESS')
            return { jobAfterRecovery: current.status, completedBetweenReadAndWrite: true }
        })
        await run('future job blocks direct legacy capture', async () => {
            const campaign = await seed('future')
            await queue.enqueueCaptureJobs([campaign.id], { scheduledFor: new Date(Date.now() + 10 * 60_000) })
            const structured = await worker().claimWorkerJobBatch(prefix + '_future', 1, new Date(), [campaign.id])
            const legacy = await worker().claimCampaignBatch([campaign.id], prefix + '_legacy', 1)
            assert.equal(structured.length, 0); assert.equal(legacy.length, 0)
            return { structuredClaims: 0, legacyClaims: 0 }
        })
        await run('unstarted reservation release restores attempt counters and permits a later claim', async () => {
            const first = await claimed('unstarted')
            assert.equal(first.attempts, 1)
            assert.equal(await worker().releaseUnstartedWorkerJob(first), true)
            const queued = await prisma.workerJob.findUnique({ where: { id: first.jobId } })
            const campaign = await prisma.campaign.findUnique({ where: { id: first.id } })
            assert.equal(queued.status, 'QUEUED'); assert.equal(queued.attempts, 0)
            assert.equal(queued.startedAt, null); assert.equal(queued.runId, null)
            assert.equal(campaign.processingAttempts, 0); assert.equal(campaign.status, 'QUEUED')
            const next = await worker().claimWorkerJobBatch(prefix + '_later', 1, new Date(), [first.id])
            assert.equal(next.length, 1); assert.equal(next[0].attempts, 1)
            return { releasedJobAttempts: queued.attempts, releasedCampaignAttempts: campaign.processingAttempts,
                nextClaimAttempts: next[0].attempts, nextClaimOwnerChanged: next[0].runId !== first.runId }
        })
        await run('capture record, campaign and job ACK share one atomic transaction', async () => {
            const job = await claimed('atomic')
            const claim = { campaignId: job.id, runId: job.runId, jobId: job.jobId, attempt: job.attempts }
            const commit = async fail => prisma.$transaction(async tx => {
                await ownership.assertCaptureOwnership(tx, claim)
                await tx.capture.create({ data: { campaignId: job.id, screenshotPath: 'mock://atomic-fixture', status: 'SUCCESS' } })
                await tx.campaign.update({ where: { id: job.id }, data: { status: 'SUCCESS', processingRunId: null, lockedUntil: null } })
                await ownership.completeCaptureOwnership(tx, claim)
                if (fail) throw Error('injected commit failure')
            })
            await assert.rejects(commit(true), /injected commit failure/)
            assert.equal(await prisma.capture.count({ where: { campaignId: job.id } }), 0)
            assert.equal((await prisma.workerJob.findUnique({ where: { id: job.jobId } })).status, 'PROCESSING')
            await commit(false)
            assert.equal(await prisma.capture.count({ where: { campaignId: job.id } }), 1)
            assert.equal((await prisma.workerJob.findUnique({ where: { id: job.jobId } })).status, 'SUCCESS')
            await assert.rejects(commit(false), ownership.CaptureOwnershipLostError)
            assert.equal(await prisma.capture.count({ where: { campaignId: job.id } }), 1)
            return { captures: 1, jobStatus: 'SUCCESS', duplicateCommitRejected: true }
        })
        await run('closing recovery uses the configured schedule and never reopens manual or quarantined campaigns', async () => {
            const fixedNow = new Date('2026-10-14T15:00:00Z')
            const due = await seed('scheduled_due'), manual = await seed('scheduled_manual'), quarantined = await seed('scheduled_quarantine')
            for (const campaign of [due, manual, quarantined]) await prisma.campaign.update({ where: { id: campaign.id }, data: {
                isScheduled: campaign.id !== manual.id, scheduledTimes: '["09:00"]',
                flightStart: new Date('2026-10-01T00:00:00Z'), flightEnd: new Date('2026-10-14T00:00:00Z'),
                status: campaign.id === quarantined.id ? 'QUARANTINE' : 'PENDING',
            } })
            await worker().queueFinalDayRecoveryCaptures(fixedNow)
            assert.equal(await prisma.workerJob.count({ where: { campaignId: due.id } }), 1)
            assert.equal(await prisma.workerJob.count({ where: { campaignId: { in: [manual.id, quarantined.id] } } }), 0)
            return { scheduledJobs: 1, manualJobs: 0, reopenedQuarantines: 0 }
        })
        await run('boundary cleanup cancels only automatic queued jobs and retains manual requests', async () => {
            const automatic = await seed('boundary_auto'), manual = await seed('boundary_manual')
            for (const campaign of [automatic, manual]) {
                await prisma.campaign.update({ where: { id: campaign.id }, data: { isScheduled: true, segmentation: 'GOV_FEDERAL', captureCadence: 'BOUNDARY', flightStart: new Date('2026-10-01T00:00:00Z'), flightEnd: new Date('2026-10-20T00:00:00Z') } })
                await queue.enqueueCaptureJobs([campaign.id], { source: campaign.id === automatic.id ? 'worker-schedule' : 'manual-single' })
                await prisma.campaign.update({ where: { id: campaign.id }, data: { updatedAt: new Date(Date.now() - 30 * 60_000) } })
            }
            await worker().cleanupOffScheduleFederalQueue(new Date('2026-10-14T15:00:00Z'))
            assert.equal((await prisma.workerJob.findFirst({ where: { campaignId: automatic.id } })).status, 'CANCELLED')
            assert.equal((await prisma.campaign.findUnique({ where: { id: automatic.id } })).status, 'PENDING')
            assert.equal((await prisma.workerJob.findFirst({ where: { campaignId: manual.id } })).status, 'QUEUED')
            assert.equal((await prisma.campaign.findUnique({ where: { id: manual.id } })).status, 'QUEUED')
            return { automatic: 'CANCELLED', manual: 'QUEUED' }
        })
    } finally {
        // Only this invocation's generated fixture IDs; never truncate shared tables.
        await prisma.nexusLog.deleteMany({ where: { campaignId: { in: campaignIds } } })
        await prisma.capture.deleteMany({ where: { campaignId: { in: campaignIds } } })
        await prisma.workerJob.deleteMany({ where: { campaignId: { in: campaignIds } } })
        await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } })
        await prisma.$disconnect()
    }
    const report = { generatedAt: new Date().toISOString(), database: 'loopback / adsnap_worker_test',
        engine: 'Real PostgreSQL + Prisma 5.22.0; original hardened functions executed with explicit test client; no environment files or cloud integrations.',
        total: results.length, passed: results.filter(item => item.passed).length, results }
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(root, 'docs/worker-postgres-results.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`${report.passed}/${report.total} PostgreSQL integration checks passed`)
    if (report.passed !== report.total) process.exitCode = 1
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1 })
