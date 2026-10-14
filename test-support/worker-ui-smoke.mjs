import fs from 'node:fs/promises'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = new URL(process.env.ADSNAP_UI_TEST_URL || 'http://127.0.0.1:4328')
if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('Synthetic UI smoke tests are loopback-only')
const browser = await chromium.launch({ headless: true })
const directory = 'docs/evidence/worker-release-local'
await fs.mkdir(directory, { recursive: true })
const checks = []
try {
    const anonymous = await browser.newContext()
    const refused = await anonymous.request.get(new URL('/api/nexus/logs', base).href)
    assert.equal(refused.status(), 401)
    assert.match(refused.headers()['cache-control'], /no-store/)
    checks.push('Anonymous logs access refused before data is returned')
    await anonymous.close()
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, reducedMotion: 'reduce' })
    const login = await context.request.post(new URL('/api/auth', base).href, { data: { email: 'review@local.invalid', password: 'local-review-only' } })
    assert.equal(login.status(), 200)
    const signedCookie = login.headersArray().find(header => header.name.toLowerCase() === 'set-cookie' && header.value.startsWith('adsnap_session='))?.value.split(';')[0]
    assert.ok(signedCookie)
    // Only this synthetic loopback HTTP harness normalizes the transport flag.
    // Production cookies remain Secure and are tested separately over real HTTPS.
    await context.addCookies([{ name: 'adsnap_session', value: signedCookie.slice('adsnap_session='.length), domain: base.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    const logs = await context.request.get(new URL('/api/nexus/logs', base).href)
    assert.equal(logs.status(), 200)
    assert.equal((await logs.text()).includes('FIXTURE_SECRET_ONLY'), false)
    checks.push('Legitimate login and authorized redacted diagnostics work')
    const page = await context.newPage()
    const exceptions = []
    page.on('pageerror', error => exceptions.push(error.message))
    for (const width of [1365, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        const response = await page.goto(new URL('/workers', base).href)
        assert.equal(response.status(), 200)
        await page.getByRole('heading', { name: 'Painel dos Workers', exact: true }).waitFor()
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal(await page.locator('main a[href="/workers/jobs/ui-review-20261014-job"]').count(), 1)
        assert.equal(await page.locator('main a[href*="/monitoring/live/"]').count(), 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
        if (width === 390) {
            const card = page.locator('main a[href="/workers/jobs/ui-review-20261014-job"]')
            const bounds = await card.evaluate(element => ({ card: element.getBoundingClientRect().width, content: element.firstElementChild.getBoundingClientRect().width }))
            assert.ok(bounds.content >= bounds.card - 40, 'Mobile task content must use the card width, including long run identifiers')
        }
        await page.screenshot({ path: `${directory}/panel-${width}.png`, fullPage: true, animations: 'disabled' })
        await page.locator('a[href="/workers/jobs/ui-review-20261014-job"]').click()
        await page.getByRole('heading', { name: 'Motivo registrado', exact: true }).waitFor()
        await page.getByRole('heading', { name: 'Eventos da captura', exact: true }).waitFor()
        assert.equal(await page.getByRole('heading', { name: '404', exact: true }).count(), 0)
        assert.equal((await page.content()).includes('FIXTURE_SECRET_ONLY'), false)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
        await page.screenshot({ path: `${directory}/job-${width}.png`, fullPage: true, animations: 'disabled' })
        checks.push(`Panel and job detail functional at ${width}px without page overflow or raw fixture secret`)
    }
    assert.deepEqual(exceptions, [])
    await context.close()
    await fs.writeFile(`${directory}/results.json`, JSON.stringify({ date: new Date().toISOString(), scope: 'Synthetic loopback fixtures on a local production build, not cloud certification', checks, exceptions }, null, 2))
    console.log(JSON.stringify({ passed: checks.length, checks, screenshotDirectory: directory }))
} finally { await browser.close() }
