import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { sectionSlotCandidate, resolveConfiguredCaptureSlot } from '../src/lib/captureTarget'

let browser: Browser
before(async () => { browser = await chromium.launch({ headless: true }) })
after(async () => { await browser?.close() })
const configured = '//*[@id="div-gpt-ad-saude-horizontal-1"]'
const slot = { id: 'div-gpt-ad-mundo-horizontal-1', path: '/123935210/mundo-horizontal-1' }

test('the same GPT placement follows the actual page section without consulting dimensions', () => {
    assert.equal(sectionSlotCandidate(configured, 'https://metropoles.com/mundo', [slot]), '[id="div-gpt-ad-mundo-horizontal-1"]')
    assert.equal(sectionSlotCandidate(configured, 'https://metropoles.com/mundo', [{ ...slot, path: '/999/another-placement' }]), null)
    assert.equal(sectionSlotCandidate(configured, 'https://metropoles.com/mundo', [slot, slot]), null)
    assert.equal(sectionSlotCandidate(configured, 'https://metropoles.com/mundo', [{ id: 'div-gpt-ad-mundo-quadrado-1', path: '/123935210/mundo-quadrado-1' }]), null)
    assert.equal(sectionSlotCandidate('#custom-explicit-target', 'https://metropoles.com/mundo', [slot]), null)
})

test('a configured existing visible slot is retained even when another section slot exists', async () => {
    const page = await browser.newPage()
    try {
        await page.setContent('<div id="div-gpt-ad-saude-horizontal-1">Configured creative</div><div id="div-gpt-ad-mundo-horizontal-1">Other creative</div>')
        assert.deepEqual(await resolveConfiguredCaptureSlot(page, configured, true), { selector: configured, reason: 'CONFIGURED_SLOT' })
    } finally { await page.close() }
})

test('section resolution waits for asynchronous GPT initialization and rejects a mismatched ad unit', async () => {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    try {
        for (const path of ['mundo-horizontal-1', 'unrelated-unit']) {
            await context.route('https://publisher.invalid/**', route => route.fulfill({ contentType: 'text/html', body: `<body><div id="div-gpt-ad-mundo-horizontal-1">Creative</div><script>setTimeout(() => {window.googletag={pubads:()=>({getSlots:()=>[{getSlotElementId:()=>"div-gpt-ad-mundo-horizontal-1",getAdUnitPath:()=>"/123935210/${path}"}]})}},250)</script></body>` }))
            const page = await context.newPage()
            try {
                await page.goto('https://publisher.invalid/mundo')
                const result = await resolveConfiguredCaptureSlot(page, configured, true)
                assert.equal(result.selector, path === 'mundo-horizontal-1' ? '[id="div-gpt-ad-mundo-horizontal-1"]' : configured)
            } finally { await page.close(); await context.unrouteAll() }
        }
    } finally { await context.close() }
})

test('desktop square uses its registered visible responsive placement instead of the hidden mobile slot', async () => {
    const page = await browser.newPage()
    try {
        await page.setContent('<div id="div-gpt-ad-home-quadrado-0" style="display:none"></div><div id="div-gpt-ad-home-quadrado-1">Creative</div>')
        await page.addScriptTag({ content: "window.googletag = { pubads: () => ({ getSlots: () => [{ getSlotElementId: () => 'div-gpt-ad-home-quadrado-1', getAdUnitPath: () => '/123935210/home-quadrado-1' }] }) }" })
        const selector = '#div-gpt-ad-home-quadrado-0'
        assert.equal((await resolveConfiguredCaptureSlot(page, selector, false)).selector, '#div-gpt-ad-home-quadrado-1')
        assert.equal((await resolveConfiguredCaptureSlot(page, selector, true)).selector, selector)
    } finally { await page.close() }
})
