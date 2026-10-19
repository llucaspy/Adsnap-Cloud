// Independent operational-health regression. Original worker functions, no entry point/DB/network.
import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import ts from 'typescript'

function loadWorker(bindings: Record<string, unknown>) {
    const filename = new URL('../src/scripts/worker.ts', import.meta.url)
    const text = fs.readFileSync(filename, 'utf8')
    const ast = ts.createSourceFile('worker.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const printer = ts.createPrinter()
    const source = ast.statements.filter(node => !ts.isImportDeclaration(node)
        && !(ts.isExpressionStatement(node) && node.getText(ast).startsWith('startWorker().catch')))
        .map(node => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join('\n')
    const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const ctx = vm.createContext({
        module: { exports: {} }, exports: {}, Date, Error, randomUUID, setTimeout, clearTimeout, AbortController,
        process: { env: {} }, console: { log() {}, warn() {}, error() {} },
        normalizeCaptureDelaySeconds: () => 1,
        WORKER_JOB_TYPE_CAPTURE: 'CAPTURE', WORKER_JOB_STATUS_QUEUED: 'QUEUED',
        WORKER_JOB_STATUS_PROCESSING: 'PROCESSING', WORKER_JOB_STATUS_SUCCESS: 'SUCCESS', WORKER_JOB_STATUS_FAILED: 'FAILED',
        isWorkerJobStorageMissing: () => false,
        isFederalCampaignBoundaryToday: () => false,
        getBrasiliaDayRangeFor: () => ({ start: new Date('2026-10-14T03:00:00Z'), end: new Date('2026-10-15T03:00:00Z') }),
        processPendingGamJobs: async () => {},
        reconcileCaptureIncidents: async () => {}, dispatchCaptureIncidentAlerts: async () => {},
        ...bindings,
    })
    vm.runInContext(code + '\nmodule.exports={runWorkerCycle};', ctx)
    return ctx.module.exports as { runWorkerCycle: (options: { drainQueue: boolean }) => Promise<void> }
}

test('review: scheduling database outage cannot produce an IDLE or SUCCESS healthy cycle', async () => {
    const logs: { message: string; type: string; details: string }[] = []
    const worker = loadWorker({
        nexusLogStore: { addLog: async (message: string, type: string, details: string) => logs.push({ message, type, details }) },
        prisma: {
            campaign: {
                findMany: async (query: { where: { isScheduled?: boolean } }) => {
                    if (query.where.isScheduled) throw new Error('SYNTHETIC_SCHEDULER_DB_OUTAGE')
                    return []
                },
                updateMany: async () => ({ count: 0 }),
            },
            workerJob: { findMany: async () => [] },
            settings: { findUnique: async () => null },
            $queryRawUnsafe: async () => [],
            $transaction: async (callback: (tx: object) => Promise<unknown>) => callback({ $queryRawUnsafe: async () => [] }),
        },
    })
    await assert.rejects(worker.runWorkerCycle({ drainQueue: false }), /terminou com falhas/)
    const final = logs.find(log => log.message.includes('Ciclo finalizado'))
    assert.ok(final)
    assert.equal(final.type, 'ERROR')
    assert.equal(JSON.parse(final.details).cycleStatus, 'FAILED')
})

test('review: time spent logging a claimed batch cannot start capture after its deadline', async () => {
    const epoch = Date.parse('2026-10-14T15:00:00Z')
    let clock = epoch
    class ClockDate extends Date {
        constructor(value?: string | number | Date) { super(value === undefined ? clock : value instanceof Date ? value.getTime() : value) }
        static now() { return clock }
    }
    let captureCalls = 0
    const job = { id: 'fixture-campaign', jobId: 'fixture-job', runId: 'review-owner', attempts: 1, maxAttempts: 2,
        captureDelaySeconds: 1, timeoutMs: null, client: 'fixture', pi: 'fixture', format: '300x250' }
    const tx = {
        $queryRawUnsafe: async (sql: string) => sql.includes('join lateral') ? [{ id: job.id }]
            : sql.includes('update "WorkerJob"') ? [job] : [{ id: job.id }],
        campaign: { updateMany: async () => ({ count: 1 }) },
        workerJob: { updateMany: async () => ({ count: 1 }) },
    }
    const worker = loadWorker({
        Date: ClockDate,
        process: { env: { NEXUS_WORKER_MAX_RUNTIME_MS: '10000', NEXUS_CAPTURE_CONCURRENCY: '1' } },
        processCampaign: async () => { captureCalls++; return { success: true } },
        assertCaptureOwnership: async () => {},
        nexusLogStore: { addLog: async (message: string) => { if (message.includes('Processando lote')) clock += 9000 } },
        prisma: {
            campaign: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
            workerJob: { findMany: async () => [], updateMany: async () => ({ count: 1 }), findFirst: async () => ({ id: job.jobId }) },
            $transaction: async (callback: (tx: object) => Promise<unknown>) => callback(tx),
        },
    })
    await worker.runWorkerCycle({ drainQueue: false })
    assert.equal(captureCalls, 0, 'a claimed task began after the configured cycle deadline')
})
