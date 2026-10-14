import test from 'node:test'
import assert from 'node:assert/strict'
import { sessionSigningKey } from '../src/lib/sessionSecret'

test('missing and public default signing keys fail closed', () => {
    for (const key of [undefined, '', '  ', 'adsnap-v2-secret-key-change-in-production-2026']) {
        assert.throws(() => sessionSigningKey(key), /AUTH_SECRET is required/)
    }
})

test('configured keys remain stable across web and middleware consumers', () => {
    const fixture = 'fixture-only-signing-key-not-a-deployment-credential'
    assert.deepEqual(sessionSigningKey(fixture), new TextEncoder().encode(fixture))
})
