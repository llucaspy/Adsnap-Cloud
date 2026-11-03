import dotenv from 'dotenv'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import prisma from '../lib/prisma'
import { createSupportStore } from '../lib/supportStore'
import { createSupportTools, supportToolsForOwner, SUPPORT_SOURCE_FILES } from '../lib/supportTools'
import { createSupportReadModel } from '../lib/supportReadModel'
import { redactLogText } from '../lib/logRedaction'
import { PersonalAgent } from '../../scripts/codex-personal/bridge.mjs'
import { runSharedCodex } from '../../scripts/codex-personal/shared-runtime.mjs'
import { getNexusAccess, publicNexusAction, nexusReply } from '../lib/nexusPolicy'
import { processOneSupportRepair } from '../lib/supportRepair'
import { registerGamOrder, dispatchGamImport } from '../lib/gamOrderRegistration'
import { notifyGamOrderStarted } from '../lib/gamOrderTelegram'
import { learnNexusQuestion, recallNexusMemory } from '../lib/nexusMemory'

dotenv.config({ path: process.env.ADSNAP_SUPPORT_ENV_FILE || '.env.local' })
const root = resolve(process.cwd())
const store = createSupportStore(prisma)
const runId = randomUUID()
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function readSource(file: string, start: number) {
    if (!SUPPORT_SOURCE_FILES.includes(file)) throw new Error('Source not allowed')
    const path = await realpath(resolve(root, file))
    const realRoot = await realpath(root)
    if (!path.startsWith(realRoot + sep)) throw new Error('Source outside repository')
    const text = await readFile(path, 'utf8')
    if (start === 0) return text.slice(0, 500000)
    return redactLogText(text.split(/\r?\n/).slice(start - 1, start + 119).map((line, i) => `${start + i}: ${line}`).join('\n'), 10000)
}

async function main() {
    const probe = new PersonalAgent()
    let plan: string
    try { plan = (await probe.ready()).plan } finally { probe.close() }
    if (!await store.heartbeat(runId, 'ONLINE', plan)) throw new Error('Outro executor do atendimento está ativo.')
    await prisma.supportAction.updateMany({ where: { type: 'TECHNICAL_REVIEW', status: 'ANALYZING' }, data: { status: 'INTERNAL_REVIEW' } })
    console.log(JSON.stringify({ supportExecutor: 'started', auth: 'chatgpt', plan, paidApi: false }))
    let active: { id: string; controller: AbortController } | null = null
    let repair: { controller: AbortController; promise: Promise<void> } | null = null
    let state = 'ONLINE', pausedUntil = 0, nextRepairCheck = 0, stopping = false, updating = false, heartbeatFailed = false
    const timer = setInterval(async () => {
        if (updating) return
        updating = true
        try {
            if (!await store.heartbeat(runId, state, plan)) { stopping = true; active?.controller.abort(); repair?.controller.abort() }
            const current = active
            if (current && !await store.renew(current.id, runId)) current.controller.abort()
        } catch { heartbeatFailed = true; stopping = true; active?.controller.abort(); repair?.controller.abort() }
        finally { updating = false }
    }, 15000)
    const stop = () => { stopping = true; active?.controller.abort(); repair?.controller.abort() }
    process.once('SIGINT', stop); process.once('SIGTERM', stop)
    try {
        while (!stopping) {
            if (Date.now() < pausedUntil) { await wait(5000); continue }
            state = 'ONLINE'
            const turn = await store.claim(runId)
            if (!turn) {
                if (process.argv.includes('--once')) break
                if (!repair && Date.now() >= nextRepairCheck) {
                    nextRepairCheck = Date.now() + 15000
                    const controller = new AbortController()
                    const promise = processOneSupportRepair(prisma, root, runId, readSource, controller.signal)
                        .then(() => {}).catch(() => {}).finally(() => { repair = null })
                    repair = { controller, promise }
                }
                await wait(1000); continue
            }
            const controller = new AbortController()
            active = { id: turn.id, controller }; state = 'BUSY'
            const timeout = setTimeout(() => controller.abort(), 180000)
            const startedAt = Date.now()
            try {
                const access = await getNexusAccess(prisma, turn.conversation.user.id)
                if (!access) throw new Error('Conta indisponível.')
                const history = await prisma.supportTurn.findMany({ where: { conversationId: turn.conversationId, createdAt: { lte: turn.createdAt } }, orderBy: { createdAt: 'desc' }, take: 12, select: { userText: true, assistantText: true, status: true, actions: { select: { type: true, status: true, result: true } } } })
                const messages = history.reverse().flatMap(t => [
                    { role: 'user', text: t.userText },
                    ...(t.assistantText ? [{ role: 'assistant', text: nexusReply(t.assistantText.slice(0, 6000), access.isOwner) }] : []),
                    ...(t.actions.length ? [{ role: 'system-data', text: JSON.stringify(t.actions.map(a => publicNexusAction({ ...a, payload: {} }, access.isOwner))) }] : []),
                ]).reverse().filter((() => { let remaining = 30000; return (m: { text: string }) => { remaining -= m.text.length; return remaining >= 0 } })()).reverse()
                const executeTool = createSupportTools(prisma, turn.id, runId, readSource, url => registerGamOrder(prisma, url, dispatchGamImport, notifyGamOrderStarted))
                const result = await runSharedCodex({ messages, tools: supportToolsForOwner(access.isOwner), executeTool, signal: controller.signal,
                    loadContext: async () => {
                        const [overview, memory] = await Promise.all([createSupportReadModel(prisma, turn.conversation.user.id)('adsnap_system_overview'), recallNexusMemory(prisma, turn.conversation.user.id)])
                        return { ...overview, memory }
                    },
                    onReady: async (account: { plan: string }) => { plan = account.plan; if (!await store.heartbeat(runId, 'BUSY', plan)) throw new Error('Executor perdeu a posse.') },
                })
                await store.finish(turn.id, runId, result.answer)
                await learnNexusQuestion(prisma, turn.id).catch(() => {})
                console.log(JSON.stringify({ supportTurn: turn.id, status: 'SUCCESS', elapsedMs: Date.now() - startedAt }))
            } catch (error) {
                const limited = !!(error as Error & { limited?: boolean }).limited
                const message = limited ? 'O limite do plano foi atingido. O atendimento está pausado; nenhuma API paga foi utilizada.'
                    : 'A análise não foi concluída. Confira as ações e o estado do executor antes de solicitar outra tentativa.'
                await store.finish(turn.id, runId, message, false).catch(() => {})
                if (limited) { state = 'LIMITED'; pausedUntil = Date.now() + 15 * 60000 }
                console.error(JSON.stringify({ supportTurn: turn.id, status: 'FAILED', limited }))
            } finally { clearTimeout(timeout); active = null }
            if (process.argv.includes('--once')) break
        }
    } finally {
        clearInterval(timer)
        repair?.controller.abort()
        if (repair) await repair.promise
        await prisma.supportExecutor.updateMany({ where: { id: 'codex-plus', runId }, data: { state: 'OFFLINE', lockedUntil: new Date(), heartbeatAt: new Date() } }).catch(() => {})
        await prisma.$disconnect()
    }
    // Task Scheduler restarts failed exits. A transient database loss must not silently leave support offline.
    if (heartbeatFailed) throw new Error('Falha no heartbeat do executor.')
}

main().catch(async () => { console.error('O executor não iniciou. Confira a conexão de dados, o schema e o login ChatGPT do Codex. Nenhuma API paga foi utilizada.'); await prisma.$disconnect(); process.exitCode = 1 })
