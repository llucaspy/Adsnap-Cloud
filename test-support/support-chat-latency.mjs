// Browser-only latency fixtures. Support API/model stand-ins; no production calls.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'
const base = new URL(process.env.ADSNAP_UI_TEST_URL || 'http://127.0.0.1:4328')
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw Error('Loopback UI fixture required')
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const checks = [], errors = [], submissions = []
const conversation = { id: 'latency-fixture', title: 'Teste de responsividade', turns: [] }
const executor = { online: true, state: 'ONLINE' }
let initial = true, postCount = 0, message
let releaseStartup
const startupReady = new Promise(resolve => { releaseStartup = resolve })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
try {
    const response = await context.request.post(new URL('/api/auth', base).href, { data: { email: 'review@local.invalid', password: 'local-review-only' } })
    assert.equal(response.status(), 200)
    const cookie = response.headersArray().find(h => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('adsnap_session='))?.value.split(';')[0]
    assert(cookie)
    await context.addCookies([{ name: 'adsnap_session', value: cookie.slice('adsnap_session='.length), domain: base.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    const page = await context.newPage()
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/api/support{,/**}', async route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/api/support') {
            if (initial) await startupReady
            return route.fulfill({ json: { conversations: [{ id: conversation.id, title: conversation.title }], executor, viewer: { isOwner: false } } })
        }
        if (route.request().method() === 'POST') {
            const body = route.request().postDataJSON(); submissions.push(body)
            postCount++
            if (postCount === 3) return route.fulfill({ status: 429, json: { error: 'Limite sintético do atendimento.' } })
            if (!message) message = { id: 'latency-turn', requestId: body.requestId, userText: body.message, assistantText: '', status: 'RUNNING', actions: [] }
            assert.equal(body.requestId, message.requestId, 'Retry must reuse the idempotency key')
            if (postCount === 1) { await sleep(1800); return route.abort('failed') }
            conversation.turns = [message]
            return route.fulfill({ status: 202, json: { id: message.id, status: message.status } })
        }
        return route.fulfill({ json: { conversation, executor } })
    })
    await page.goto(new URL('/nexus', base).href)
    await page.getByRole('button', { name: 'Abrir chat Nexus', exact: true }).click()
    const input = page.getByLabel('Mensagem para o suporte Adsnap')
    await input.waitFor()
    assert(await input.isEnabled())
    await input.fill('Posso escrever durante a inicialização')
    await page.getByText('Iniciando agente… Você já pode escrever.', { exact: true }).waitFor()
    assert.equal(await input.inputValue(), 'Posso escrever durante a inicialização')
    checks.push('Composer accepts typing during deliberately slow startup')
    initial = false
    releaseStartup()
    await page.getByLabel('Conversa de atendimento').waitFor()
    await page.waitForFunction(() => !document.querySelector('#support-conversation').disabled)
    await input.fill('Mensagem enviada com rede lenta')
    const button = page.getByRole('button', { name: 'Enviar ao Nexus', exact: true })
    await button.waitFor()
    await page.waitForFunction(() => !document.querySelector('#support-message').closest('form').querySelector('button[type=submit]').disabled)
    await button.click()
    await page.getByTestId('outgoing-message').waitFor({ timeout: 700 })
    assert.equal(postCount <= 1, true)
    assert(await page.getByText('Enviando mensagem…', { exact: true }).isVisible())
    assert.equal(await input.inputValue(), '')
    await input.fill('Rascunho da próxima pergunta')
    checks.push('Outgoing bubble appears before delayed acknowledgement; next draft is editable')
    await page.getByRole('button', { name: 'Tentar enviar novamente', exact: true }).waitFor()
    assert.equal(await input.inputValue(), 'Rascunho da próxima pergunta')
    await page.getByRole('button', { name: 'Tentar enviar novamente', exact: true }).click()
    await page.getByText('Nexus está analisando sua solicitação…', { exact: true }).waitFor()
    assert.equal(submissions.length, 2)
    assert.equal(new Set(submissions.map(s => s.requestId)).size, 1)
    assert.equal(await page.getByText('Mensagem enviada com rede lenta', { exact: true }).count(), 1)
    assert.equal(await input.inputValue(), 'Rascunho da próxima pergunta')
    assert(await input.isEnabled())
    checks.push('Lost acknowledgement retries the same message without duplicate bubbles or draft loss')
    message.status = 'SUCCESS'; message.assistantText = 'Resposta sintética de teste.'
    await page.getByRole('button', { name: 'Atualizar', exact: true }).click()
    await page.getByText('Resposta sintética de teste.', { exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('#support-message').closest('form').querySelector('button[type=submit]').disabled)
    assert.equal(await input.inputValue(), 'Rascunho da próxima pergunta')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    checks.push('Response completion preserves the next draft and mobile layout')
    await page.getByRole('button', { name: 'Enviar ao Nexus', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Limite sintético do atendimento.' }).waitFor()
    assert.equal(await input.inputValue(), 'Rascunho da próxima pergunta')
    assert(await input.isEnabled())
    assert(await page.getByRole('button', { name: 'Enviar ao Nexus', exact: true }).isEnabled())
    checks.push('Explicit API rejection preserves the message and leaves the composer usable')
    assert.deepEqual(errors, [])
    await fs.mkdir('.test-infra/support-ui', { recursive: true })
    await page.screenshot({ path: '.test-infra/support-ui/responsiveness-mobile.png', fullPage: true, animations: 'disabled' })
    console.log(JSON.stringify({ scope: 'Real browser with delayed API stand-ins', passed: checks.length, checks }))
} finally { await context.close(); await browser.close() }
