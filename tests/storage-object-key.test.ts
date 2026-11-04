import assert from 'node:assert/strict'
import test from 'node:test'
import { supabaseObjectKey } from '../src/lib/storageObjectKey'

test('Supabase fallback accepts Portuguese campaign names while preserving unique evidence identity', () => {
    const folder = '2026/11 - Novembro/04/PACTO CONTRA O FEMINICÍDIO/PI 355 - SECOM/PR'
    const first = supabaseObjectKey(`${folder}/evidence-fe2a288f-a686-4e12-ad5c-1b469f2d8b60.png`)
    const second = supabaseObjectKey(`${folder}/evidence-other-unique-id.png`)
    assert.equal(first, '2026/11 - Novembro/04/PACTO CONTRA O FEMINICIDIO/PI 355 - SECOM/PR/evidence-fe2a288f-a686-4e12-ad5c-1b469f2d8b60.png')
    assert.notEqual(first, second)
    assert.equal(supabaseObjectKey('Saúde/ação.png'), supabaseObjectKey('Sau\u0301de/ac\u0327a\u0303o.png'))
    assert.equal(supabaseObjectKey('safe/capture-id.png'), 'safe/capture-id.png')
    assert.match(supabaseObjectKey('日本語/🧪/../file.png'), /^[a-zA-Z0-9_./ -]+$/)
    assert(!supabaseObjectKey('日本語/🧪/../file.png').split('/').includes('..'))
})
