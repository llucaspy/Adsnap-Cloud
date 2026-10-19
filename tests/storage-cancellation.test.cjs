const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const { setTimeout: waitForStorage } = require('node:timers/promises')

function load(extra = {}) {
    const source = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/captureStorage.ts'), 'utf8')
        .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[^\S\r\n]*[\r\n]+/gm, '').replace(/^export\s+/gm, '')
    const context = vm.createContext({ Buffer, Error, Date, AbortSignal, AbortController, setTimeout, clearTimeout,
        crypto: require('node:crypto'), Readable: require('node:stream').Readable, waitForStorage,
        console: { warn() {}, log() {}, error() {} }, process: { env: { NEXUS_CAPTURE_STORAGE_PROVIDER: 'google-drive' } }, ...extra })
    vm.runInContext(stripTypeScriptTypes(source) + `
        globalThis.unit = { withDriveRetry, uploadCaptureImage, withDriveFolderLock,
          setDrive: drive => { driveClientPromise = Promise.resolve(drive) },
          skipFolderResolution: () => { ensureDriveCaptureFolder = async () => 'fixture-parent' } }`, context)
    return context.unit
}

test('Drive abort reaches the in-flight request and never starts fallback storage', async () => {
    const controller = new AbortController()
    let calls = 0, fallback = 0
    const unit = load({ getSupabaseForSignal: () => { fallback++; throw Error('unexpected fallback') } })
    unit.skipFolderResolution()
    unit.setDrive({ files: { create: (_request, options) => new Promise((_resolve, reject) => {
        calls++
        assert.equal(options.timeout, 30_000)
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
        controller.abort(new Error('SYNTHETIC_CAPTURE_TIMEOUT'))
    }) } })
    await assert.rejects(unit.uploadCaptureImage(Buffer.from('png'), { campaignId: 'fixture', campaign: {}, signal: controller.signal }), /SYNTHETIC_CAPTURE_TIMEOUT/)
    assert.equal(calls, 1)
    assert.equal(fallback, 0)
})

test('Drive retry backoff is abortable and does not make another provider request', async () => {
    const controller = new AbortController()
    const unit = load()
    let calls = 0
    const pending = unit.withDriveRetry(async () => { calls++; throw Object.assign(new Error('temporary'), { code: 503 }) }, 'fixture', controller.signal)
    setTimeout(() => controller.abort(), 5)
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(calls, 1)
})

test('Drive folder lock failure cannot fall back to uncoordinated folder creation', async () => {
    let created = 0
    const unit = load({ prisma: { $transaction: async () => { throw Error('SYNTHETIC_DB_LOCK_FAILURE') } } })
    await assert.rejects(unit.withDriveFolderLock('fixture', async () => { created++ }), /SYNTHETIC_DB_LOCK_FAILURE/)
    assert.equal(created, 0)
})

test('an already cancelled upload never opens a provider request', async () => {
    const controller = new AbortController()
    controller.abort(new Error('SYNTHETIC_CANCELLED'))
    const unit = load()
    await assert.rejects(unit.uploadCaptureImage(Buffer.from('png'), { campaignId: 'fixture', campaign: {}, signal: controller.signal }), /SYNTHETIC_CANCELLED/)
})
