// Independent storage-identity regression; original saveCapture, fake provider/DB only.
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { createHash, randomUUID } from 'node:crypto'
import ts from 'typescript'

test('review: repeated captures use separate provider objects and abort deletes only its new upload', async () => {
    const text = fs.readFileSync(new URL('../src/lib/captureService.ts', import.meta.url), 'utf8')
    const ast = ts.createSourceFile('captureService.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const printer = ts.createPrinter()
    const source = ast.statements.filter(node => !ts.isImportDeclaration(node))
        .map(node => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join('\n')
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const objects = new Map<string, Buffer>()
    const uploadedNames: string[] = []
    const captures: string[] = []
    let abortAfterUpload: AbortController | undefined
    const tx = {
        capture: { create: async ({ data }: { data: { screenshotPath: string } }) => { captures.push(data.screenshotPath) } },
        campaign: { update: async () => {} },
    }
    const ctx = vm.createContext({
        module: { exports: {} }, exports: {}, Date, Error, Buffer, AbortController, setTimeout, clearTimeout, createHash, randomUUID,
        process: { env: {} }, console: { log() {}, warn() {}, error() {} },
        assertCaptureOwnership: async () => {}, completeCaptureOwnership: async () => {},
        prisma: { $transaction: async (callback: (tx: object) => Promise<unknown>) => callback(tx) },
        getCaptureStorageProviderLabel: () => 'fake-provider',
        nexusLogStore: { addLog: async () => {} },
        uploadCaptureImage: async (buffer: Buffer, input: { fileName: string }) => {
            assert.ok(input.fileName, 'upload must carry a distinct capture identity')
            assert.ok(!uploadedNames.includes(input.fileName), 'an earlier immutable object would be overwritten')
            uploadedNames.push(input.fileName)
            const uri = `fake://${input.fileName}`
            objects.set(uri, buffer)
            abortAfterUpload?.abort(new Error('SYNTHETIC_ABORT_AFTER_UPLOAD'))
            return { uri, provider: 'fake-provider' }
        },
        deleteCaptureFile: async (uri: string) => { objects.delete(uri) },
    })
    vm.runInContext(compiled + '\nmodule.exports={saveCapture};', ctx)
    const options = { ownership: { campaignId: 'fixture', runId: 'review-owner' } }
    await ctx.module.exports.saveCapture({}, Buffer.from('first'), 'fixture', options)
    await ctx.module.exports.saveCapture({}, Buffer.from('second'), 'fixture', options)
    assert.equal(new Set(uploadedNames).size, 2)
    assert.equal(captures.length, 2)
    abortAfterUpload = new AbortController()
    await assert.rejects(ctx.module.exports.saveCapture({}, Buffer.from('aborted'), 'fixture', { ...options, signal: abortAfterUpload.signal }))
    assert.equal(uploadedNames.length, 3)
    assert.equal(captures.length, 2)
    assert.equal(objects.size, 2)
    assert.equal(objects.get(captures[0])?.toString(), 'first')
    assert.equal(objects.get(captures[1])?.toString(), 'second')
})
