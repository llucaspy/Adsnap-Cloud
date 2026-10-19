import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import net from 'node:net'
import type { Browser } from 'playwright'
import { CaptureEgressProxy, fetchPublicCaptureBuffer, isPublicCaptureAddress, resolveCaptureDestination } from '../src/lib/captureNetwork'
import { captureBrowserEnvironment, launchCaptureBrowser } from '../src/lib/captureBrowser'

test('capture policy rejects private, reserved, mapped and non-public IPv6 addresses', async () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254',
        '100.100.100.200', '0.0.0.0', '192.0.2.1', '224.0.0.1', '::', '::1', 'fc00::1', 'fe80::1',
        '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::7f00:1', '2002:7f00:1::', '2001:db8::1']) {
        assert.equal(isPublicCaptureAddress(address), false, address)
    }
    for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicCaptureAddress(address), true, address)
    for (const url of ['file:///etc/passwd', 'ftp://example.com', 'http://user:pass@example.com',
        'http://localhost', 'http://metadata.google.internal', 'http://127.1', 'http://2130706433',
        'http://[::ffff:127.0.0.1]', 'http://example.com:8080', 'http://127.0.0.1']) {
        await assert.rejects(resolveCaptureDestination(url), /CAPTURE_NETWORK_POLICY/, url)
    }
    await assert.rejects(fetchPublicCaptureBuffer('http://169.254.169.254/latest/meta-data'), /CAPTURE_NETWORK_POLICY/)
})

test('browser subprocess inherits OS configuration but no application secrets', () => {
    const previous = process.env.DATABASE_URL
    try {
        process.env.DATABASE_URL = 'synthetic-must-not-reach-chromium'
        const environment = captureBrowserEnvironment()
        assert.equal(environment.DATABASE_URL, undefined)
        assert.equal(environment.AUTH_SECRET, undefined)
        assert.ok(Object.keys(environment).some(key => key.toUpperCase() === 'PATH'))
    } finally {
        if (previous === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = previous
    }
})

test('egress proxy refuses private HTTP and CONNECT without contacting a loopback service', async () => {
    let contacts = 0
    const privateServer = http.createServer((_request, response) => { contacts++; response.end('private') })
    await new Promise<void>(resolve => privateServer.listen(0, '127.0.0.1', resolve))
    const proxy = new CaptureEgressProxy()
    const proxyUrl = new URL(await proxy.start())
    try {
        const port = (privateServer.address() as net.AddressInfo).port
        const status = await new Promise<number | undefined>((resolve, reject) => {
            const request = http.request({ hostname: '127.0.0.1', port: proxyUrl.port, path: `http://127.0.0.1:${port}/` }, response => {
                response.resume(); response.on('end', () => resolve(response.statusCode))
            })
            request.on('error', reject); request.end()
        })
        assert.equal(status, 403)
        const connect = await new Promise<string>((resolve, reject) => {
            const socket = net.connect(Number(proxyUrl.port), '127.0.0.1', () => socket.write('CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n'))
            socket.on('data', data => { resolve(data.toString()); socket.destroy() })
            socket.on('error', reject)
        })
        assert.match(connect, /403 Forbidden/)
        assert.equal(contacts, 0)
    } finally {
        await proxy.close()
        await new Promise<void>(resolve => privateServer.close(() => resolve()))
    }
})

test('sandboxed production browser renders fixtures and blocks direct, redirected and iframe private requests', async () => {
    let contacts = 0
    const privateServer = http.createServer((_request, response) => { contacts++; response.end('private') })
    await new Promise<void>(resolve => privateServer.listen(0, '127.0.0.1', resolve))
    let browser: Browser | undefined
    try {
        browser = await launchCaptureBrowser()
        const port = (privateServer.address() as net.AddressInfo).port
        const page = await browser.newPage()
        await page.route('https://fixture.example/redirect', route => route.fulfill({ status: 302, headers: { location: `http://127.0.0.1:${port}/redirect` } }))
        await page.route('https://fixture.example/page', route => route.fulfill({ contentType: 'text/html', body:
            `<h1>Public fixture</h1><iframe src="http://127.0.0.1:${port}/iframe"></iframe><img src="http://127.0.0.1:${port}/image">` }))
        await page.goto('https://fixture.example/page')
        assert.equal(await page.locator('h1').textContent(), 'Public fixture')
        assert.ok((await page.screenshot()).length > 100)
        await page.goto('https://fixture.example/redirect').catch(() => {})
        await page.goto(`http://127.0.0.1:${port}/direct`).catch(() => {})
        assert.equal(contacts, 0)
    } finally {
        await browser?.close()
        await new Promise<void>(resolve => privateServer.close(() => resolve()))
    }
})
