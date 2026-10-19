import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupabaseForSignal } from '../src/lib/supabase'

test('Supabase upload transport receives the capture abort without retrying or contacting a real provider', async () => {
    const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const oldFetch = globalThis.fetch
    const controller = new AbortController()
    let calls = 0
    let transportSignal: AbortSignal | null | undefined
    try {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key-for-transport-test-only'
        globalThis.fetch = async (_input, init) => {
            calls++
            transportSignal = init?.signal
            return new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
                controller.abort(new Error('SYNTHETIC_CAPTURE_CANCELLED'))
            })
        }
        const result = await getSupabaseForSignal(controller.signal).storage.from('screenshots').upload('fixture.png', Buffer.from('png'), { upsert: false })
        assert.ok(result.error)
        assert.equal(transportSignal?.aborted, true)
        assert.equal(calls, 1)
    } finally {
        globalThis.fetch = oldFetch
        if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
        else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl
        if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
        else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey
    }
})
