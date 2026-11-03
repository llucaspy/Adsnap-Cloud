const { test } = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const http = require('node:http')
const { PassThrough } = require('node:stream')
const { EventEmitter } = require('node:events')
const load = () => import('../scripts/codex-personal/bridge.mjs')

function fakeRpc(account = { type: 'chatgpt', planType: 'plus', email: 'private@example.test' }) {
    const calls = []
    const rpc = {
        calls, onEvent() {}, async initialize() {}, send(msg) { calls.push(msg) }, close() {},
        async request(method, params) {
            calls.push({ method, params })
            if (method === 'account/read') return { account }
            if (method === 'model/list') return { data: [{ model: 'account-default', isDefault: true }] }
            if (method === 'config/read') return { config: { mcp_servers: { database: {} }, plugins: { 'email@vendor': {} } } }
            if (method === 'thread/start') return { thread: { id: `thread-${calls.length}` } }
            if (method === 'turn/start') return { turn: { id: 'turn-1' } }
            return {}
        },
    }
    return rpc
}

test('personal Codex requires ChatGPT auth, omits account identity and refuses API credentials', async () => {
    const { PersonalAgent } = await load()
    const valid = new PersonalAgent({ rpcFactory: () => fakeRpc() })
    assert.deepEqual(await valid.ready(), { authenticated: true, plan: 'plus', personal: true })
    for (const account of [null, { type: 'apiKey' }, { type: 'amazonBedrock' }]) {
        const invalid = new PersonalAgent({ rpcFactory: () => fakeRpc(account) })
        await assert.rejects(() => invalid.ready(), /não aceita chave de API/)
    }
})

test('personal sessions bind cwd and mode, preserve turns, prevent concurrent dispatch and expose completion', async () => {
    const { PersonalAgent } = await load()
    const rpc = fakeRpc()
    const agent = new PersonalAgent({ repo: 'ignored', rpcFactory: () => rpc, workspaceFactory: () => ({ cwd: '/isolated/adsnap', branch: 'codex/personal/test' }) })
    const session = await agent.start('read')
    assert.equal(rpc.calls.find(c => c.method === 'thread/start').params.sandbox, 'read-only')
    const config = rpc.calls.find(c => c.method === 'thread/start').params.config
    assert.equal(config.mcp_servers.database.enabled, false)
    assert.equal(config.plugins['email@vendor'].enabled, false)
    assert.equal(config.web_search, 'disabled')
    const attempts = await Promise.allSettled([agent.message(session.id, 'Analise o worker'), agent.message(session.id, 'Não duplicar')])
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1)
    assert.equal(rpc.calls.filter(c => c.method === 'turn/start').length, 1)
    const turn = rpc.calls.find(c => c.method === 'turn/start')
    assert.deepEqual(turn.params.sandboxPolicy, { type: 'readOnly', networkAccess: false })
    const threadId = agent.session(session.id).threadId
    rpc.onEvent({ method: 'item/completed', params: { threadId, item: { type: 'agentMessage', text: 'Resultado verificado' } } })
    rpc.onEvent({ method: 'turn/completed', params: { threadId, turn: { status: 'completed' } } })
    assert.equal(agent.session(session.id).busy, false)
    assert.deepEqual(agent.session(session.id).events.map(e => e.type), ['user', 'message', 'done'])
    await agent.message(session.id, 'E como corrigir?')
    assert.equal(rpc.calls.filter(c => c.method === 'turn/start')[1].params.threadId, threadId)
    assert.throws(() => agent.session('thread-from-other-user'), /não encontrada/)
})

test('personal edit approvals are one-use, session scoped and unsupported tool requests fail closed', async () => {
    const { PersonalAgent } = await load()
    const rpc = fakeRpc()
    const agent = new PersonalAgent({ rpcFactory: () => rpc, workspaceFactory: () => ({ cwd: '/isolated/adsnap', branch: 'codex/personal/test' }) })
    const session = await agent.start('edit')
    const read = await agent.start('read')
    await agent.message(session.id, 'Corrija na cópia')
    const policy = rpc.calls.find(c => c.method === 'turn/start').params.sandboxPolicy
    assert.deepEqual(policy.writableRoots, ['/isolated/adsnap'])
    assert.equal(policy.networkAccess, false)
    const threadId = agent.session(session.id).threadId
    rpc.onEvent({ id: 80, method: 'item/commandExecution/requestApproval', params: { threadId, command: 'npm test' } })
    const approval = agent.session(session.id).events.find(e => e.type === 'approval')
    assert.throws(() => agent.approve(read.id, approval.approvalId, 'accept'), /inválida/)
    agent.approve(session.id, approval.approvalId, 'accept')
    assert.deepEqual(rpc.calls.at(-1), { id: 80, result: { decision: 'accept' } })
    assert.throws(() => agent.approve(session.id, approval.approvalId, 'accept'), /inválida/)
    rpc.onEvent({ id: 81, method: 'item/unknown/requestApproval', params: { threadId } })
    assert.equal(rpc.calls.at(-1).error.code, -32601)
    await agent.interrupt(session.id)
    assert.equal(rpc.calls.at(-1).method, 'turn/interrupt')
})

test('personal bridge rejects foreign origins, DNS rebinding, missing tokens and expiry before touching Codex', async () => {
    const { createBridge, ORIGINS } = await load()
    let calls = 0
    const agent = { async ready() { calls++; return { authenticated: true, plan: 'plus' } } }
    const token = 'a'.repeat(64)
    const { server } = createBridge({ agent, token })
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = `http://127.0.0.1:${server.address().port}`
    try {
        let r = await fetch(`${address}/status`)
        assert.equal(r.status, 401)
        r = await fetch(`${address}/status`, { headers: { Origin: 'https://attacker.example', Authorization: `Bearer ${token}` } })
        assert.equal(r.status, 403)
        const rebound = await new Promise(resolve => {
            const q = http.get(`${address}/status`, { headers: { Host: 'attacker.example', Authorization: `Bearer ${token}` } }, r => { r.resume(); resolve(r.statusCode) })
            q.on('error', resolve)
        })
        assert.equal(rebound, 403)
        assert.equal(calls, 0)
        r = await fetch(`${address}/status`, { headers: { Origin: ORIGINS[0], Authorization: `Bearer ${token}` } })
        assert.equal(r.status, 200); assert.equal(calls, 1)
        assert.equal(r.headers.get('access-control-allow-origin'), ORIGINS[0])
        assert.equal(r.headers.get('cache-control'), 'no-store')
        r = await fetch(address)
        assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/)
        assert.match(await r.text(), /#codex-pair=/)
        r = await fetch(`${address}/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body: '{}' })
        assert.equal(r.status, 400)
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    const expired = createBridge({ agent, token, expiresAt: Date.now() - 1 }).server
    expired.listen(0, '127.0.0.1'); await once(expired, 'listening')
    try {
        const r = await fetch(`http://127.0.0.1:${expired.address().port}/status`, { headers: { Authorization: `Bearer ${token}` } })
        assert.equal(r.status, 401); assert.equal(calls, 1)
    } finally { expired.closeAllConnections(); await new Promise(resolve => expired.close(resolve)) }
})

test('quota failures clear busy state without exposing raw provider errors or changing authentication', async () => {
    const { PersonalAgent } = await load()
    const rpc = fakeRpc()
    const agent = new PersonalAgent({ rpcFactory: () => rpc, workspaceFactory: () => ({ cwd: '/isolated/adsnap', branch: 'codex/personal/test' }) })
    const session = await agent.start('read')
    await agent.message(session.id, 'Explique o projeto')
    rpc.onEvent({ method: 'turn/completed', params: { threadId: agent.session(session.id).threadId, turn: { status: 'failed', error: { codexErrorInfo: 'usageLimitExceeded', message: 'PRIVATE_PROVIDER_DIAGNOSTIC' } } } })
    assert.equal(agent.session(session.id).busy, false)
    assert.match(agent.session(session.id).events.at(-1).text, /limite de uso/)
    assert(!JSON.stringify(agent.session(session.id).events).includes('PRIVATE_PROVIDER_DIAGNOSTIC'))
    assert.equal(rpc.calls.filter(c => c.method === 'turn/start').length, 1)
})

test('rejected starts release the session while uncertain transport failures block duplicate execution', async () => {
    const { PersonalAgent } = await load()
    for (const rejected of [true, false]) {
        const rpc = fakeRpc()
        const original = rpc.request
        rpc.request = async (method, params) => {
            if (method === 'turn/start') throw Object.assign(new Error('transport'), { rpcRejected: rejected })
            return original(method, params)
        }
        const agent = new PersonalAgent({ rpcFactory: () => rpc, workspaceFactory: () => ({ cwd: '/isolated/adsnap', branch: 'codex/personal/test' }) })
        const session = await agent.start('read')
        await assert.rejects(() => agent.message(session.id, 'Teste'), rejected ? /recusou/ : /confirmar/)
        assert.equal(agent.session(session.id).busy, !rejected)
        if (!rejected) {
            await assert.rejects(() => agent.message(session.id, 'Não duplicar'), /Aguarde/)
            await assert.rejects(() => agent.interrupt(session.id), /encerre o conector/)
        }
    }
})

test('RPC handles interleaved notifications and errors and rejects requests after process exit', async () => {
    const { CodexRpc } = await load()
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => child.emit('exit')
    const rpc = new CodexRpc(child)
    const events = []
    rpc.onEvent = e => events.push(e)
    const first = rpc.request('account/read')
    child.stdout.write('{"method":"thread/started","params":{}}\n')
    child.stdout.write('{"id":1,"result":{"account":null}}\n')
    assert.deepEqual(await first, { account: null }); assert.equal(events.length, 1)
    const second = rpc.request('thread/start')
    child.stdout.write('{"id":2,"error":{"message":"rejected"}}\n')
    await assert.rejects(second, /rejected/)
    rpc.close()
    await assert.rejects(rpc.request('account/read'), /encerrado/)
})
