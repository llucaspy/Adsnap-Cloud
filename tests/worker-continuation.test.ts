import test from 'node:test'
import assert from 'node:assert/strict'
import { dispatchWorkerContinuation, pendingCaptureCampaignIds } from '../src/lib/workerContinuation'
import type { PrismaClient } from '@prisma/client'

const options = { ids: ['pending-A'], repository: 'owner/repo', token: 'test-token', ref: 'main', depth: 0 }
test('idle queue never dispatches or needs a credential', async () => {
    assert.equal(await dispatchWorkerContinuation({ ...options, ids: [], token: '' }, async () => { throw Error('unexpected request') }), false)
})
test('continuation preserves only pending campaign scope and increments the bounded chain', async () => {
    let calls = 0
    assert.equal(await dispatchWorkerContinuation({ ...options, depth: 3 }, async (url, init) => {
        calls++
        assert.equal(url, 'https://api.github.com/repos/owner/repo/actions/workflows/nexus-worker.yml/dispatches')
        assert.deepEqual(JSON.parse(String(init?.body)), {ref:'main',inputs:{campaign_ids:'pending-A',continuation_depth:'4'}})
        assert.ok(init?.signal)
        return new Response(null, {status:204})
    }), true)
    assert.equal(calls, 1)
})
test('failed dispatch and exhausted continuation budget cannot report success', async () => {
    await assert.rejects(dispatchWorkerContinuation(options, async () => new Response(null,{status:403})), /HTTP 403/)
    for (const depth of [12, -1, NaN]) await assert.rejects(dispatchWorkerContinuation({...options,depth}), /Limite/)
    await assert.rejects(dispatchWorkerContinuation({...options,ref:'unreviewed'}), /main protegida/)
})
test('global continuation retains global scope instead of truncating to the inspection batch', async () => {
    await dispatchWorkerContinuation({...options,scope:[]}, async (_url, init) => {
        assert.equal(JSON.parse(String(init?.body)).inputs.campaign_ids,'')
        return new Response(null,{status:204})
    })
})
test('pending queue excludes archived, terminal, exhausted and concurrently owned captures', async () => {
    const prisma = {$queryRawUnsafe:async (sql:string, scope:string[]) => {
        assert.match(sql, /c\."isArchived" = false and c.status = 'QUEUED'/)
        assert.match(sql, /j.attempts < j."maxAttempts"/)
        assert.match(sql, /active.status = 'PROCESSING'/)
        assert.match(sql, /interval '15 minutes'/)
        assert.deepEqual(scope,['manual-only'])
        return [{id:'manual-only'}]
    }} as unknown as PrismaClient
    assert.deepEqual(await pendingCaptureCampaignIds(prisma,['manual-only']),['manual-only'])
})
