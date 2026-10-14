// Independent release review. Synthetic fixtures only; no DB, environment file or network.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { redactLogText, sanitizeLogDetails } from '../src/lib/logRedaction'
import { createNexusLogsHandler } from '../src/lib/nexusLogRead'

test('review: every refused session is private and cannot start a storage read', async () => {
    const sessions = [null, { userId: '   ', role: 'admin', email: 'fixture.invalid' }, { userId: 'fixture', role: 'ADMIN', email: 'fixture.invalid' }]
    for (const session of sessions) {
        let reads = 0
        const response = await createNexusLogsHandler({
            getSession: async () => session,
            readLogs: async () => { reads++; throw new Error('storage should not run') },
        })()
        assert.equal(response.status, 401)
        assert.equal(reads, 0)
        assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
        assert.equal(response.headers.get('vary'), 'Cookie')
    }
})

test('review: session-provider errors are private and reveal neither cause nor logs', async () => {
    let reads = 0
    const response = await createNexusLogsHandler({
        getSession: async () => { throw new Error('SYNTHETIC_PRIVATE_AUTH_CAUSE') },
        readLogs: async () => { reads++; return [] },
    })()
    assert.equal(response.status, 500)
    assert.equal(reads, 0)
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0')
    assert.ok(!(await response.text()).includes('SYNTHETIC_PRIVATE_AUTH_CAUSE'))
})

const credentialUrls = [
    ['fragment session', 'https://fixture.invalid/#session=FIXTURE_FRAGMENT_SESSION', 'FIXTURE_FRAGMENT_SESSION'],
    ['fragment password alias', 'https://fixture.invalid/#pwd=FIXTURE_FRAGMENT_PASSWORD', 'FIXTURE_FRAGMENT_PASSWORD'],
    ['protocol-relative nested signature', 'https://fixture.invalid/?redirect=%2F%2Fcdn.invalid%2Fasset%3Fsignature%3DFIXTURE_NESTED_SIGNATURE', 'FIXTURE_NESTED_SIGNATURE'],
] as const

for (const [label, input, secret] of credentialUrls) {
    test(`review: ${label} is redacted in stored text and structured diagnostics`, () => {
        assert.ok(!redactLogText(input).includes(secret), `${label} survived text redaction`)
        assert.ok(!sanitizeLogDetails(JSON.stringify({ runId: 'review-run', url: input }))!.includes(secret), `${label} survived JSON redaction`)
    })
}

test('review: ordinary user cannot receive historical URL credentials through summaries', async () => {
    const response = await createNexusLogsHandler({
        getSession: async () => ({ userId: 'fixture', role: 'user', email: 'fixture@example.invalid' }),
        readLogs: async () => [{
            id: 'fixture-log', level: 'ERROR', campaignId: 'fixture-campaign', createdAt: new Date('2026-10-14T00:00:00Z'),
            message: 'Navigation https://fixture.invalid/#session=FIXTURE_SUMMARY_SESSION',
            details: 'admin only SYNTHETIC_PRIVATE_DETAILS',
        }],
    })()
    assert.equal(response.status, 200)
    const [log] = await response.json()
    assert.equal(log.details, null)
    assert.ok(!log.message.includes('FIXTURE_SUMMARY_SESSION'))
})

test('review: redaction preserves scheduler outcome and ownership diagnostics without claim credentials', () => {
    const raw = JSON.stringify({
        runId: 'fixture-run', jobId: 'fixture-job', campaignId: 'fixture-campaign', stage: 'persist',
        outcome: 'PARTIAL', attempts: 2, lockedUntil: '2026-10-14T15:00:00Z',
        claimToken: 'FIXTURE_CLAIM_CREDENTIAL', errorCode: 'ACK_FAILED',
        captureSummary: { claimed: 3, success: 1, failed: 1, requeued: 1 },
    })
    const safe = sanitizeLogDetails(raw)!
    const parsed = JSON.parse(safe)
    assert.ok(!safe.includes('FIXTURE_CLAIM_CREDENTIAL'))
    assert.equal(parsed.jobId, 'fixture-job')
    assert.equal(parsed.outcome, 'PARTIAL')
    assert.equal(parsed.errorCode, 'ACK_FAILED')
    assert.equal(parsed.lockedUntil, '2026-10-14T15:00:00Z')
    assert.deepEqual(parsed.captureSummary, { claimed: 3, success: 1, failed: 1, requeued: 1 })
})
