import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSupportSameOrigin } from '../src/lib/supportOrigin'

test('support checks the actual browser Host when Next normalizes the internal URL', () => {
    assert(isSupportSameOrigin(new Request('http://localhost:4328/api/support', { headers: { host: '127.0.0.1:4328', origin: 'http://127.0.0.1:4328' } })))
    assert(isSupportSameOrigin(new Request('https://internal.vercel.app/api/support', { headers: { host: 'adsnap-cloud.vercel.app', origin: 'https://adsnap-cloud.vercel.app' } })))
})
test('support refuses missing, cross-site, downgraded and wrong-port origins and ignores forwarded-host spoofing', () => {
    for (const origin of ['', 'null', 'https://attacker.invalid', 'http://adsnap-cloud.vercel.app', 'https://adsnap-cloud.vercel.app:444']) {
        assert.equal(isSupportSameOrigin(new Request('https://internal.vercel.app/api/support', { headers: { host: 'adsnap-cloud.vercel.app', origin, 'x-forwarded-host': 'attacker.invalid' } })), false)
    }
    assert.equal(isSupportSameOrigin(new Request('http://localhost:4328/api/support', { headers: { host: '127.0.0.1:4328', origin: 'http://localhost:4328' } })), false)
})
