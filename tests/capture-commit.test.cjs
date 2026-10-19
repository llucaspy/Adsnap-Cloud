/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS VM harness isolates source imports and production side effects. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const playwright = require('playwright');
const http = require('node:http');

function load(overrides = {}) {
    const file = path.resolve(__dirname, '../src/lib/captureService.ts');
    const text = fs.readFileSync(file, 'utf8');
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const printer = ts.createPrinter();
    const source = ast.statements.filter(s => !ts.isImportDeclaration(s)).map(s => printer.printNode(ts.EmitHint.Unspecified, s, ast)).join('\n');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const state = { created: [], updated: [], ack: 0, removed: [], uploaded: 0, guards: 0, alerts: 0, fileNames: [] };
    class Lost extends Error { constructor() { super('lost'); this.code = 'CAPTURE_OWNERSHIP_LOST'; } }
    const tx = {
        capture: { create: async q => { state.created.push(q.data); overrides.afterCreate?.(); return q.data; } },
        campaign: { update: async q => { state.updated.push(q.data); return q.data; } },
        workerJob: { count: async () => overrides.activeJobs || 0 },
        $queryRawUnsafe: async () => overrides.unownedCampaign === false ? [] : [{ id: 'c1' }],
    };
    const bindings = {
        module: { exports: {} }, exports: {}, console: { log() {}, warn() {}, error() {} }, Buffer, process: { env: {} },
        setTimeout, clearTimeout, AbortController, Error,
        // This suite intentionally captures loopback fixtures. Production egress is tested separately.
        launchCaptureBrowser: options => playwright.chromium.launch(options),
        resolveCaptureDestination: async () => {},
        createHash: require('node:crypto').createHash,
        randomUUID: require('node:crypto').randomUUID,
        CaptureOwnershipLostError: Lost,
        assertCaptureOwnership: async () => { state.guards++; if (overrides.loseOnGuard === state.guards) throw new Lost(); },
        completeCaptureOwnership: async () => { state.ack++; },
        nexusLogStore: { addLog: async message => { if (overrides.failFinalLog && message.includes('Processo finalizado')) throw Error('log outage'); } },
        getCaptureStorageProviderLabel: () => 'test-storage',
        uploadCaptureImage: async (buffer, input) => { state.uploaded++; state.fileNames.push(input.fileName); const uri=overrides.sharedStore?`test://new-upload/${input.fileName}`:'test://new-upload';overrides.sharedStore?.set(uri,buffer);overrides.onUpload?.();return { uri, provider: 'test', size: 5 }; },
        deleteCaptureFile: async uri => { state.removed.push(uri); overrides.sharedStore?.delete(uri);return true; },
        alertStore: { addAlert: () => { state.alerts++; } }, sendTelegramAlert: async () => { state.alerts++; },
        prisma: { campaign: { findUnique: async () => overrides.campaign }, settings: { findUnique: async () => ({ nexusMaxRetries: 3, nexusDelay: 1 }) }, $transaction: async fn => { const before = { created: state.created.length, updated: state.updated.length, ack: state.ack }; try { return await fn(tx); } catch (error) { state.created.length = before.created; state.updated.length = before.updated; state.ack = before.ack; throw error; } } },
        ...overrides.bindings,
    };
    const context = vm.createContext(bindings);
    vm.runInContext(compiled + '\nmodule.exports={saveCapture,assertCaptureMayWrite,processCampaign,_executeCapture,setCapture:handler=>{_executeCapture=handler},setFinalImage:handler=>{prepareFinalCaptureImage=handler}};', context);
    return { api: context.module.exports, state, Lost };
}
const ownership = { campaignId: 'c1', runId: 'run-1', jobId: 'job-1', attempt: 1 };
const metadata = { mode: 'OBSERVED', rawSha256: 'raw-digest', finalSha256: 'final-digest', rawPreserved: false, validation: { state: 'CONFIRMED', reason: 'IMAGE_DECODED' } };

test('capture and campaign success plus queue ACK commit under the same ownership fence', async () => {
    const { api, state } = load();
    const result = await api.saveCapture({}, Buffer.from('final'), 'c1', { ownership }, metadata);
    assert.equal(result.success, true); assert.equal(state.guards, 2); assert.equal(state.created.length, 1); assert.equal(state.updated.length, 1); assert.equal(state.ack, 1);
    assert.deepEqual(JSON.parse(state.created[0].auditNotes), metadata);
});

function validationBindings() {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/captureValidation.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const context = vm.createContext({module:{exports:{}},exports:{}});
    vm.runInContext(js + '\nmodule.exports={matchesCaptureDimensions,inspectCreativeContent};', context);
    return context.module.exports;
}
test('real browser capture pipeline rejects wrong/empty configured slot, never replaces it with another valid ad, and accepts a white creative', async () => {
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250"><rect width="300" height="250" fill="white"/></svg>');
    const valid = `<img width="300" height="250" src="${image}">`;
    const pages = {
        '/wrong': `<div id="configured" style="width:970px;height:90px"></div><div id="banner">${valid}</div>`,
        '/empty': `<div id="configured" style="width:300px;height:250px"></div><div id="banner">${valid}</div>`,
        '/white': `<div id="configured" style="width:300px;height:250px">${valid}</div>`,
    };
    const server = http.createServer((request, response) => { response.setHeader('Content-Type','text/html'); response.end(pages[request.url] || 'missing'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    try {
        for (const route of ['/wrong','/empty','/white']) {
            const { api, state } = load({campaign:{url:`http://127.0.0.1:${address.port}${route}`,format:'test',device:'desktop',client:'test',captureDelaySeconds:1},bindings:{chromium:playwright.chromium,devices:playwright.devices,normalizeCaptureDelaySeconds:value=>Math.max(1,value||1),...validationBindings()}});
            // The existing decorative frame is outside this validation/commit integration test.
            api.setFinalImage(async raw => raw);
            const result = await api._executeCapture('c1',{nexusTimeout:5000,bannerFormats:JSON.stringify([{id:'test',width:300,height:250,selector:'#configured'}])},{ownership});
            assert.equal(result.success, route==='/white', `${route}: ${result.error||'success'}`);
            assert.equal(state.uploaded, route==='/white'?1:0);
            assert.equal(state.created.length, route==='/white'?1:0);
            if (route==='/white') { const evidence=JSON.parse(state.created[0].auditNotes); assert.equal(evidence.mode,'OBSERVED');assert.equal(evidence.rawPreserved,false);assert.match(evidence.rawSha256,/^[a-f0-9]{64}$/); }
        }
    } finally { await new Promise(resolve=>server.close(resolve)); }
});
test('abort while provider is uploading creates no SUCCESS and clears no campaign owner', async () => {
    const controller = new AbortController(); const { api, state } = load({ onUpload: () => controller.abort(new Error('deadline')) });
    await assert.rejects(api.saveCapture({}, Buffer.from('final'), 'c1', { ownership, signal: controller.signal }), /deadline/);
    assert.equal(state.created.length, 0); assert.equal(state.updated.length, 0); assert.equal(state.ack, 0); assert.deepEqual(state.removed, ['test://new-upload']);
});
test('ownership lost during upload prevents commit and removes only the uncommitted upload', async () => {
    const { api, state } = load({ loseOnGuard: 2 });
    await assert.rejects(api.saveCapture({}, Buffer.from('final'), 'c1', { ownership }), error => error.code === 'CAPTURE_OWNERSHIP_LOST');
    assert.equal(state.created.length, 0); assert.equal(state.updated.length, 0); assert.equal(state.ack, 0); assert.deepEqual(state.removed, ['test://new-upload']);
});
test('cancellation between evidence insert and campaign update rolls the transaction back', async () => {
    const controller = new AbortController(); const { api, state } = load({ afterCreate: () => controller.abort() });
    await assert.rejects(api.saveCapture({}, Buffer.from('final'), 'c1', { ownership, signal: controller.signal }));
    assert.equal(state.created.length, 0); assert.equal(state.updated.length, 0); assert.equal(state.ack, 0);
});
test('legacy call without ownership cannot clear a claimed Campaign or an active WorkerJob', async () => {
    for (const options of [{ unownedCampaign: false }, { activeJobs: 1 }]) {
        const { api, state } = load(options);
        await assert.rejects(api.saveCapture({}, Buffer.from('final'), 'c1'), error => error.code === 'CAPTURE_OWNERSHIP_LOST');
        assert.equal(state.uploaded, 0); assert.equal(state.updated.length, 0);
    }
});
test('post-commit log outage cannot turn a saved capture into a retry', async () => {
    const { api, state } = load({ failFinalLog: true });
    assert.equal((await api.saveCapture({}, Buffer.from('final'), 'c1', { ownership })).success, true);
    assert.equal(state.created.length, 1); assert.equal(state.ack, 1);
});
test('structured job has one capture attempt and leaves transient retries to the fenced queue', async () => {
    const { api, state } = load(); let attempts = 0;
    api.setCapture(async () => { attempts++; return { success: false, error: 'CREATIVE_NOT_CONFIRMED' }; });
    const result = await api.processCampaign('c1', { ownership });
    assert.equal(attempts, 1); assert.equal(result.success, false); assert.equal(result.quarantined, undefined);
    assert.equal(state.updated.length, 0); assert.equal(state.created.length, 0); assert.equal(state.alerts, 0);
});
test('lost ownership cannot persist quarantine or emit its notifications', async () => {
    const { api, state } = load({ loseOnGuard: 1 });
    api.setCapture(async () => ({ success: false, error: 'permanent', nonRetryable: true }));
    const result = await api.processCampaign('c1', { ownership });
    assert.equal(result.aborted, true); assert.equal(result.error, 'CAPTURE_OWNERSHIP_LOST');
    assert.equal(state.updated.length, 0); assert.equal(state.created.length, 0); assert.equal(state.alerts, 0);
});
test('two captures in the same hour have exclusive PNG keys; later abort cannot delete earlier evidence', async () => {
    const store = new Map(); const controller = new AbortController(); let uploads=0;
    const { api, state } = load({sharedStore:store,onUpload:()=>{if(++uploads===2)controller.abort();}});
    const first=await api.saveCapture({},Buffer.from('first'),'c1',{ownership});
    await assert.rejects(api.saveCapture({},Buffer.from('second'),'c1',{ownership,signal:controller.signal}));
    assert.equal(state.fileNames.length,2);assert.notEqual(state.fileNames[0],state.fileNames[1]);
    for(const fileName of state.fileNames)assert.match(fileName,/^evidence-[a-f0-9-]{36}\.png$/);
    assert.equal(store.size,1);assert.equal(store.get(first.filePath).toString(),'first');assert.notEqual(state.removed[0],first.filePath);
});
