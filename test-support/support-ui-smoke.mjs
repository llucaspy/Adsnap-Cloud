import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
const supportModule = await import('../src/lib/supportStore.ts')
const { createSupportStore } = supportModule.default || supportModule

const base = new URL(process.env.ADSNAP_UI_TEST_URL || 'http://127.0.0.1:4328')
const dataUrl = new URL(process.env.DATABASE_URL || '')
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !['127.0.0.1', 'localhost'].includes(dataUrl.hostname) || dataUrl.pathname !== '/adsnap_worker_test') throw new Error('Support smoke only runs against isolated loopback fixtures')
const db = new PrismaClient(), store = createSupportStore(db)
const browser = await chromium.launch({ headless: true })
const contexts = [], checks = [], errors = []
const marker = `Suporte de teste ${randomUUID().slice(0, 8)}`
const otherId = 'ui-support-other-user'
let conversationId, fixtureRunId

async function login(email) {
    const context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, reducedMotion: 'reduce' })
    contexts.push(context)
    const response = await context.request.post(new URL('/api/auth', base).href, { data: { email, password: 'local-review-only' } })
    assert.equal(response.status(), 200)
    const cookie = response.headersArray().find(h => h.name.toLowerCase() === 'set-cookie' && h.value.startsWith('adsnap_session='))?.value.split(';')[0]
    assert(cookie)
    // Normalize transport only in this isolated HTTP test harness, using a legitimate server-issued session.
    await context.addCookies([{ name: 'adsnap_session', value: cookie.slice('adsnap_session='.length), domain: base.hostname, path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }])
    return context
}
async function open(context) {
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => assert(!request.url().startsWith('http://127.0.0.1:47831'), 'Shared support must not connect to the viewing device'))
    await page.goto(new URL('/nexus', base).href)
    await page.getByRole('button', { name: 'Abrir chat Nexus', exact: true }).click()
    await page.getByLabel('Mensagem para o suporte Adsnap').waitFor()
    return page
}
try {
    await db.user.upsert({ where: { id: otherId }, update: { isActive: true }, create: { id: otherId, name: 'Outro usuário de teste', email: 'support-other@local.invalid', password: await bcrypt.hash('local-review-only', 10), role: 'user' } })
    await db.campaign.update({ where: { id: 'ui-review-20261014-campaign' }, data: { status: 'FAILED', lastWorkerError: 'CREATIVE_NOT_CONFIRMED: o slot não contém criativo visível.' } })
    const first = await login('review@local.invalid')
    const anonymous = await browser.newContext(); contexts.push(anonymous)
    assert.equal((await anonymous.request.get(new URL('/api/support', base).href)).status(), 401)
    checks.push('Anonymous access refused')
    const badOrigin = await first.request.post(new URL('/api/support', base).href, { headers: { Origin: 'https://attacker.invalid' }, data: { title: 'Blocked' } })
    assert.equal(badOrigin.status(), 403)
    checks.push('Cross-site writes refused before creating a conversation')
    const page = await open(first)
    await page.getByLabel('Conversa de atendimento').selectOption('')
    const message = `${marker}. Consulte a campanha do PI TESTE-LOCAL, explique a falha registrada e proponha somente RETRY_CAPTURE para eu confirmar pelo chat. Não execute captura, não altere configuração, não proponha prévia modificada.`
    await page.getByLabel('Mensagem para o suporte Adsnap').fill(message)
    await page.getByRole('button', { name: 'Enviar ao Nexus', exact: true }).click()
    await page.getByText('Mensagem recebida · aguardando atendimento', { exact: true }).waitFor({ timeout: 20000 })
    const turn = await db.supportTurn.findFirst({ where: { userText: { startsWith: marker } }, include: { conversation: true } })
    assert(turn); conversationId = turn.conversationId
    checks.push('Browser persists a request without localhost pairing or a ChatGPT login')
    if (process.argv.includes('--real-plus')) {
        const log = execFileSync(process.execPath, ['--import', 'tsx', 'src/scripts/support-worker.ts', '--once'], { cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 210000,
            env: { ...process.env, GITHUB_TOKEN: '', OPENAI_API_KEY: '', CODEX_API_KEY: '', AI_GATEWAY_API_KEY: '', ADSNAP_SUPPORT_ENV_FILE: '.test-infra/no-env-for-real-plus-fixture' } })
        await fs.writeFile('.test-infra/support-real-plus-worker.txt', log)
    } else {
        // CI has no account credentials. Exercise the real queue/tools/actions with an explicit worker stand-in.
        fixtureRunId = randomUUID(); assert(await store.heartbeat(fixtureRunId, 'ONLINE', 'fixture'))
        const claimed = await store.claim(fixtureRunId); assert.equal(claimed.id, turn.id)
        await store.propose(turn.id, fixtureRunId, 'RETRY_CAPTURE', ['ui-review-20261014-campaign'], 'Reprocessamento proposto pelo executor sintético de teste.')
        await store.finish(turn.id, fixtureRunId, 'Diagnóstico sintético: o registro informa CREATIVE_NOT_CONFIRMED. Preparei uma proposta de reprocessamento; a captura ainda não foi executada.')
    }
    await page.getByRole('button', { name: 'Reprocessar capturas', exact: true }).waitFor({ timeout: 20000 })
    const answer = await db.supportTurn.findUnique({ where: { id: turn.id } })
    assert.equal(answer.status, 'SUCCESS'); assert(answer.assistantText.length > 20)
    checks.push(process.argv.includes('--real-plus') ? 'Actual Codex Plus answers using scoped Adsnap tools without any API key' : 'Explicit CI worker stand-in completes the real persisted queue')
    const second = await login('review@local.invalid')
    const secondPage = await open(second)
    await secondPage.getByText(message, { exact: true }).waitFor({ timeout: 15000 })
    await secondPage.getByRole('button', { name: 'Reprocessar capturas', exact: true }).waitFor()
    checks.push('An independent authenticated browser session restores the same conversation from the server')
    const other = await login('support-other@local.invalid')
    const privateRead = await other.request.get(new URL(`/api/support/${conversationId}`, base).href)
    assert.equal(privateRead.status(), 404); assert(!(await privateRead.text()).includes(marker))
    const action = await db.supportAction.findFirst({ where: { turnId: turn.id, type: 'RETRY_CAPTURE' } }); assert(action)
    const denied = await other.request.post(new URL(`/api/support/actions/${action.id}`, base).href, { headers: { Origin: base.origin }, data: {} })
    assert.equal(denied.status(), 404)
    checks.push('A different user cannot read or confirm another user’s conversation or actions')
    await page.getByRole('button', { name: 'Reprocessar capturas', exact: true }).click()
    await page.getByText('Acompanhando a fila de capturas', { exact: true }).waitFor({ timeout: 20000 })
    const confirmed = await db.supportAction.findUnique({ where: { id: action.id } })
    assert(confirmed.result.jobIds.length > 0)
    const duplicate = await second.request.post(new URL(`/api/support/actions/${action.id}`, base).href, { headers: { Origin: base.origin }, data: {} })
    assert.equal(duplicate.status(), 200)
    assert.equal(await db.workerJob.count({ where: { payload: { path: ['supportActionId'], equals: action.id } } }), confirmed.result.jobIds.length)
    checks.push('Owner confirmation queues the operation once; another device cannot duplicate it')
    await db.workerJob.updateMany({ where: { id: { in: confirmed.result.jobIds } }, data: { status: 'SUCCESS' } })
    await page.getByText('Capturas concluídas', { exact: true }).waitFor({ timeout: 30000 })
    checks.push('UI reports completion only after persisted worker jobs complete')
    await fs.mkdir('.test-infra/support-ui', { recursive: true })
    await page.screenshot({ path: '.test-infra/support-ui/desktop.png', fullPage: true, animations: 'disabled' })
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
    await page.screenshot({ path: '.test-infra/support-ui/mobile.png', fullPage: true, animations: 'disabled' })
    checks.push('390px mobile layout has no page overflow')
    assert.deepEqual(errors, [])
    const result = { scope: process.argv.includes('--real-plus') ? 'Local build, isolated database, actual Plus Codex; no cloud UI certification' : 'Isolated CI fixtures with explicit model stand-in; no cloud certification', passed: checks.length, checks, errors }
    await fs.writeFile('.test-infra/support-ui/results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} finally {
    for (const context of contexts) await context.close()
    await browser.close()
    if (fixtureRunId) await db.supportExecutor.deleteMany({ where: { runId: fixtureRunId } })
    if (conversationId) await db.supportConversation.deleteMany({ where: { id: conversationId } })
    await db.user.deleteMany({ where: { id: otherId } })
    await db.$disconnect()
}
