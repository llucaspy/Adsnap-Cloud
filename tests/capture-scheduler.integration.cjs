const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const pg = require('pg')
const url = new URL(process.argv[2] || process.env.DATABASE_URL || 'postgresql://adsnap_test@127.0.0.1:55439/adsnap_worker_test')
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/adsnap_worker_test') throw Error('Isolated database required')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const id = 'scheduler_' + randomUUID(), token = 'a'.repeat(64), now = new Date('2026-11-04T11:00:00Z')
const checks = []
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }
async function main() {
    const { runCaptureScheduler, schedulerTokenHash, SchedulerUnauthorized } = await import('../src/lib/captureScheduler.ts')
    const client = new pg.Client({ connectionString: url.toString() }); await client.connect()
    try {
        for (const role of ['anon', 'authenticated']) if (!(await client.query('select 1 from pg_roles where rolname=$1', [role])).rowCount) await client.query(`CREATE ROLE ${role} NOLOGIN`)
        await client.query(await fs.readFile('prisma/manual-migrations/20261104_capture_watchdog.sql', 'utf8'))
    } finally { await client.end() }
    await db.$executeRawUnsafe('INSERT INTO adsnap_private.capture_scheduler(id,token_hash) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET token_hash=$1, dispatched_at=null', schedulerTokenHash(token))
    const auth = 'Bearer ' + token
    const calls = []
    let active = false, failure = false
    const request = async (path, init) => {
        calls.push({ path, init })
        return path.endsWith('/dispatches') ? new Response(null, { status: failure ? 403 : 204 })
            : Response.json({ workflow_runs: active ? [{ status: 'in_progress', created_at: now.toISOString() }] : [] })
    }
    const options = { repository: 'llucaspy/Adsnap-Cloud', token: 'fixture-only', request, now }
    const run = (extra = {}) => runCaptureScheduler(db, auth, { ...options, ...extra })
    await check('service auth rejects missing or wrong credentials without dispatch', async () => {
        await assert.rejects(() => runCaptureScheduler(db, null, options), SchedulerUnauthorized)
        await assert.rejects(() => runCaptureScheduler(db, 'Bearer ' + 'b'.repeat(64), options), SchedulerUnauthorized)
        assert.equal(calls.length, 0)
    })
    await db.campaign.create({ data: { id, agency: 'Fixture', client: 'Fixture', pi: id, format: '300x250', url: 'https://example.invalid', isScheduled: true,
        scheduledTimes: '["08:00","18:00"]', flightStart: new Date('2026-11-01T03:00:00Z'), flightEnd: new Date('2026-11-10T03:00:00Z') } })
    await check('before 08h Brasilia remains idle', async () => {
        assert.equal((await run({ now: new Date('2026-11-04T10:59:00Z') })).decision, 'idle'); assert.equal(calls.length, 0)
    })
    await check('live runner suppresses duplicate workflow requests', async () => {
        active = true; assert.equal((await run()).decision, 'runner-active'); assert.equal(calls.filter(c => c.path.endsWith('/dispatches')).length, 0); active = false
    })
    await check('simultaneous due ticks dispatch exactly one general worker', async () => {
        const results = await Promise.all([run(), run()])
        assert.equal(results.filter(r => r.dispatched).length, 1)
        const posts = calls.filter(c => c.path.endsWith('/dispatches')); assert.equal(posts.length, 1)
        assert.deepEqual(JSON.parse(posts[0].init.body), { ref: 'main', inputs: { campaign_ids: '' } })
        assert.equal(await db.workerJob.count({ where: { campaignId: id } }), 0)
    })
    await db.$executeRawUnsafe('UPDATE adsnap_private.capture_scheduler SET dispatched_at=null WHERE id=1')
    await check('completed morning print, federal intermediate days and paused/failed campaigns do not dispatch', async () => {
        const before = calls.length
        await db.campaign.update({ where: { id }, data: { lastCaptureAt: new Date('2026-11-04T11:01:00Z') } }); assert.equal((await run({ now: new Date('2026-11-04T12:00:00Z') })).decision, 'idle')
        await db.campaign.update({ where: { id }, data: { lastCaptureAt: null, segmentation: 'GOV_FEDERAL', captureCadence: 'BOUNDARY' } }); assert.equal((await run()).decision, 'idle')
        await db.campaign.update({ where: { id }, data: { segmentation: 'PRIVADO', captureCadence: 'DAILY', adOpsStatus: 'PAUSADA' } }); assert.equal((await run()).decision, 'idle')
        await db.campaign.update({ where: { id }, data: { adOpsStatus: 'ATIVA', status: 'FAILED' } }); assert.equal((await run()).decision, 'idle'); assert.equal(calls.length, before)
    })
    await check('queued recovery resumes even when no new scheduled campaign is due', async () => {
        await db.campaign.update({ where: { id }, data: { status: 'QUEUED' } })
        await db.workerJob.create({ data: { campaignId: id, scheduledFor: now } })
        assert.equal((await run()).decision, 'dispatched')
    })
    await db.$executeRawUnsafe('UPDATE adsnap_private.capture_scheduler SET dispatched_at=null WHERE id=1')
    await check('GitHub refusal is persisted as error and remains retryable', async () => {
        failure = true; assert.equal((await run()).decision, 'error')
        const [state] = await db.$queryRawUnsafe('SELECT dispatched_at,last_error FROM adsnap_private.capture_scheduler WHERE id=1')
        assert.equal(state.dispatched_at, null); assert.equal(state.last_error, 'Dispatch HTTP 403')
        failure = false; assert.equal((await run()).decision, 'dispatched')
    })
    console.log(`${checks.length}/${checks.length} capture scheduler PostgreSQL checks passed`)
}
main().finally(async () => {
    await db.workerJob.deleteMany({ where: { campaignId: id } }); await db.campaign.deleteMany({ where: { id } })
    await db.nexusLog.deleteMany({ where: { message: 'Agendador de recuperação: worker geral disparado para capturas pendentes.' } })
    await db.$disconnect()
}).catch(e => { console.error(e); process.exitCode = 1 })
