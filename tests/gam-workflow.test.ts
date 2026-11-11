import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PrismaClient } from '@prisma/client'
import { dispatchGamWorkflow, gamJobExpired, reconcileGamJob } from '../src/lib/gamWorkflow'

function fixture() {
    let current = {
        id: 'job-1',
        level: 'JOB_GAM_PENDING',
        message: 'Na fila',
        details: JSON.stringify({ requestedPi: '01234' }),
        createdAt: new Date(),
    }
    const db = {
        nexusLog: {
            findUnique: async () => current,
            updateMany: async ({ where, data }: { where: Partial<typeof current>; data: Partial<typeof current> }) => {
                if (where.level !== current.level || where.details !== current.details) return { count: 0 }
                current = { ...current, ...data }
                return { count: 1 }
            },
        },
    } as unknown as PrismaClient
    return { db, read: () => current }
}

test('a startup failure with no runner is persisted against the exact dispatched Order', async t => {
    const oldRepo = process.env.GITHUB_REPO
    const oldToken = process.env.GITHUB_TOKEN
    process.env.GITHUB_REPO = 'fixture/adsnap'
    process.env.GITHUB_TOKEN = 'fixture-token'
    t.after(() => {
        if (oldRepo === undefined) delete process.env.GITHUB_REPO
        else process.env.GITHUB_REPO = oldRepo
        if (oldToken === undefined) delete process.env.GITHUB_TOKEN
        else process.env.GITHUB_TOKEN = oldToken
    })
    const job = fixture()
    t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
        if (init.method === 'POST') {
            assert.deepEqual(JSON.parse(String(init.body)), {
                ref: 'main', inputs: { job_id: 'job-1' }, return_run_details: true,
            })
            return Response.json({ workflow_run_id: 123 })
        }
        assert.match(url, /\/actions\/runs\/123$/)
        return Response.json({ status: 'completed', conclusion: 'startup_failure' })
    })
    assert(await dispatchGamWorkflow(job.db, 'job-1'))
    const result = await reconcileGamJob(job.db, job.read())
    assert.equal(result.level, 'JOB_GAM_ERROR')
    assert.equal(JSON.parse(result.details || '{}').requestedPi, '01234')
    assert.match(job.read().message, /interrompeu/)
})

test('deadline covers legacy queue entries and uses the latest dispatch or progress', () => {
    const { read } = fixture()
    const now = Date.now()
    const job = { ...read(), createdAt: new Date(now - 16 * 60_000) }
    assert(gamJobExpired(job, now))
    assert(!gamJobExpired({ ...job, details: JSON.stringify({ dispatchRequestedAt: new Date(now).toISOString() }) }, now))
    assert(!gamJobExpired({ ...job, level: 'JOB_GAM_RUNNING', details: JSON.stringify({ executionLogs: [{ at: new Date(now).toISOString() }] }) }, now))
})
