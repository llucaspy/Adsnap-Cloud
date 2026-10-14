import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createNexusLogsHandler } from '../src/lib/nexusLogRead'
import { NexusLogStore } from '../src/lib/nexusLogStore'
import {
    LOG_DETAILS_LIMIT, LOG_MESSAGE_LIMIT, redactLogText,
    sanitizeLogDetails, sanitizeLogMessage,
} from '../src/lib/logRedaction'

// Synthetic credentials only. The suite never loads .env, calls a database, or uses network.
const fixtureLog = {
    id: 'test-log', level: 'ERROR', campaignId: 'test-campaign', createdAt: new Date('2026-10-14T10:00:00Z'),
    message: 'Navigation failed https://preview.invalid/banner?campaign=123&token=FIXTURE_SECRET',
    details: 'Timeout after 45s\nStack: Error: Timeout\n    at capture (/home/runner/app/capture.ts:42:8)',
}
const admin = { userId: 'test-admin', role: 'admin', email: 'admin@example.invalid' }

describe('logs access boundary', () => {
    test('no session is 401 and never queries logs', async () => {
        let calls = 0
        const handler = createNexusLogsHandler({ getSession: async () => null, readLogs: async () => { calls++; return [fixtureLog] } })
        const response = await handler()
        assert.equal(response.status, 401)
        assert.equal(calls, 0)
        assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
        assert.deepEqual(await response.json(), { error: 'Unauthorized' })
    })

    test('malformed or unknown role cannot access persisted log data', async () => {
        for (const session of [{ ...admin, userId: '' }, { ...admin, role: 'unknown' }]) {
            const handler = createNexusLogsHandler({ getSession: async () => session, readLogs: async () => { throw new Error('must not be called') } })
            assert.equal((await handler()).status, 401)
        }
    })

    test('authenticated users get redacted summaries, admins retain bounded technical diagnosis', async () => {
        for (const role of ['user', 'admin']) {
            const handler = createNexusLogsHandler({ getSession: async () => ({ ...admin, role }), readLogs: async () => [fixtureLog] })
            const response = await handler()
            const [log] = await response.json()
            assert.equal(response.status, 200)
            assert.equal(response.headers.get('vary'), 'Cookie')
            assert.equal(log.campaignId, 'test-campaign')
            assert.ok(!log.message.includes('FIXTURE_SECRET'))
            assert.ok(log.message.includes('campaign=123'))
            if (role === 'user') assert.equal(log.details, null)
            else {
                assert.match(log.details, /Timeout after 45s/)
                assert.match(log.details, /capture\.ts:42:8/)
                assert.ok(!log.details.includes('/home/runner'))
            }
        }
    })

    test('storage exceptions never disclose connection credentials or stack', async () => {
        const handler = createNexusLogsHandler({ getSession: async () => admin, readLogs: async () => { throw new Error('postgres://test-user:FIXTURE_DB_PASSWORD@db.invalid/adsnap') } })
        const response = await handler()
        assert.equal(response.status, 500)
        assert.deepEqual(await response.json(), { error: 'Failed to fetch logs' })
    })

    test('response permits only documented log fields, never accidental schema additions', async () => {
        const handler = createNexusLogsHandler({ getSession: async () => admin, readLogs: async () => [{ ...fixtureLog, futurePrivateColumn: 'PRIVATE_FIXTURE' }] })
        const [log] = await (await handler()).json()
        assert.deepEqual(Object.keys(log).sort(), ['campaignId', 'createdAt', 'details', 'id', 'level', 'message'])
    })
})

describe('diagnostic redaction', () => {
    test('removes URL credentials and sensitive or repeated encoded query keys while preserving context', () => {
        const source = 'open https://fixture-user:FIXTURE_PASSWORD@preview.invalid/banner?campaign=123&creative=789&access%5Ftoken=FIXTURE_TOKEN&access%5Ftoken=SECOND_FIXTURE&key=FIXTURE_KEY'
        const safe = redactLogText(source)
        for (const secret of ['fixture-user', 'FIXTURE_PASSWORD', 'FIXTURE_TOKEN', 'SECOND_FIXTURE', 'FIXTURE_KEY']) assert.ok(!safe.includes(secret), secret)
        assert.match(safe, /preview\.invalid\/banner/)
        assert.match(safe, /campaign=123/)
        assert.match(safe, /creative=789/)
    })

    test('redacts nested signed URL parameters and OAuth fragments', () => {
        const inner = encodeURIComponent('https://cdn.invalid/image?X-Amz-Signature=FIXTURE_SIGNATURE&creative=789')
        const safe = redactLogText(`https://preview.invalid/?redirect=${inner}#access_token=FIXTURE_FRAGMENT`)
        assert.ok(!safe.includes('FIXTURE_SIGNATURE'))
        assert.ok(!safe.includes('FIXTURE_FRAGMENT'))
        assert.match(safe, /creative/)
        const encoded = redactLogText('https://preview.invalid/#access%255Ftoken%253DFIXTURE_ENCODED_FRAGMENT')
        assert.ok(!encoded.includes('FIXTURE_ENCODED_FRAGMENT'))
    })

    test('redacts recognized tokens, bearer credentials, cookies, private keys, and old prefix diagnostics', () => {
        const cases = [
            ['ghp_FIXTURE1234567890ABCDEF', 'ghp_FIXTURE1234567890ABCDEF'],
            ['github_pat_FIXTURE_1234567890', 'github_pat_FIXTURE_1234567890'],
            ['Bearer FIXTURE_AUTH_VALUE', 'FIXTURE_AUTH_VALUE'],
            ['Cookie: session=FIXTURE_COOKIE; refresh=FIXTURE_REFRESH', 'FIXTURE_COOKIE'],
            ['Cookie: session=FIXTURE_COOKIE; refresh=FIXTURE_REFRESH', 'FIXTURE_REFRESH'],
            ['password="FIXTURE WITH SPACES"', 'FIXTURE WITH SPACES'],
            ['Nexus: Usando GITHUB_TOKEN (TESTPREFIX...)', 'TESTPREFIX'],
            ['-----BEGIN PRIVATE KEY-----\nFIXTURE_KEY_CONTENT\n-----END PRIVATE KEY-----', 'FIXTURE_KEY_CONTENT'],
            ['https://api.telegram.org/bot123456:FIXTURE_TELEGRAM_TOKEN/sendMessage', 'FIXTURE_TELEGRAM_TOKEN'],
            ['eyJmaXh0dXJl.eyJmaXh0dXJl.c2lnbmF0dXJl', 'eyJmaXh0dXJl'],
        ]
        for (const [input, secret] of cases) assert.ok(!redactLogText(input).includes(secret), input)
    })

    test('preserves JSON run summary and error code while redacting nested credentials', () => {
        const source = JSON.stringify({ runId: 'gh-test', captureSummary: { success: 2, failed: 1 }, code: 'NAVIGATION_TIMEOUT', token: 'FIXTURE_TOKEN', nested: { client_secret: 'FIXTURE_SECRET', url: 'https://preview.invalid/?pi=123&signature=FIXTURE_SIG' } })
        const safe = sanitizeLogDetails(source)!
        const result = JSON.parse(safe)
        assert.equal(result.runId, 'gh-test')
        assert.equal(result.code, 'NAVIGATION_TIMEOUT')
        assert.deepEqual(result.captureSummary, { success: 2, failed: 1 })
        for (const secret of ['FIXTURE_TOKEN', 'FIXTURE_SECRET', 'FIXTURE_SIG']) assert.ok(!safe.includes(secret))
    })

    test('JSON truncation remains parseable and bounded, retaining the run identity', () => {
        const source = JSON.stringify({ runId: 'gh-large-run', events: Array.from({ length: 35 }, () => 'a'.repeat(1_500)) })
        const safe = sanitizeLogDetails(source)!
        assert.ok(safe.length <= LOG_DETAILS_LIMIT)
        assert.equal(JSON.parse(safe).runId, 'gh-large-run')
        assert.equal(JSON.parse(safe).truncated, true)
    })

    test('deep JSON, malformed JSON and large text have bounded redacted output', () => {
        let nested: unknown = { password: 'FIXTURE_DEEP_PASSWORD' }
        for (let i = 0; i < 20; i++) nested = { nested }
        const source = JSON.stringify(nested)
        assert.ok(!sanitizeLogDetails(source)!.includes('FIXTURE_DEEP_PASSWORD'))
        const malformed = '{"password":"FIXTURE_MALFORMED", incomplete'
        assert.ok(!sanitizeLogDetails(malformed)!.includes('FIXTURE_MALFORMED'))
        const huge = '{"password":"FIXTURE_LARGE", "body":"' + 'z'.repeat(110_000)
        const safe = sanitizeLogDetails(huge)!
        assert.ok(safe.length <= LOG_DETAILS_LIMIT)
        assert.ok(!safe.includes('FIXTURE_LARGE'))
    })

    test('summary strips stack frames and control codes; details preserve actionable location', () => {
        const source = '\u001b[31mTimeout\u001b[0m\u0000\n    at capture (C:\\Users\\fixture-user\\app\\capture.ts:42:8)'
        const summary = sanitizeLogMessage(source)
        assert.ok(!summary.includes('fixture-user'))
        assert.ok(!summary.includes('capture.ts:42:8'))
        assert.ok(!summary.includes('\u001b'))
        const detail = sanitizeLogDetails(source)!
        assert.match(detail, /capture\.ts:42:8/)
        assert.ok(!detail.includes('fixture-user'))
        assert.ok(sanitizeLogMessage('a'.repeat(10_000)).length <= LOG_MESSAGE_LIMIT)
        assert.ok(sanitizeLogDetails('line\n'.repeat(200))!.split('\n').length <= 21)
    })

    test('absent details stay absent', () => {
        assert.equal(sanitizeLogDetails(null), null)
        assert.equal(sanitizeLogDetails(undefined), null)
    })

    test('repeated read-side redaction does not damage already redacted diagnostics', () => {
        for (const value of ['password=FIXTURE_PASSWORD', 'GITHUB_TOKEN (TESTPREFIX...)', 'https://preview.invalid/?pi=123&token=FIXTURE_TOKEN']) {
            const once = redactLogText(value)
            assert.equal(redactLogText(once), once)
        }
        const details = sanitizeLogDetails(JSON.stringify({ runId: 'test-run', token: 'FIXTURE_TOKEN', url: 'https://preview.invalid/?token=FIXTURE_SIGNED' }))
        assert.equal(sanitizeLogDetails(details), details)
    })

    test('source no longer writes token prefixes and endpoint selects bounded explicit fields', async () => {
        const actions = await readFile(new URL('../src/app/actions.ts', import.meta.url), 'utf8')
        assert.ok(!actions.includes('token.substring(0, 10)'))
        assert.ok(!actions.includes('tokenPrefix'))
        const route = await readFile(new URL('../src/app/api/nexus/logs/route.ts', import.meta.url), 'utf8')
        assert.match(route, /createNexusLogsHandler/)
        assert.match(route, /take: 30/)
        assert.match(route, /select:/)
    })
})

describe('persistent log boundary', () => {
    test('writes the same redacted values to memory and storage, preserving run metadata', async () => {
        const persisted: { message: string; details?: string; campaignId?: string }[] = []
        const store = new NexusLogStore(async data => { persisted.push(data) })
        await store.addLog('Capture https://preview.invalid/?token=FIXTURE_WRITE_TOKEN', 'ERROR', JSON.stringify({ runId: 'test-write', apiKey: 'FIXTURE_WRITE_KEY', captureSummary: { success: 1 } }), 'test-campaign')
        assert.equal(persisted.length, 1)
        const [memory] = store.getLogs()
        assert.equal(memory.message, persisted[0].message)
        assert.equal(memory.details, persisted[0].details)
        assert.ok(!JSON.stringify(persisted).includes('FIXTURE_WRITE_TOKEN'))
        assert.ok(!JSON.stringify(persisted).includes('FIXTURE_WRITE_KEY'))
        assert.equal(JSON.parse(persisted[0].details!).runId, 'test-write')
        assert.equal(persisted[0].campaignId, 'test-campaign')
        // A consumer cannot mutate the retained record through getLogs().
        memory.message = 'mutated outside store'
        assert.notEqual(store.getLogs()[0].message, memory.message)
    })

    test('database failure cannot interrupt capture or disclose credentials in fallback diagnostics', async t => {
        const errorOutput: unknown[][] = []
        t.mock.method(console, 'error', (...values: unknown[]) => { errorOutput.push(values) })
        const store = new NexusLogStore(async () => { throw new Error('connect postgres://fixture-user:FIXTURE_STORE_PASSWORD@db.invalid/adsnap') })
        await assert.doesNotReject(store.addLog('Capture completed', 'SUCCESS'))
        assert.equal(store.getLogs().length, 1)
        assert.equal(errorOutput.length, 1)
        assert.ok(!JSON.stringify(errorOutput).includes('FIXTURE_STORE_PASSWORD'))
        assert.ok(!JSON.stringify(errorOutput).includes('fixture-user'))
    })

    test('memory storage is bounded while all log entries reach the persistent sink', async () => {
        let persisted = 0
        const store = new NexusLogStore(async () => { persisted++ })
        for (let i = 0; i < 55; i++) await store.addLog(`event-${i}`)
        assert.equal(persisted, 55)
        assert.equal(store.getLogs().length, 50)
        assert.equal(store.getLogs()[0].message, 'event-5')
        store.clear()
        assert.equal(store.getLogs().length, 0)
    })
})
