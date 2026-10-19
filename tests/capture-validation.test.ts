import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { inspectCreativeContent } from '../src/lib/captureValidation'
import http from 'node:http'

let browser: Browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
const whiteImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250"><rect width="300" height="250" fill="white"/></svg>')
async function inspect(html: string, setup?: (page: import('playwright').Page) => Promise<void>) {
    const page = await browser.newPage()
    try {
        await page.setContent(`<style>#slot{width:300px;height:250px}body{margin:0}</style>${html}`)
        await setup?.(page)
        return await inspectCreativeContent(page.locator('#slot'))
    } finally { await page.close() }
}

test('a smaller rendered ad frame with visible content is accepted inside a larger slot', async () => {
    const content = `<body style="margin:0"><img width="217" height="180" src="${whiteImage}"></body>`
    const src = 'data:text/html,' + encodeURIComponent(content)
    const evidence = await inspect(`<div id="slot"><iframe style="width:217px;height:180px;border:0" src="${src}"></iframe></div>`)
    assert.equal(evidence.state, 'CONFIRMED')
})

test('a visible frame positioned outside the selected slot cannot confirm its content', async () => {
    const content = `<body style="margin:0"><img width="217" height="180" src="${whiteImage}"></body>`
    const src = 'data:text/html,' + encodeURIComponent(content)
    const evidence = await inspect(`<div id="slot"><iframe style="position:absolute;left:500px;width:217px;height:180px;border:0" src="${src}"></iframe></div>`)
    assert.notEqual(evidence.state, 'CONFIRMED')
})
test('sized empty container is not a creative', async () => { assert.equal((await inspect('<div id="slot"></div>')).state, 'EMPTY') })
test('decoded white image is valid without text or pixel entropy', async () => {
    assert.equal((await inspect(`<div id="slot"><img src="${whiteImage}" width="300" height="250"></div>`)).state, 'CONFIRMED')
})
test('failed image remains inconclusive and never SUCCESS', async () => {
    assert.equal((await inspect('<div id="slot"><img src="data:image/png;base64,broken" width="300" height="250"></div>')).state, 'INCONCLUSIVE')
})
test('tiny tracking image does not validate an otherwise empty advertising container', async () => {
    assert.notEqual((await inspect(`<div id="slot"><img src="${whiteImage}" width="2" height="2"></div>`)).state, 'CONFIRMED')
})
test('hidden image does not validate the container', async () => {
    assert.notEqual((await inspect(`<div id="slot"><img style="display:none" src="${whiteImage}"></div>`)).state, 'CONFIRMED')
})
test('transparent canvas requires review while a legitimately white painted canvas is valid', async () => {
    const html = '<div id="slot"><canvas width="300" height="250"></canvas></div>'
    assert.notEqual((await inspect(html)).state, 'CONFIRMED')
    const painted = await inspect(html, page => page.locator('canvas').evaluate(canvas => {
        const context = (canvas as HTMLCanvasElement).getContext('2d')!
        context.fillStyle = 'white'; context.fillRect(0, 0, 300, 250)
    }))
    assert.equal(painted.state, 'CONFIRMED')
})
test('visible text-only creative is accepted; generic ad label is not', async () => {
    assert.equal((await inspect('<div id="slot"><p>Oferta especial nesta semana</p></div>')).state, 'CONFIRMED')
    assert.notEqual((await inspect('<div id="slot"><span>Publicidade</span></div>')).state, 'CONFIRMED')
})
test('iframe is inspected rather than assuming src or dimensions prove creative content', async () => {
    const empty = '<iframe id="slot" style="border:0" srcdoc="<html><body></body></html>"></iframe>'
    assert.notEqual((await inspect(empty)).state, 'CONFIRMED')
    const content = `<body style="margin:0"><img width="300" height="250" src="${whiteImage}"></body>`
    const src = 'data:text/html,' + encodeURIComponent(content)
    assert.equal((await inspect(`<iframe id="slot" style="border:0" src="${src}"></iframe>`)).state, 'CONFIRMED')
})
test('nested ad iframe chain is inspected and a transparent iframe is rejected', async () => {
    const creative = 'data:text/html,' + encodeURIComponent(`<body style="margin:0"><img width="300" height="250" src="${whiteImage}"></body>`)
    const wrapper = 'data:text/html,' + encodeURIComponent(`<body style="margin:0"><iframe style="border:0;width:300px;height:250px" src="${creative}"></iframe></body>`)
    assert.equal((await inspect(`<iframe id="slot" style="border:0" src="${wrapper}"></iframe>`)).state, 'CONFIRMED')
    assert.notEqual((await inspect(`<iframe id="slot" style="border:0;opacity:0" src="${creative}"></iframe>`)).state, 'CONFIRMED')
})
test('cross-origin CDN image without CORS uses rendered opacity, preserves styles, and issues no extra asset requests', async () => {
    let imageRequests = 0
    const images = http.createServer((request, response) => {
        imageRequests++
        response.setHeader('Content-Type', 'image/svg+xml')
        response.end(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="250">${request.url === '/white' ? '<rect width="300" height="250" fill="white"/>' : ''}</svg>`)
    })
    await new Promise<void>(resolve => images.listen(0, '127.0.0.1', resolve))
    const imagesPort = (images.address() as import('node:net').AddressInfo).port
    const pages = http.createServer((request, response) => {
        response.setHeader('Content-Type', 'text/html')
        response.end(`<html style="background:#eee"><body style="margin:0"><div id="slot" style="width:300px;height:250px;overflow:hidden"><img width="300" height="250" style="background:green" src="http://127.0.0.1:${imagesPort}${request.url}"></div></body></html>`)
    })
    await new Promise<void>(resolve => pages.listen(0, '127.0.0.1', resolve))
    const pagesPort = (pages.address() as import('node:net').AddressInfo).port
    try {
        for (const name of ['/white', '/transparent']) {
            const page = await browser.newPage()
            try {
                await page.goto(`http://127.0.0.1:${pagesPort}${name}`, { waitUntil: 'load' })
                const beforeRequests = imageRequests
                const before = await page.locator('html').evaluate(element => element.outerHTML)
                const evidence = await inspectCreativeContent(page.locator('#slot'))
                assert.equal(evidence.state === 'CONFIRMED', name === '/white', `${name}: ${JSON.stringify(evidence)}`)
                assert.equal(await page.locator('html').evaluate(element => element.outerHTML), before)
                assert.equal(imageRequests, beforeRequests, 'the verification must reuse rendered pixels, not fetch the CDN asset again')
            } finally { await page.close() }
        }
    } finally { await Promise.all([new Promise<void>(resolve => pages.close(() => resolve())), new Promise<void>(resolve => images.close(() => resolve()))]) }
})
