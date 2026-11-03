import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createInterface } from 'node:readline'
import { mkdirSync, realpathSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

export const PORT = 47831
export const ORIGINS = ['https://adsnap-cloud.vercel.app', 'http://localhost:3000', 'http://127.0.0.1:3000']
const MAX_MESSAGE = 16000
const MAX_BODY = 20000
const TTL = 8 * 60 * 60 * 1000

export function codexLaunch(extraConfig = []) {
    // Resolve the installed official CLI without invoking a shell or reading credentials.
    const require = createRequire(import.meta.url)
    const bases = [process.env.APPDATA && join(process.env.APPDATA, 'npm/node_modules'),
        '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean)
    if (process.platform === 'win32') {
        try {
            const installed = execFileSync('where.exe', ['codex.cmd'], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/)[0]
            if (installed) bases.push(join(dirname(installed), 'node_modules'))
        } catch { /* CLI may be installed as a regular dependency */ }
    }
    let launcher
    try { launcher = require.resolve('@openai/codex/bin/codex.js') } catch {
        for (const base of bases) {
            try { launcher = require.resolve(join(base, '@openai/codex/bin/codex.js')); break } catch { /* next installation */ }
        }
    }
    if (!launcher) throw new Error('Instale o Codex CLI oficial e execute codex login antes de conectar.')
    const env = {}
    for (const name of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'CODEX_HOME']) {
        if (process.env[name]) env[name] = process.env[name]
    }
    return spawn(process.execPath, [launcher, 'app-server', '--stdio',
        '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"',
        '-c', 'shell_environment_policy.inherit="none"', ...extraConfig.flatMap(value => ['-c', value])], {
        stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true,
    })
}

export class CodexRpc {
    constructor(child = codexLaunch()) {
        this.child = child
        this.pending = new Map()
        this.sequence = 0
        this.onEvent = () => {}
        createInterface({ input: child.stdout }).on('line', line => {
            let msg
            try { msg = JSON.parse(line) } catch { return }
            if (msg.method) this.onEvent(msg)
            else if (this.pending.has(msg.id)) {
                const pending = this.pending.get(msg.id)
                this.pending.delete(msg.id)
                clearTimeout(pending.timer)
                if (msg.error) pending.reject(Object.assign(new Error(msg.error.message || 'Falha no Codex'), { rpcRejected: true }))
                else pending.resolve(msg.result)
            }
        })
        // Stderr can contain local paths/account diagnostics: never forward it to HTTP or logs.
        child.stderr.on('data', () => {})
        const failed = () => {
            if (this.closed) return
            this.closed = true
            for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('Conector Codex encerrado. Reinicie-o.')) }
            this.pending.clear()
            this.onEvent({ method: 'bridge/closed' })
        }
        child.once('exit', failed)
        child.once('error', failed)
        child.stdin.on('error', failed)
    }
    send(msg) {
        if (this.closed) throw new Error('Conector Codex encerrado. Reinicie-o.')
        this.child.stdin.write(`${JSON.stringify(msg)}\n`)
    }
    request(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.sequence
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex não respondeu no prazo.')) }, 30000)
            this.pending.set(id, { resolve, reject, timer })
            try { this.send({ id, method, params }) } catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error) }
        })
    }
    async initialize() {
        await this.request('initialize', { clientInfo: { name: 'adsnap_personal', title: 'Adsnap pessoal', version: '0.1.0' }, capabilities: null })
        this.send({ method: 'initialized', params: {} })
    }
    close() { this.child.kill() }
}

export function createWorkspace(repo) {
    const root = realpathSync(repo)
    const reported = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
    if (realpathSync(reported) !== root) throw new Error('Execute o conector na raiz do repositório Adsnap.')
    const branch = `codex/personal/${randomUUID()}`
    const parent = resolve(root, '.test-infra/codex-personal')
    mkdirSync(parent, { recursive: true })
    const cwd = join(parent, branch.split('/').at(-1))
    execFileSync('git', ['worktree', 'add', '-b', branch, cwd, 'HEAD'], { cwd: root, stdio: 'pipe', windowsHide: true })
    return { cwd, branch }
}

export class PersonalAgent {
    constructor({ repo, rpcFactory = () => new CodexRpc(), workspaceFactory = createWorkspace } = {}) {
        this.repo = repo
        this.rpcFactory = rpcFactory
        this.workspaceFactory = workspaceFactory
        this.sessions = new Map()
    }
    async ready() {
        if (!this.readyPromise) this.readyPromise = (async () => {
            this.rpc = this.rpcFactory()
            this.rpc.onEvent = msg => this.event(msg)
            await this.rpc.initialize()
        })()
        await this.readyPromise
        const { account } = await this.rpc.request('account/read', { refreshToken: false })
        if (account?.type !== 'chatgpt') throw new Error('Use codex login com sua conta ChatGPT. Este conector não aceita chave de API.')
        if (!this.model) {
            const { data } = await this.rpc.request('model/list', { limit: 100 })
            const model = data?.find(model => model.isDefault)?.model
            if (!model) throw new Error('O Codex não informou um modelo disponível para esta conta ChatGPT.')
            const { config } = await this.rpc.request('config/read', { includeLayers: false })
            // Personal coding sessions must not inherit the operator's Supabase, email or browser connections.
            this.localConfig = {
                mcp_servers: Object.fromEntries(Object.keys(config?.mcp_servers || {}).map(name => [name, { enabled: false }])),
                plugins: Object.fromEntries(Object.keys(config?.plugins || {}).map(name => [name, { enabled: false }])),
                apps: { _default: { enabled: false } },
                features: { memories: false, remote_control: false, remote_plugin: false, tool_suggest: false, multi_agent: false },
                web_search: 'disabled',
            }
            this.model = model
        }
        return { authenticated: true, plan: account.planType, personal: true }
    }
    append(session, event) {
        session.events.push({ ...event, sequence: ++session.sequence })
        if (session.events.length > 2000) session.events.shift()
    }
    event(msg) {
        const params = msg.params || {}
        const session = [...this.sessions.values()].find(s => s.threadId === params.threadId)
        if (msg.method === 'bridge/closed') {
            for (const s of this.sessions.values()) { s.busy = false; this.append(s, { type: 'error', text: 'Conector encerrado. Reinicie e reconecte.' }) }
            return
        }
        if (msg.id !== undefined) {
            // Fail closed for new protocol requests; don't leave the agent hanging.
            const supported = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(msg.method)
            if (session && supported && session.mode === 'edit') {
                const approvalId = randomUUID()
                session.approvals.set(approvalId, msg.id)
                this.append(session, { type: 'approval', approvalId, text: params.command || params.reason || 'O Codex solicita autorização para alterar arquivos.', kind: msg.method })
            } else if (supported) this.rpc.send({ id: msg.id, result: { decision: 'decline' } })
            else this.rpc.send({ id: msg.id, error: { code: -32601, message: 'Esta operação não está habilitada no conector pessoal.' } })
            return
        }
        if (!session) return
        if (msg.method === 'item/completed' && params.item?.type === 'agentMessage') {
            this.append(session, { type: 'message', text: String(params.item.text).slice(0, 100000) })
        } else if (msg.method === 'item/started' && ['commandExecution', 'fileChange'].includes(params.item?.type)) {
            this.append(session, { type: 'progress', text: params.item.type === 'fileChange' ? 'Preparando alterações na cópia local…' : 'Executando uma etapa na cópia local…' })
        } else if (msg.method === 'turn/started') {
            session.turnId = params.turn.id
        } else if (msg.method === 'turn/completed') {
            session.busy = false
            session.turnId = null
            for (const requestId of session.approvals.values()) this.rpc.send({ id: requestId, result: { decision: 'cancel' } })
            session.approvals.clear()
            const code = params.turn.error?.codexErrorInfo
            const error = ['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded'].includes(code)
                ? 'O limite de uso da sua conta foi atingido. Aguarde a renovação indicada no Codex; o conector não troca para cobrança por API.'
                : code === 'unauthorized' ? 'A autenticação ChatGPT expirou. Execute codex login no computador e reconecte.'
                    : 'O Codex não concluiu esta tarefa. Consulte o estado da sua conta ou tente novamente.'
            this.append(session, { type: 'done', status: params.turn.status, text: params.turn.status === 'failed' ? error : '' })
        }
    }
    async start(mode) {
        await this.ready()
        if (!['read', 'edit'].includes(mode)) throw new Error('Modo inválido.')
        if (this.sessions.size >= 8) throw new Error('Limite de conversas atingido. Reinicie o conector.')
        this.workspace ||= this.workspaceFactory(this.repo)
        const { thread } = await this.rpc.request('thread/start', {
            cwd: this.workspace.cwd, model: this.model, modelProvider: 'openai', approvalPolicy: 'on-request',
            config: this.localConfig,
            sandbox: mode === 'edit' ? 'workspace-write' : 'read-only',
            developerInstructions: 'Você é o Codex pessoal do Adsnap. Responda em português. Trabalhe apenas na cópia local deste repositório. Não leia credenciais, arquivos .env, pastas .test-infra de outras cópias nem históricos pessoais. Não acesse produção, não publique, não execute git push e não use conexões externas. Não alegue consultar campanhas ou logs em tempo real: esta versão tem apenas o código local. Diga o que foi testado e o que não foi. Use somente ferramentas locais, sem subagentes. Para esclarecer algo, escreva a pergunta na resposta do chat. As alterações são locais e precisam de revisão antes de publicar.',
        })
        const id = randomUUID()
        this.sessions.set(id, { threadId: thread.id, mode, busy: false, turnId: null, events: [], approvals: new Map(), sequence: 0 })
        return { id, mode, branch: this.workspace.branch }
    }
    session(id) {
        const session = this.sessions.get(id)
        if (!session) throw new Error('Conversa não encontrada. Reconecte o computador.')
        return session
    }
    async message(id, text) {
        if (typeof text !== 'string' || !text.trim() || text.length > MAX_MESSAGE) throw new Error('Envie uma mensagem de até 16.000 caracteres.')
        const session = this.session(id)
        if ([...this.sessions.values()].some(s => s.busy)) throw new Error('Aguarde a tarefa atual ou interrompa antes de enviar outra.')
        session.busy = true
        try { await this.ready() } catch (error) { session.busy = false; throw error }
        try {
            this.append(session, { type: 'user', text })
            const { turn } = await this.rpc.request('turn/start', {
                threadId: session.threadId, input: [{ type: 'text', text, text_elements: [] }],
                approvalPolicy: 'on-request', sandboxPolicy: session.mode === 'edit'
                    ? { type: 'workspaceWrite', writableRoots: [this.workspace.cwd], networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true }
                    : { type: 'readOnly', networkAccess: false },
            })
            if (session.busy) session.turnId = turn.id
        } catch (error) {
            if (error.rpcRejected) {
                session.busy = false
                this.append(session, { type: 'done', status: 'failed', text: 'O Codex recusou o início desta tarefa. Confira o estado da sua conta e tente novamente.' })
                throw new Error('O Codex recusou o início desta tarefa. Confira o estado da sua conta e tente novamente.')
            }
            // The app-server may have accepted the turn before transport failure. Don't retry it.
            this.append(session, { type: 'error', text: 'Não foi possível confirmar o início. Confira ou interrompa a tarefa antes de reenviar.' })
            throw new Error('Não foi possível confirmar o início. Reconecte e confira a tarefa antes de reenviar.')
        }
        return { accepted: true }
    }
    async interrupt(id) {
        const session = this.session(id)
        for (const requestId of session.approvals.values()) this.rpc.send({ id: requestId, result: { decision: 'cancel' } })
        session.approvals.clear()
        if (session.busy && !session.turnId) throw new Error('Ainda não foi possível identificar a tarefa. Para garantir a interrupção, encerre o conector com Ctrl+C.')
        if (session.turnId) await this.rpc.request('turn/interrupt', { threadId: session.threadId, turnId: session.turnId })
        return { interrupted: true }
    }
    approve(id, approvalId, decision) {
        const session = this.session(id)
        if (!['accept', 'decline'].includes(decision) || !session.approvals.has(approvalId)) throw new Error('Autorização inválida ou expirada.')
        this.rpc.send({ id: session.approvals.get(approvalId), result: { decision } })
        session.approvals.delete(approvalId)
        this.append(session, { type: 'approvalResolved', approvalId })
        return { ok: true }
    }
    close() { this.rpc?.close() }
}

function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)) }
async function body(req) {
    if (req.headers['content-type'] !== 'application/json') throw new Error('Content-Type inválido.')
    let value = ''
    for await (const chunk of req) { value += chunk; if (Buffer.byteLength(value) > MAX_BODY) throw new Error('Solicitação muito grande.') }
    return JSON.parse(value || '{}')
}

export function createBridge({ agent, origin = ORIGINS[0], token = randomBytes(32).toString('hex'), expiresAt = Date.now() + TTL }) {
    if (!ORIGINS.includes(origin)) throw new Error('Origem Adsnap não autorizada.')
    const server = createServer(async (req, res) => {
        const host = `127.0.0.1:${req.socket.localPort}`
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Referrer-Policy', 'no-referrer')
        const requestOrigin = req.headers.origin
        if (req.headers.host !== host || !['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return json(res, 403, { error: 'Acesso somente pelo computador local.' })
        if (requestOrigin && requestOrigin !== origin) return json(res, 403, { error: 'Origem não autorizada.' })
        if (Date.now() > expiresAt) return json(res, 401, { error: 'Pareamento expirado. Reinicie o conector.' })
        if (requestOrigin === origin) {
            res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Vary', 'Origin')
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
            res.setHeader('Access-Control-Allow-Private-Network', 'true')
        }
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
        const url = new URL(req.url, `http://${host}`)
        if (req.method === 'GET' && url.pathname === '/') {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            res.setHeader('X-Frame-Options', 'DENY')
            return res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Codex pessoal — Adsnap</title><h1>Conectar Codex ao Adsnap</h1><p>Este conector usa sua conta ChatGPT neste computador. As tarefas consomem os limites do seu plano. A conexão vale por até oito horas e termina ao fechar o conector.</p><p>Ao continuar, este navegador poderá solicitar tarefas ao seu Codex local. Conecte apenas sua própria sessão do Adsnap.</p><p><a href="${origin}/nexus#codex-pair=${token}" rel="noreferrer">Conectar meu chat do Adsnap</a></p><p>O navegador pode solicitar acesso à rede local. As credenciais ChatGPT permanecem neste computador.</p></html>`)
        }
        const expected = Buffer.from(`Bearer ${token}`)
        const provided = Buffer.from(req.headers.authorization || '')
        if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return json(res, 401, { error: 'Conecte seu computador para continuar.' })
        try {
            if (req.method === 'GET' && url.pathname === '/status') return json(res, 200, await agent.ready())
            if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Método não permitido.' })
            if (req.method === 'POST' && url.pathname === '/sessions') {
                const data = await body(req)
                return json(res, 200, await agent.start(data.mode))
            }
            const match = /^\/sessions\/([a-f0-9-]{36})\/(events|messages|interrupt|approvals)$/.exec(url.pathname)
            if (!match) return json(res, 404, { error: 'Operação não encontrada.' })
            const [, id, action] = match
            if (req.method === 'GET' && action === 'events') {
                const session = agent.session(id)
                const after = Number(url.searchParams.get('after') || 0)
                return json(res, 200, { events: session.events.filter(e => e.sequence > after), busy: session.busy })
            }
            if (req.method === 'POST') {
                const data = await body(req)
                if (action === 'messages') return json(res, 200, await agent.message(id, data.text))
                if (action === 'interrupt') return json(res, 200, await agent.interrupt(id))
                if (action === 'approvals') return json(res, 200, agent.approve(id, data.approvalId, data.decision))
            }
            return json(res, 405, { error: 'Método não permitido.' })
        } catch (error) { return json(res, 400, { error: error.message || 'Não foi possível concluir a solicitação.' }) }
    })
    return { server, token }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
    const origin = process.argv.includes('--local') ? ORIGINS[1] : ORIGINS[0]
    const agent = new PersonalAgent({ repo })
    const { server } = createBridge({ agent, origin })
    server.on('error', () => { console.error('Não foi possível abrir o conector. A porta 47831 pode estar ocupada.'); process.exitCode = 1; agent.close() })
    server.listen(PORT, '127.0.0.1', () => console.log(`Codex pessoal: abra http://127.0.0.1:${PORT} para conectar. Destino: ${origin}. Ctrl+C encerra a conexão.`))
    const stop = () => { agent.close(); server.close(); process.exit(0) }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
}
