// Independent browser review: inline fixtures only, all network routes blocked.
import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { chromium, type Browser } from 'playwright'
import http from 'node:http'
import { inspectCreativeContent } from '../src/lib/captureValidation'

let browser: Browser
const whiteImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250"><rect width="300" height="250" fill="white"/></svg>')
const transparentImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250"></svg>')
before(async () => { browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--proxy-server=http://127.0.0.1:9'] }) })
after(async () => { await browser?.close() })
async function inspect(body: string) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => route.abort('blockedbyclient'))
    const page = await context.newPage()
    try {
        await page.setContent(`<style>body{margin:0}#slot{position:relative;width:300px;height:250px;overflow:hidden}</style>${body}`)
        return await inspectCreativeContent(page.locator('#slot'))
    } finally { await context.close() }
}

test('review: visible parent does not make an opacity-zero descendant iframe creative visible', async () => {
    const content = 'data:text/html,' + encodeURIComponent(`<body style="margin:0"><img src="${whiteImage}" width="300" height="250"></body>`)
    const evidence = await inspect(`<div id="slot"><iframe style="border:0;width:300px;height:250px;opacity:0" src="${content}"></iframe></div>`)
    assert.notEqual(evidence.state, 'CONFIRMED', JSON.stringify(evidence))
})

test('review: text positioned outside a clipped empty slot cannot confirm its creative', async () => {
    const evidence = await inspect('<div id="slot"><span style="position:absolute;left:1000px;top:0">Oferta especial de teste</span></div>')
    assert.notEqual(evidence.state, 'CONFIRMED', JSON.stringify(evidence))
})

test('review: image positioned outside a clipped empty slot cannot confirm its creative', async () => {
    const evidence = await inspect(`<div id="slot"><img style="position:absolute;left:1000px;top:0" src="${whiteImage}" width="300" height="250"></div>`)
    assert.notEqual(evidence.state, 'CONFIRMED', JSON.stringify(evidence))
})

test('review: a decoded fully transparent inline image still requires review', async () => {
    const evidence = await inspect(`<div id="slot"><img src="${transparentImage}" width="300" height="250"></div>`)
    assert.notEqual(evidence.state, 'CONFIRMED', JSON.stringify(evidence))
})

test('review: CSP that permits a real CDN image but denies data URLs does not break confirmation', async () => {
    const images = http.createServer((_request, response) => {
        response.setHeader('Content-Type', 'image/svg+xml')
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250"><rect width="300" height="250" fill="white"/></svg>')
    })
    await new Promise<void>(resolve => images.listen(0, '127.0.0.1', resolve))
    const imageOrigin = `http://127.0.0.1:${(images.address() as import('node:net').AddressInfo).port}`
    const pages = http.createServer((_request, response) => {
        response.setHeader('Content-Type', 'text/html')
        response.setHeader('Content-Security-Policy', "default-src 'self'; img-src http:; style-src 'unsafe-inline'")
        response.end(`<html><body style="margin:0"><div id="slot" style="width:300px;height:250px"><img width="300" height="250" src="${imageOrigin}/white.svg"></div></body></html>`)
    })
    await new Promise<void>(resolve => pages.listen(0, '127.0.0.1', resolve))
    const pageOrigin = `http://127.0.0.1:${(pages.address() as import('node:net').AddressInfo).port}`
    const context = await browser.newContext({ serviceWorkers: 'block', proxy: { server: 'http://127.0.0.1:9', bypass: '127.0.0.1' } })
    await context.route('**/*', route => [pageOrigin, imageOrigin].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort('blockedbyclient'))
    try {
        const page = await context.newPage()
        await page.goto(pageOrigin, { waitUntil: 'load' })
        assert.equal(await page.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth), 300)
        assert.equal((await inspectCreativeContent(page.locator('#slot'))).state, 'CONFIRMED')
    } finally {
        await context.close()
        await Promise.all([new Promise<void>(resolve => images.close(() => resolve())), new Promise<void>(resolve => pages.close(() => resolve()))])
    }
})
