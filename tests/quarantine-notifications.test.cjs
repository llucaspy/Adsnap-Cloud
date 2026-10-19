/* Isolated delivery tests: no live Telegram, database or production dispatch. */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

function load(relative, names, bindings = {}) {
    const file = path.resolve(__dirname, '..', relative)
    const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const printer = ts.createPrinter()
    const source = ast.statements.filter(node => !ts.isImportDeclaration(node)).map(node => printer.printNode(ts.EmitHint.Unspecified, node, ast)).join('\n')
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
    const context = vm.createContext({ exports: {}, module: { exports: {} }, Date, URL, process: { env: {} }, ...bindings })
    vm.runInContext(js + '\nmodule.exports={' + names.join(',') + '}', context)
    return context.module.exports
}
const { sanitizeLogMessage } = load('src/lib/logRedaction.ts', ['sanitizeLogMessage'])
const diagnosis = load('src/lib/captureFailure.ts', ['describeCaptureFailure', 'readCaptureAttempt'], { sanitizeLogMessage })

function fixture(options = {}) {
    const incidents = new Map(), messages = []
    const job = { id: 'job-1', status: 'FAILED', attempts: 2, maxAttempts: 2, finishedAt: new Date(),
        lastError: 'Upload failed https://preview.test/path?token=private-token',
        campaign: { id: 'c1', client: 'Cliente', pi: '000', campaignName: 'Campanha', format: 'Formato', device: 'mobile', status: 'FAILED' } }
    const prisma = {
        $queryRaw: async () => incidents.has('capture-incident-job-1') ? [] : [{ id: 'job-1' }],
        workerJob: { findUnique: async () => job },
        settings: { findUnique: async () => ({ telegramAlertsEnabled: !options.disabled }) },
        nexusLog: {
            upsert: async ({ where, create }) => { if (!incidents.has(where.id)) incidents.set(where.id, create) },
            findMany: async () => [...incidents.values()].filter(item => item.level === 'CAPTURE_ALERT_PENDING'),
            updateMany: async ({ where, data }) => { const record = incidents.get(where.id); if (record?.level === where.level) Object.assign(record, data) },
        },
    }
    const api = load('src/lib/quarantineNotifications.ts', ['reconcileCaptureIncidents', 'dispatchCaptureIncidentAlerts'], {
        prisma, ...diagnosis, sanitizeLogMessage,
        sendTelegramAlert: async (...args) => { messages.push(args); if (options.throwSend) throw Error('network down'); return options.sendResult !== false },
    })
    return { api, incidents, messages, job }
}

test('terminal failure produces one durable incident and one contextual alert with diagnostic link', async () => {
    const { api, incidents, messages } = fixture()
    await api.reconcileCaptureIncidents(); await api.reconcileCaptureIncidents()
    assert.equal(incidents.size, 1)
    const record = [...incidents.values()][0]
    assert.ok(!record.details.includes('private-token'))
    await api.dispatchCaptureIncidentAlerts(); await api.dispatchCaptureIncidentAlerts()
    assert.equal(messages.length, 1); assert.equal(record.level, 'CAPTURE_ALERT_SENT')
    assert.match(messages[0][1], /PI 000/); assert.match(messages[0][1], /2\/2/)
    assert.equal(messages[0][4].url, 'https://adsnap-cloud.vercel.app/quarantine/job-1')
    assert.equal(messages[0][5].dedupeKey, record.id)
    assert.ok(!JSON.stringify(messages).includes('private-token'))
})

test('Telegram rejection leaves the incident pending and a later cycle can retry', async () => {
    const options = { sendResult: false }
    const { api, incidents, messages } = fixture(options)
    await api.reconcileCaptureIncidents(); await api.dispatchCaptureIncidentAlerts()
    assert.equal([...incidents.values()][0].level, 'CAPTURE_ALERT_PENDING')
    options.sendResult = true
    await api.dispatchCaptureIncidentAlerts()
    assert.equal(messages.length, 2); assert.equal([...incidents.values()][0].level, 'CAPTURE_ALERT_SENT')
})

test('disabled alerts keep the incident for review without sending', async () => {
    const { api, incidents, messages } = fixture({ disabled: true })
    await api.reconcileCaptureIncidents(); await api.dispatchCaptureIncidentAlerts()
    assert.equal(messages.length, 0); assert.equal(incidents.size, 1)
})

test('transport exception never acknowledges an unsent incident', async () => {
    const { api, incidents } = fixture({ throwSend: true })
    await api.reconcileCaptureIncidents()
    await assert.rejects(api.dispatchCaptureIncidentAlerts(), /network down/)
    assert.equal([...incidents.values()][0].level, 'CAPTURE_ALERT_PENDING')
})

test('recovery ignores a job that no longer represents a terminal failure', async () => {
    const { api, incidents, job } = fixture()
    job.status = 'SUCCESS'
    await api.reconcileCaptureIncidents()
    assert.equal(incidents.size, 0)
})

test('attempt history rejects another job and sanitizes private error URLs', () => {
    const event = { jobId: 'job-1', attempt: 2, runId: 'run-2', phase: 'FAILED', error: 'https://test.invalid/?token=secret-value' }
    assert.equal(diagnosis.readCaptureAttempt(JSON.stringify(event), 'other-job'), null)
    assert.equal(diagnosis.readCaptureAttempt(JSON.stringify({ ...event, attempt: -1 }), 'job-1'), null)
    assert.ok(!diagnosis.readCaptureAttempt(JSON.stringify(event), 'job-1').error.includes('secret-value'))
})

test('failure hints distinguish timeout, missing selector and storage without dimension rules', () => {
    assert.equal(diagnosis.describeCaptureFailure('Timeout de 120s').category, 'Tempo esgotado')
    assert.equal(diagnosis.describeCaptureFailure('Selector not found').category, 'Localização do anúncio')
    assert.equal(diagnosis.describeCaptureFailure('Drive upload failed').category, 'Armazenamento')
})

test('reprocessing requires admin authorization before reading or mutating any campaign', async () => {
    let reads = 0, enqueues = 0
    const api = load('src/app/quarantine/actions.ts', ['retryQuarantinedCapture'], {
        requireAdmin: async () => { throw Error('Unauthorized: Admin access required') },
        prisma: { workerJob: { findUnique: async () => { reads++; return null } } },
        enqueueCaptureJobs: async () => { enqueues++ },
    })
    await assert.rejects(api.retryQuarantinedCapture('job-1'), /Unauthorized/)
    assert.equal(reads, 0); assert.equal(enqueues, 0)
})

test('reprocessing reports a pending worker honestly and preserves the failed job', async () => {
    const invalidated = []
    const api = load('src/app/quarantine/actions.ts', ['retryQuarantinedCapture'], {
        requireAdmin: async () => ({}),
        prisma: { workerJob: { findUnique: async () => ({ type: 'CAPTURE', status: 'FAILED', campaign: { id: 'c1', status: 'QUARANTINE', isArchived: false } }) } },
        enqueueCaptureJobs: async (ids, options) => { assert.equal(options.requireFailureStatus, true); return { campaignIds: ids } },
        triggerNexusWorker: async () => false,
        revalidatePath: value => invalidated.push(value),
    })
    const result = await api.retryQuarantinedCapture('job-1')
    assert.match(result.message, /aguarda o próximo worker/)
    assert.ok(invalidated.includes('/quarantine/job-1'))
})
