const fs = require('node:fs/promises')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')
const pg = require('pg')
const url = new URL(process.argv[2] || process.env.DATABASE_URL || 'postgresql://adsnap_test@127.0.0.1:55439/adsnap_worker_test')
if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/adsnap_worker_test') throw new Error('Support integration tests require an isolated loopback database')
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } })
const prefix = `support_${randomUUID().replaceAll('-', '')}`
const userIds = [prefix + '_a', prefix + '_b', prefix + '_off']
const campaignId = prefix.replaceAll('_', '-') + '-campaign'
const checks = []
async function check(name, fn) { await fn(); checks.push(name); console.log('PASS ' + name) }

async function main() {
    const { createSupportStore } = await import('../src/lib/supportStore.ts')
    const { createSupportTools } = await import('../src/lib/supportTools.ts')
    const { createSupportActions } = await import('../src/lib/supportActions.ts')
    const store = createSupportStore(db)
    const a = { userId: userIds[0], role: 'user' }, b = { userId: userIds[1], role: 'user' }
    const runId = randomUUID()
    let conversation, turn, action, claim
    let dispatches = 0
    const actions = createSupportActions(db, async () => { dispatches++; return true })
    try {
        for (let i = 0; i < userIds.length; i++) await db.user.create({ data: { id: userIds[i], email: `${userIds[i]}@local.invalid`, password: 'fixture-not-a-login', name: 'Support fixture', role: 'user', isActive: i !== 2 } })
        await db.campaign.create({ data: { id: campaignId, agency: 'Fixture', client: prefix, pi: prefix, campaignName: 'Fixture support', format: 'fixture', status: 'FAILED', url: 'https://portal.example/?google_preview=PRIVATE_PREVIEW_SECRET&creativeId=123&lineItemId=456', lastWorkerError: 'CREATIVE_NOT_CONFIRMED https://portal.example/?google_preview=PRIVATE_PREVIEW_SECRET', compositionBox: { existing: 'preserved' } } })
        await check('inactive users are rejected and conversations are private across users', async () => {
            await assert.rejects(() => store.create({ userId: userIds[2], role: 'admin' }, 'No'), /Entre novamente/)
            conversation = await store.create(a, 'Cadastro e prints')
            assert.equal((await store.list(b)).length, 0)
            await assert.rejects(() => store.read(conversation.id, b), /não encontrada/)
            await assert.rejects(() => store.submit(conversation.id, b, randomUUID(), 'Read another user'), /não encontrada/)
        })
        await check('concurrent submissions are idempotent and persist without any active browser', async () => {
            const requestKey = randomUUID()
            const results = await Promise.all(Array.from({ length: 8 }, () => store.submit(conversation.id, a, requestKey, 'Investigue meus prints')))
            assert.equal(new Set(results.map(r => r.id)).size, 1)
            turn = results[0]
            assert.equal((await store.read(conversation.id, a)).turns.length, 1)
            await assert.rejects(() => store.submit(conversation.id, a, randomUUID(), 'Duplicate concurrent request'), /Aguarde/)
        })
        await check('one executor owns the queue and only one live turn can be claimed', async () => {
            assert(await store.heartbeat(runId, 'ONLINE', 'plus'))
            assert.equal(await store.heartbeat(randomUUID(), 'ONLINE', 'plus'), false)
            const results = await Promise.all([store.claim(runId), store.claim(runId)])
            assert.equal(results.filter(Boolean).length, 1)
            claim = results.find(Boolean)
            assert.equal(claim.id, turn.id)
            assert(await store.renew(claim.id, runId))
        })
        await check('diagnostic tools redact preview secrets and cannot read arbitrary files or propose unchecked campaigns', async () => {
            let sourceReads = 0
            const tool = createSupportTools(db, turn.id, runId, async () => { sourceReads++; return 'authorized source' })
            const denied = await tool('adsnap_read_source', { file: '.env.local', startLine: 1 })
            assert(denied.error); assert.equal(sourceReads, 0)
            await assert.rejects(() => tool('adsnap_propose_action', { type: 'VERIFIED_PREVIEW', campaignIds: [campaignId], reason: 'Recovery' }), /diagnóstico/)
            const found = await tool('adsnap_search_campaigns', { query: prefix })
            assert(found.some(c => c.id === campaignId))
            const diagnostic = await tool('adsnap_diagnose_campaign', { campaignId })
            assert(!JSON.stringify(diagnostic).includes('PRIVATE_PREVIEW_SECRET'))
            const proposed = await tool('adsnap_propose_action', { type: 'VERIFIED_PREVIEW', campaignIds: [campaignId], reason: 'Gerar prévia modificada; não comprova veiculação.' })
            action = proposed
            assert.equal((await db.campaign.findUnique({ where: { id: campaignId } })).compositionBox.allowVerifiedPackagePreview, undefined)
            assert.equal((await store.read(conversation.id, a)).turns[0].actions.length, 0)
            await store.finish(turn.id, runId, 'Preparei uma proposta de prévia modificada para sua confirmação.')
        })
        await check('only the owning user can confirm; concurrent confirmations queue once and preserve configuration', async () => {
            await assert.rejects(() => actions.confirm(action.actionId, b), /não encontrada/)
            const results = await Promise.all(Array.from({ length: 6 }, () => actions.confirm(action.actionId, a)))
            assert(results.every(r => r.action.status === 'QUEUED'))
            assert.equal(dispatches, 1)
            const c = await db.campaign.findUnique({ where: { id: campaignId } })
            assert.equal(c.compositionBox.existing, 'preserved')
            assert.equal(c.compositionBox.allowVerifiedPackagePreview, true)
            assert.equal(await db.workerJob.count({ where: { campaignId } }), 1)
            assert.equal(c.status, 'QUEUED')
        })
        await check('queued actions remain distinct from success and track real persisted job states', async () => {
            await actions.refresh(conversation.id, a)
            assert.equal((await db.supportAction.findUnique({ where: { id: action.actionId } })).status, 'QUEUED')
            await db.workerJob.updateMany({ where: { campaignId }, data: { status: 'SUCCESS' } })
            await actions.refresh(conversation.id, a)
            const current = await db.supportAction.findUnique({ where: { id: action.actionId } })
            assert.equal(current.status, 'SUCCESS'); assert.equal(current.result.success, 1)
            const restored = await store.read(conversation.id, a)
            assert.equal(restored.turns[0].assistantText.includes('proposta'), true)
            assert.equal(restored.turns[0].actions[0].status, 'SUCCESS')
        })
        await check('expired execution is not replayed and cannot publish a late answer', async () => {
            await store.submit(conversation.id, a, randomUUID(), 'Another diagnosis')
            const next = await store.claim(runId)
            await db.supportTurn.update({ where: { id: next.id }, data: { lockedUntil: new Date(Date.now() - 1) } })
            await store.read(conversation.id, a)
            await assert.rejects(() => store.finish(next.id, runId, 'Late answer'), /perdeu/)
            assert.equal((await db.supportTurn.findUnique({ where: { id: next.id } })).status, 'FAILED')
        })
        await check('manual migration is idempotent and enables RLS on all support tables', async () => {
            const c = new pg.Client({ connectionString: url.toString() }); await c.connect()
            try {
                const sql = await fs.readFile('prisma/manual-migrations/20261103_shared_codex_support.sql', 'utf8')
                await c.query(sql); await c.query(sql)
                const result = await c.query(`select relrowsecurity from pg_class where relname in ('SupportConversation','SupportTurn','SupportAction','SupportExecutor')`)
                assert.equal(result.rows.length, 4); assert(result.rows.every(r => r.relrowsecurity))
            } finally { await c.end() }
        })
        console.log(`${checks.length}/${checks.length} support PostgreSQL integration checks passed`)
    } finally {
        await db.supportExecutor.deleteMany({ where: { runId } })
        await db.workerJob.deleteMany({ where: { campaignId } })
        await db.nexusLog.deleteMany({ where: { details: { contains: userIds[0] } } })
        await db.campaign.deleteMany({ where: { id: campaignId } })
        await db.user.deleteMany({ where: { id: { in: userIds } } })
        await db.$disconnect()
    }
}
main().catch(error => { console.error(error); process.exitCode = 1 })

