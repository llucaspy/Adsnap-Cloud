import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT, jwtVerify } from 'jose'
import { getJwtSecret } from '../src/lib/sessionSecret'

test('sessions fail closed without a private key and reject tokens signed with the public legacy key', async () => {
    const previous = process.env.AUTH_SECRET
    try {
        for (const key of [undefined, '', 'short', ' '.repeat(40), 'adsnap-v2-secret-key-change-in-production-2026']) {
            if (key === undefined) delete process.env.AUTH_SECRET
            else process.env.AUTH_SECRET = key
            assert.throws(() => getJwtSecret(), /private signing key/)
        }
        process.env.AUTH_SECRET = 'synthetic-private-session-key-for-unit-tests-only'
        const claims = { userId: 'fixture', role: 'admin', email: 'fixture@example.invalid' }
        const legacy = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1m')
            .sign(new TextEncoder().encode('adsnap-v2-secret-key-change-in-production-2026'))
        await assert.rejects(jwtVerify(legacy, getJwtSecret()))
        const token = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1m').sign(getJwtSecret())
        assert.equal((await jwtVerify(token, getJwtSecret())).payload.userId, 'fixture')
    } finally {
        if (previous === undefined) delete process.env.AUTH_SECRET
        else process.env.AUTH_SECRET = previous
    }
})
