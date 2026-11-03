import { createInterface } from 'node:readline'

// This child has no database, API key or filesystem tools. Its capability only reaches one live turn.
const endpoint = process.env.ADSNAP_SUPPORT_TOOL_URL
const capability = process.env.ADSNAP_SUPPORT_TOOL_TOKEN
if (!endpoint || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(endpoint) || !capability) throw new Error('Invalid support tool capability')

async function call(path, body) {
    const response = await fetch(new URL(path, endpoint), { method: 'POST', headers: { Authorization: `Bearer ${capability}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('Ferramenta indisponível ou solicitação expirada.')
    return response.json()
}

async function handle(msg) {
    if (msg.id === undefined) return
    try {
        let result
        if (msg.method === 'initialize') result = { protocolVersion: msg.params?.protocolVersion || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'adsnap_support', version: '1.0.0' } }
        else if (msg.method === 'ping') result = {}
        else if (msg.method === 'tools/list') result = await call('list', {})
        else if (msg.method === 'tools/call') result = await call('call', { name: msg.params?.name, arguments: msg.params?.arguments || {} })
        else throw new Error('Método não disponível.')
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n')
    } catch {
        process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Não foi possível consultar a ferramenta autorizada.' } }) + '\n')
    }
}
createInterface({ input: process.stdin }).on('line', line => {
    if (line.length > 25000) return
    try { void handle(JSON.parse(line)) } catch { /* malformed transport */ }
})
