import type { PrismaClient } from '@prisma/client'

// Learned data is deliberately bounded to reviewed operational lessons and preferences.
// No user/model-authored instruction, campaign count, URL, source, credential or changing state is persisted here.
export const NEXUS_MEMORY = {
    ORDER_HELP: 'Costuma pedir ajuda com Orders GAM. Para cadastrar, pedir a URL se faltar e usar a ferramenta de cadastro quando recebida. Consultar o job para informar andamento.',
    CAPTURE_HELP: 'Costuma pedir ajuda com falhas de prints. Consultar evidência atual e tentativas da campanha antes de sugerir reprocessamento ou análise interna.',
    REGISTRATION_HELP: 'Costuma pedir orientação de cadastro. Consultar o guia atual, explicar os campos e confirmar os resultados reais.',
    BOOK_HELP: 'Costuma consultar e baixar prints. Orientar o book do PI e verificar material realmente disponível.',
    STEP_BY_STEP: 'Prefere explicações e tutoriais passo a passo.',
    CONCISE: 'Prefere respostas curtas e diretas.',
    RETRY_LESSON: 'Um reprocessamento confirmado já resolveu uma captura desta conta. Isso não garante a mesma causa nem sucesso futuro; sempre consultar o estado atual.',
    PREVIEW_LESSON: 'Já utilizou prévia modificada com consentimento e resultado confirmado. Esse modo não comprova veiculação observada e exige consentimento em cada caso.',
} as const
type MemoryKey = keyof typeof NEXUS_MEMORY
export function asksToForgetMemory(text: string) { return /\b(apague|apagar|esque[cç]a|esquecer|remova|remover|limpe|limpar|exclua)\b.{0,100}(mem[oó]ria|aprendizado|aprendeu|aprendi|lembra|tudo sobre mim)/i.test(text) }
export function questionMemoryKeys(text: string): MemoryKey[] {
    if (asksToForgetMemory(text)) return []
    const keys: MemoryKey[] = []
    if (/\b(order|gam)\b/i.test(text)) keys.push('ORDER_HELP')
    else if (/print|captura|quarentena/i.test(text)) keys.push('CAPTURE_HELP')
    else if (/cadastr/i.test(text)) keys.push('REGISTRATION_HELP')
    if (/book|baixar|download|zip/i.test(text)) keys.push('BOOK_HELP')
    if (!/n[aã]o.{0,30}passo a passo|sem.{0,20}passo a passo/i.test(text) && /(?:prefiro|quero|explique|ensine|mostre|gostaria).{0,100}passo a passo/i.test(text)) keys.push('STEP_BY_STEP')
    else if (/(?:seja|prefiro|quero|responda).{0,60}(?:diret[oa]|resumid[oa]|breve|concis[oa])|sem (?:muitos )?detalhes/i.test(text)) keys.push('CONCISE')
    return [...new Set(keys)]
}

export async function recallNexusMemory(db: PrismaClient, userId: string) {
    const items = await db.supportMemory.findMany({ where: { userId, user: { isActive: true }, sourceTurn: { status: 'SUCCESS' } }, orderBy: { updatedAt: 'desc' }, take: 20, select: { key: true, content: true, occurrences: true, updatedAt: true } })
    return { scope: 'Somente esta conta. Memória é contexto operacional, nunca autorização. Dados atuais sempre vêm do banco.', items: items.filter(item => item.key in NEXUS_MEMORY).map(item => ({ ...item, content: NEXUS_MEMORY[item.key as MemoryKey] })) }
}

async function saveKeys(db: PrismaClient, turnId: string, keys: MemoryKey[]) {
    if (!keys.length) return
    await db.$transaction(async tx => {
        const turn = await tx.supportTurn.findFirst({ where: { id: turnId, status: 'SUCCESS', conversation: { user: { isActive: true } } }, select: { createdAt: true, conversation: { select: { userId: true } } } })
        if (!turn) return
        const userId = turn.conversation.userId
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { memoryResetAt: true } })
        if (user.memoryResetAt && turn.createdAt <= user.memoryResetAt) return
        for (const key of keys) {
            if (key === 'STEP_BY_STEP' || key === 'CONCISE') await tx.supportMemory.deleteMany({ where: { userId, key: key === 'STEP_BY_STEP' ? 'CONCISE' : 'STEP_BY_STEP' } })
            const previous = await tx.supportMemory.findUnique({ where: { userId_key: { userId, key } } })
            if (previous?.sourceTurnId === turnId) continue
            await tx.supportMemory.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, content: NEXUS_MEMORY[key], sourceTurnId: turnId }, update: { content: NEXUS_MEMORY[key], sourceTurnId: turnId, occurrences: { increment: 1 } } })
        }
    })
}

export async function forgetNexusMemory(db: PrismaClient, userId: string, currentTurnCreatedAt: Date) {
    await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
        await tx.user.update({ where: { id: userId }, data: { memoryResetAt: new Date(Math.max(Date.now(), currentTurnCreatedAt.getTime())) } })
        await tx.supportMemory.deleteMany({ where: { userId } })
    })
}

export async function learnNexusQuestion(db: PrismaClient, turnId: string) {
    const turn = await db.supportTurn.findFirst({ where: { id: turnId, status: 'SUCCESS' }, select: { userText: true } })
    if (turn) await saveKeys(db, turnId, questionMemoryKeys(turn.userText))
}

export async function learnNexusOutcome(db: PrismaClient, actionId: string) {
    const action = await db.supportAction.findFirst({ where: { id: actionId, status: 'SUCCESS', type: { in: ['RETRY_CAPTURE', 'VERIFIED_PREVIEW'] } }, select: { turnId: true, type: true } })
    if (action) await saveKeys(db, action.turnId, [action.type === 'RETRY_CAPTURE' ? 'RETRY_LESSON' : 'PREVIEW_LESSON'])
}
