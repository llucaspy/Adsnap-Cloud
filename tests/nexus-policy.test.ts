import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nexusAuthority, publicNexusAction, nexusReply } from '../src/lib/nexusPolicy'
import { validateRepairEdits, applyRepairText } from '../src/lib/supportRepair'

test('Nexus public authority allows only operational help and protects private technical action data', () => {
    const policy = nexusAuthority(false)
    assert.equal(policy.currentUserIsOwner, false)
    assert.equal(policy.owner.account, 'devls')
    assert(policy.forbidden.some(text => text.includes('código-fonte')))
    assert.equal(policy.repairException.internalOnly, true)
    const action = { type: 'TECHNICAL_REVIEW', payload: { reason: 'PRIVATE_SOURCE_CANARY' }, result: { code: 'PRIVATE_SOURCE_CANARY' } }
    assert(!JSON.stringify(publicNexusAction(action, false)).includes('PRIVATE_SOURCE_CANARY'))
    assert(JSON.stringify(publicNexusAction(action, true)).includes('PRIVATE_SOURCE_CANARY'))
})
test('internal capture candidates are bounded and reject protected files or privileged code', () => {
    const edit = { file: 'src/lib/campaignSchedule.ts', before: 'const slot = slots[0]', after: 'const slot = slots.at(0)' }
    assert.deepEqual(validateRepairEdits([edit]), [edit])
    for (const value of [[{ ...edit, file: '../../.env' }], [{ ...edit, file: 'src/lib/auth.ts' }], [{ ...edit, after: 'process.env.DATABASE_URL' }], [{ ...edit, after: 'fetch("https://external.invalid")' }], [{ ...edit, after: 'return allowVerifiedPackagePreview' }], [edit, edit, edit]]) assert.throws(() => validateRepairEdits(value))
    assert.throws(() => validateRepairEdits([{ ...edit, after: 'x\n'.repeat(90) }]))
})
test('candidate substitutions require a unique exact source match and preserve literal replacement text', () => {
    assert.throws(() => applyRepairText('a a', 'a', 'b'), /único/)
    assert.throws(() => applyRepairText('abc', 'missing', 'b'), /único/)
    assert.equal(applyRepairText('const slot = slots[0]', 'slots[0]', '$& literal'), 'const slot = $& literal')
})

test('non-owner responses cannot relay fenced source, implementation paths, API routes or secret names', () => {
    const source = 'Fonte: src/lib/captureService.ts. API /api/support/private. AUTH_SECRET\n```ts\nconst PRIVATE_CODE = 1\n```'
    const publicText = nexusReply(source, false)
    assert(!publicText.includes('PRIVATE_CODE')); assert(!publicText.includes('/api/')); assert(!publicText.includes('src/lib/')); assert(!publicText.includes('AUTH_SECRET'))
    assert.equal(nexusReply(source, true), source)
    assert.equal(nexusReply('Abra o book em /books/123 para conferir seus prints.', false), 'Abra o book em /books/123 para conferir seus prints.')
})
