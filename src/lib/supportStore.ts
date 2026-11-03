import { Prisma, type PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { redactLogText } from './logRedaction'

export const SUPPORT_EXECUTOR = 'codex-plus'
export const SUPPORT_LEASE_MS = 120_000
export type SupportIdentity = { userId: string; role: string }
export class SupportError extends Error {
    constructor(message: string, public status = 400) { super(message) }
}

export function supportText(value: unknown, max = 6000) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new SupportError(`Envie um texto de até ${max} caracteres.`)
    // Preview tokens and URLs are never needed to interpret a support request.
    return redactLogText(value.trim().replace(/https?:\/\/[^\s<>]+/gi, raw => {
        try { return `[link: ${new URL(raw).hostname}]` } catch { return '[link]' }
    }), max)
}

export function supportActionType(type: string) {
    if (!['RETRY_CAPTURE', 'VERIFIED_PREVIEW', 'TECHNICAL_REVIEW'].includes(type)) throw new SupportError('Operação não disponível no atendimento.')
    return type
}

export function createSupportStore(db: PrismaClient) {
    async function liveUser(identity: SupportIdentity) {
        const user = await db.user.findFirst({ where: { id: identity.userId, isActive: true, role: { in: ['admin', 'user'] } }, select: { id: true, role: true } })
        if (!user) throw new SupportError('Entre novamente no Adsnap.', 401)
        return user
    }
    async function owned(id: string, identity: SupportIdentity) {
        await liveUser(identity)
        const conversation = await db.supportConversation.findFirst({ where: { id, userId: identity.userId } })
        if (!conversation) throw new SupportError('Conversa não encontrada.', 404)
        return conversation
    }
    async function status() {
        const worker = await db.supportExecutor.findUnique({ where: { id: SUPPORT_EXECUTOR } })
        const online = !!worker && worker.lockedUntil > new Date() && Date.now() - worker.heartbeatAt.getTime() < 45_000
        return { online, state: online ? worker!.state : 'OFFLINE', plan: online ? worker!.plan : null }
    }
    async function list(identity: SupportIdentity) {
        await liveUser(identity)
        return db.supportConversation.findMany({ where: { userId: identity.userId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, updatedAt: true } })
    }
    async function create(identity: SupportIdentity, title: string) {
        await liveUser(identity)
        if (await db.supportConversation.count({ where: { userId: identity.userId } }) >= 100) throw new SupportError('Limite de conversas atingido.', 429)
        return db.supportConversation.create({ data: { userId: identity.userId, title: supportText(title, 100) }, select: { id: true, title: true } })
    }
    async function read(id: string, identity: SupportIdentity) {
        const conversation = await owned(id, identity)
        // A dead executor never silently replays a turn that may already have taken actions.
        await db.supportTurn.updateMany({ where: { conversationId: id, status: 'RUNNING', lockedUntil: { lt: new Date() } }, data: { status: 'FAILED', finishedAt: new Date(), assistantText: 'A execução foi interrompida. Confira as ações registradas antes de solicitar outra tentativa.' } })
        const turns = await db.supportTurn.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'desc' }, take: 40, include: { actions: { orderBy: { createdAt: 'asc' } } } })
        return { ...conversation, turns: turns.reverse().map(t => ({ id: t.id, userText: t.userText, assistantText: t.assistantText, status: t.status, createdAt: t.createdAt, actions: t.status === 'SUCCESS' ? t.actions : [] })) }
    }
    async function submit(id: string, identity: SupportIdentity, requestKey: string, input: unknown) {
        await owned(id, identity)
        if (!/^[a-f0-9-]{36}$/i.test(requestKey)) throw new SupportError('Identificador de envio inválido.')
        const userText = supportText(input)
        return db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.userId} FOR UPDATE`
            await tx.$queryRaw`SELECT id FROM "SupportConversation" WHERE id = ${id} FOR UPDATE`
            const existing = await tx.supportTurn.findUnique({ where: { conversationId_requestKey: { conversationId: id, requestKey } } })
            if (existing) return { id: existing.id, status: existing.status }
            if (await tx.supportTurn.count({ where: { conversationId: id, status: { in: ['QUEUED', 'RUNNING'] } } })) throw new SupportError('Aguarde a resposta atual antes de enviar outra mensagem.', 409)
            const since = new Date(Date.now() - 24 * 60 * 60_000)
            if (await tx.supportTurn.count({ where: { conversation: { userId: identity.userId }, createdAt: { gte: since } } }) >= 40) throw new SupportError('Limite diário do atendimento atingido para esta conta.', 429)
            if (await tx.supportTurn.count({ where: { status: 'QUEUED' } }) >= 100) throw new SupportError('A fila está cheia. Tente mais tarde.', 429)
            const turn = await tx.supportTurn.create({ data: { conversationId: id, requestKey, userText } })
            await tx.supportConversation.update({ where: { id }, data: { updatedAt: new Date() } })
            return { id: turn.id, status: turn.status }
        })
    }
    async function heartbeat(runId: string, state: string, plan: string) {
        const now = new Date(), lockedUntil = new Date(now.getTime() + SUPPORT_LEASE_MS)
        const result = await db.$executeRaw`
            INSERT INTO "SupportExecutor" (id, "runId", state, plan, "heartbeatAt", "lockedUntil")
            VALUES (${SUPPORT_EXECUTOR}, ${runId}, ${state}, ${plan}, ${now.toISOString()}::timestamp, ${lockedUntil.toISOString()}::timestamp)
            ON CONFLICT (id) DO UPDATE SET "runId" = EXCLUDED."runId", state = EXCLUDED.state,
              plan = EXCLUDED.plan, "heartbeatAt" = EXCLUDED."heartbeatAt", "lockedUntil" = EXCLUDED."lockedUntil"
            WHERE "SupportExecutor"."runId" = ${runId} OR "SupportExecutor"."lockedUntil" < ${now.toISOString()}::timestamp`
        return result === 1
    }
    async function claim(runId: string) {
        return db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "SupportExecutor" WHERE id = ${SUPPORT_EXECUTOR} FOR UPDATE`
            const executor = await tx.supportExecutor.findFirst({ where: { id: SUPPORT_EXECUTOR, runId, lockedUntil: { gt: new Date() } } })
            if (!executor) throw new SupportError('Outro executor está ativo.', 409)
            await tx.supportTurn.updateMany({ where: { status: 'RUNNING', lockedUntil: { lt: new Date() } }, data: { status: 'FAILED', finishedAt: new Date(), assistantText: 'A execução foi interrompida. Confira o histórico antes de solicitar outra tentativa.' } })
            if (await tx.supportTurn.count({ where: { status: 'RUNNING', lockedUntil: { gt: new Date() } } })) return null
            const rows = await tx.$queryRaw<{ id: string }[]>`
                SELECT t.id FROM "SupportTurn" t JOIN "SupportConversation" c ON c.id = t."conversationId"
                JOIN "User" u ON u.id = c."userId"
                WHERE t.status = 'QUEUED' AND u."isActive" = true AND u.role IN ('admin','user')
                ORDER BY t."createdAt", t.id FOR UPDATE OF t SKIP LOCKED LIMIT 1`
            if (!rows.length) return null
            return tx.supportTurn.update({ where: { id: rows[0].id }, data: { status: 'RUNNING', claimRunId: runId, startedAt: new Date(), lockedUntil: new Date(Date.now() + SUPPORT_LEASE_MS) }, include: { conversation: { include: { user: { select: { id: true, role: true, isActive: true } } } } } })
        })
    }
    async function renew(id: string, runId: string) {
        if (!await db.supportExecutor.count({ where: { id: SUPPORT_EXECUTOR, runId, lockedUntil: { gt: new Date() } } })) return false
        const result = await db.supportTurn.updateMany({ where: { id, claimRunId: runId, status: 'RUNNING', lockedUntil: { gt: new Date() } }, data: { lockedUntil: new Date(Date.now() + SUPPORT_LEASE_MS) } })
        return result.count === 1
    }
    async function finish(id: string, runId: string, answer: string, success = true) {
        await db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "SupportExecutor" WHERE id = ${SUPPORT_EXECUTOR} FOR UPDATE`
            if (!await tx.supportExecutor.count({ where: { id: SUPPORT_EXECUTOR, runId, lockedUntil: { gt: new Date() } } })) throw new SupportError('Executor perdeu a posse.', 409)
            const result = await tx.supportTurn.updateMany({ where: { id, claimRunId: runId, status: 'RUNNING', lockedUntil: { gt: new Date() } }, data: { assistantText: redactLogText(answer, 20000), status: success ? 'SUCCESS' : 'FAILED', finishedAt: new Date(), lockedUntil: null } })
            if (!result.count) throw new SupportError('A execução perdeu a posse desta solicitação.', 409)
        })
    }
    async function propose(turnId: string, runId: string, type: string, campaignIds: string[], reason: string) {
        supportActionType(type)
        const ids = [...new Set(campaignIds)].filter(id => /^[a-z0-9-]{8,64}$/i.test(id)).slice(0, 8)
        if (type !== 'TECHNICAL_REVIEW' && !ids.length) throw new SupportError('Escolha as campanhas antes de propor a operação.')
        return db.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "SupportTurn" WHERE id = ${turnId} FOR UPDATE`
            const turn = await tx.supportTurn.findFirst({ where: { id: turnId, claimRunId: runId, status: 'RUNNING', lockedUntil: { gt: new Date() }, conversation: { user: { isActive: true } } } })
            if (!turn) throw new SupportError('Solicitação expirada.', 409)
            const payload = { campaignIds: ids, reason: supportText(reason, 1500) }
            const existing = await tx.supportAction.findFirst({ where: { turnId, type } })
            if (existing) return existing
            return tx.supportAction.create({ data: { id: randomUUID(), turnId, type, payload: payload as Prisma.InputJsonValue } })
        })
    }
    return { liveUser, owned, status, list, create, read, submit, heartbeat, claim, renew, finish, propose }
}
