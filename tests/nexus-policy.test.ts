import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nexusAuthority, publicNexusAction, nexusReply } from '../src/lib/nexusPolicy'
import { validateRepairEdits, applyRepairText, stageSupportRepairCandidate } from '../src/lib/supportRepair'
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

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
    assert.equal(applyRepairText('outside\r\nconst slot = slots[0]\r\nreturn slot\r\nend', 'const slot = slots[0]\nreturn slot', 'const slot = slots.at(0)\nreturn slot'), 'outside\r\nconst slot = slots.at(0)\r\nreturn slot\r\nend')
})

test('non-owner responses cannot relay fenced source, implementation paths, API routes or secret names', () => {
    const source = 'Fonte: src/lib/captureService.ts. API /api/support/private. AUTH_SECRET\n```ts\nconst PRIVATE_CODE = 1\n```'
    const publicText = nexusReply(source, false)
    assert(!publicText.includes('PRIVATE_CODE')); assert(!publicText.includes('/api/')); assert(!publicText.includes('src/lib/')); assert(!publicText.includes('AUTH_SECRET'))
    assert.equal(nexusReply(source, true), source)
    assert.equal(nexusReply('Abra o book em /books/123 para conferir seus prints.', false), 'Abra o book em /books/123 para conferir seus prints.')
})

test('a scoped repair changes only the isolated candidate and leaves the running source untouched', async () => {
    const directory = await mkdtemp(resolve(tmpdir(), 'adsnap-nexus-repair-test-'))
    const root = resolve(directory, 'repo'), candidates = resolve(directory, 'candidates')
    await mkdir(resolve(root, 'src/lib'), { recursive: true })
    const file = 'src/lib/campaignSchedule.ts', before = 'const slot = slots[0]', after = 'const slot = slots.at(0)'
    const original = `export function choose(slots: number[]) { ${before}; return slot }\n`
    await writeFile(resolve(root, file), original)
    const git = (args: string[]) => execFileSync('git', args, { cwd: root, windowsHide: true, stdio: 'pipe' })
    try {
        git(['init']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@local.invalid', 'commit', '-m', 'fixture'])
        const result = await stageSupportRepairCandidate(root, randomUUID(), [{ file, before, after }], candidates)
        assert.equal(result.productionChanged, false); assert.equal(result.regressionTestRequired, true)
        assert.equal(await readFile(resolve(root, file), 'utf8'), original)
        assert((await readFile(resolve(result.worktree, file), 'utf8')).includes(after))
        assert.equal(git(['status', '--porcelain']).toString().trim(), '')
    } finally {
        const target = await realpath(directory), temp = await realpath(tmpdir())
        assert.equal(dirname(target), temp); assert(basename(target).startsWith('adsnap-nexus-repair-test-'))
        await rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
})
