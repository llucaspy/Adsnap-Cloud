import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import type { Socket } from 'node:net'

const denied = new net.BlockList()
for (const [address, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24],
    ['192.0.2.0', 24], ['192.88.99.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24],
    ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) denied.addSubnet(address, prefix, 'ipv4')
for (const [address, prefix] of [
    ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) denied.addSubnet(address, prefix, 'ipv6')
const globalV6 = new net.BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')

export function isPublicCaptureAddress(address: string): boolean {
    const family = net.isIP(address)
    if (family === 4) return !denied.check(address, 'ipv4')
    // Mapped IPv4, NAT64, link-local and unspecified addresses are outside 2000::/3.
    return family === 6 && globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6')
}

export async function resolveCaptureDestination(raw: string) {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
        || (url.port && !['80', '443'].includes(url.port))) throw new Error('CAPTURE_NETWORK_POLICY: invalid protocol, port or credentials')
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    if (!hostname.includes('.') && !net.isIP(hostname)) throw new Error('CAPTURE_NETWORK_POLICY: local hostname')
    if (/(^|\.)(localhost|local|internal)\.?$/.test(hostname)) throw new Error('CAPTURE_NETWORK_POLICY: local hostname')
    const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true })
    if (!addresses.length || addresses.some(item => !isPublicCaptureAddress(item.address))) {
        throw new Error('CAPTURE_NETWORK_POLICY: private or reserved destination')
    }
    return { url, address: addresses[0].address }
}

/** Bound downloads and validate every redirect. Connect to the vetted IP, retaining TLS hostname validation. */
export async function fetchPublicCaptureBuffer(raw: string, signal?: AbortSignal, redirects = 0): Promise<Buffer> {
    if (redirects > 5) throw new Error('CAPTURE_NETWORK_POLICY: too many redirects')
    signal?.throwIfAborted()
    const { url, address } = await resolveCaptureDestination(raw)
    return new Promise<Buffer>((resolve, reject) => {
        const request = (url.protocol === 'https:' ? https : http).request(url, {
            family: net.isIP(address),
            // lookup pins the verified address; TLS still checks url.hostname.
            lookup: (_host, _options, done) => done(null, address, net.isIP(address)),
            signal, timeout: 30_000,
        }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
                response.resume()
                fetchPublicCaptureBuffer(new URL(response.headers.location, url).href, signal, redirects + 1).then(resolve, reject)
                return
            }
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                response.resume(); reject(new Error(`Capture download HTTP ${response.statusCode}`)); return
            }
            const chunks: Buffer[] = []
            let size = 0
            response.on('data', (chunk: Buffer) => {
                size += chunk.length
                if (size > 25 * 1024 * 1024) response.destroy(new Error('Capture asset exceeds 25 MiB'))
                else chunks.push(chunk)
            })
            response.on('error', reject)
            response.on('end', () => resolve(Buffer.concat(chunks)))
        })
        request.on('timeout', () => request.destroy(new Error('Capture download timed out')))
        request.on('error', reject)
        request.end()
    })
}

/** Browser DNS is never trusted: each HTTP connection / TLS tunnel is pinned here. */
export class CaptureEgressProxy {
    private server?: http.Server
    private sockets = new Set<Socket>()

    async start(): Promise<string> {
        const server = this.server = http.createServer(async (request, response) => {
            try {
                const { url, address } = await resolveCaptureDestination(request.url || '')
                if (url.protocol !== 'http:') throw new Error('HTTPS requires CONNECT')
                const headers: http.OutgoingHttpHeaders = { ...request.headers, host: url.host }
                delete headers['proxy-authorization']
                delete headers['proxy-connection']
                const upstream = http.request({ hostname: address, port: Number(url.port || 80),
                    method: request.method, path: url.pathname + url.search, headers, timeout: 30_000,
                }, incoming => {
                    response.writeHead(incoming.statusCode || 502, incoming.headers)
                    incoming.pipe(response)
                })
                this.track(upstream)
                upstream.on('timeout', () => upstream.destroy(new Error('Proxy timeout')))
                upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end() })
                request.pipe(upstream)
                response.on('close', () => upstream.destroy())
            } catch {
                response.writeHead(403); response.end('CAPTURE_NETWORK_POLICY')
            }
        })
        server.on('connect', async (request, client, head) => {
            client.on('error', () => client.destroy())
            try {
                const authority = request.url || ''
                if (!/^(?:\[[\da-fA-F:]+\]|[\w.-]+):443$/.test(authority)) throw new Error('Invalid CONNECT authority')
                const { address } = await resolveCaptureDestination(`https://${authority}/`)
                if (client.destroyed) return
                const upstream = net.connect({ host: address, port: 443 })
                this.sockets.add(upstream)
                upstream.on('close', () => this.sockets.delete(upstream))
                upstream.setTimeout(60_000, () => upstream.destroy())
                upstream.on('connect', () => {
                    if (client.destroyed) { upstream.destroy(); return }
                    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
                    if (head.length) upstream.write(head)
                    client.pipe(upstream); upstream.pipe(client)
                })
                upstream.on('error', () => client.destroy())
                upstream.on('close', () => client.destroy())
                client.on('close', () => upstream.destroy())
            } catch {
                client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
            }
        })
        server.on('connection', socket => {
            this.sockets.add(socket)
            socket.setTimeout(60_000, () => socket.destroy())
            socket.on('close', () => this.sockets.delete(socket))
        })
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', resolve)
        })
        return `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`
    }

    private track(request: http.ClientRequest) {
        request.on('socket', socket => {
            this.sockets.add(socket)
            socket.on('close', () => this.sockets.delete(socket))
        })
    }

    async close() {
        for (const socket of this.sockets) socket.destroy()
        if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()))
    }
}
