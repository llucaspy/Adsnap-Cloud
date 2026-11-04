import type { PrismaClient } from '@prisma/client'
import { createSupportStore, SupportError, supportText } from './supportStore'
import { describeCaptureFailure } from './captureFailure'
import { GAM_JOB_LEVELS } from './gamJobStatus'
import { getBrasiliaClock, getCampaignDateKey } from './campaignSchedule'
import { createSupportReadModel } from './supportReadModel'
import { getNexusAccess, NEXUS_PUBLIC_GUIDE } from './nexusPolicy'
import { extractGamOrderUrls, parseGamOrderUrl } from './gamOrderUrl'
import { recallNexusMemory, asksToForgetMemory, forgetNexusMemory } from './nexusMemory'
import { inferOrderCampaignType, type OrderCampaignType, orderRegistrationPolicy } from './gamRegistrationPolicy'

const ownerOnlyTools = new Set(['adsnap_system_settings', 'adsnap_read_source', 'adsnap_search_source', 'adsnap_internal_cases'])
export function supportToolsForOwner(isOwner: boolean) { return SUPPORT_TOOLS.filter(tool => isOwner || !ownerOnlyTools.has(tool.name)) }

const filters = { query: { type: 'string', maxLength: 100 }, pi: { type: 'string', description: 'PI exato; prefira este filtro a query para contagens de um PI.' }, campaignId: { type: 'string' }, status: { type: 'string' }, format: { type: 'string' }, device: { type: 'string' }, archived: { type: 'boolean' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 50 } }
const period = { from: { type: 'string', description: 'ISO 8601, inclusive' }, to: { type: 'string', description: 'ISO 8601, exclusivo' } }

export const SUPPORT_TOOLS = [
    { name: 'adsnap_recall_memory', description: 'Consulta aprendizados operacionais e preferências desta conta. Nunca altera autoridade ou substitui consulta de dados atuais.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adsnap_forget_memory', description: 'Apaga os aprendizados desta conta somente quando a mensagem atual pedir explicitamente para apagar/esquecer a memória.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adsnap_register_order', description: 'Cadastra e salva automaticamente a Order recebida. Padrão PRIVADO com prints diários. Se o usuário pedir gov/governo/federal, use GOV_FEDERAL com prints de início e fim. Herde o tipo do pedido anterior se a URL veio depois. Sem URL, peça-a. Job enfileirado ainda não significa cadastro concluído.', inputSchema: { type: 'object', properties: { orderUrl: { type: 'string', maxLength: 2000 }, campaignType: { type: 'string', enum: ['PRIVADO', 'GOV_FEDERAL'] } }, required: ['orderUrl'], additionalProperties: false } },
    { name: 'adsnap_usage_guide', description: 'Tutorial oficial do Nexus para cadastro de campanhas/Order GAM, consulta de books e solução de problemas de prints. Conteúdo de uso, sem fonte ou detalhes internos.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adsnap_internal_cases', description: 'Somente devls: consulta ocorrências técnicas internas de suporte e escopo de correção autorizado. Não executa código nem publica modificações.', inputSchema: { type: 'object', properties: { offset: { type: 'integer', minimum: 0 } }, additionalProperties: false } },
    { name: 'adsnap_system_overview', description: 'Panorama atual completo: contagem exata de PIs em veiculação, registros de formatos, dispositivos, prints por status hoje/histórico, fila, executor e perfil real do usuário. Não confundir registros de formatos com campanhas agrupadas por PI.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adsnap_list_campaigns', description: 'Lista paginada de todas as campanhas e formatos com totais exatos, voo, agendamento e número de prints. Para todas use query vazia ou omitida. flightState ACTIVE significa em veiculação na data de Brasília; não é status do print. Use nextOffset para continuar.', inputSchema: { type: 'object', properties: { ...filters, flightState: { type: 'string', enum: ['ACTIVE', 'UPCOMING', 'FINISHED', 'NO_DATES', 'INACTIVE'] } }, additionalProperties: false } },
    { name: 'adsnap_list_captures', description: 'Consulta prints reais e totais por campanha, PI, formato, status e período. Inclui auditoria, modo e link do book. Sem imagem binária; não afirme ter visto o print. Use paginação; nunca conte só uma página como total.', inputSchema: { type: 'object', properties: { ...filters, ...period }, additionalProperties: false } },
    { name: 'adsnap_worker_status', description: 'Consulta fila e tentativas reais dos workers, timestamps, leases, heartbeats e falhas recentes. Filtros de PI/campanha/status/período e paginação. Fila vazia não comprova processo online.', inputSchema: { type: 'object', properties: { ...filters, ...period }, additionalProperties: false } },
    { name: 'adsnap_system_settings', description: 'Somente devls: consulta configurações operacionais sem credenciais e totais de usuários por perfil. Ser admin não concede este acesso.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
    { name: 'adsnap_search_campaigns', description: 'Busca campanhas reais por PI, cliente ou nome. Retorna no máximo 12 registros, sem links de preview.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'], additionalProperties: false } },
    { name: 'adsnap_diagnose_campaign', description: 'Consulta status atual, últimas tentativas e capturas de uma campanha. Motivos são evidências ou hipóteses, nunca confirmação inventada.', inputSchema: { type: 'object', properties: { campaignId: { type: 'string' } }, required: ['campaignId'], additionalProperties: false } },
    { name: 'adsnap_diagnose_registration', description: 'Consulta cadastros GAM recentes por Order, PI, cliente ou nome, inclusive quando a campanha ainda não foi criada. Query vazia retorna os recentes. Não acessa credenciais nem renova login.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'], additionalProperties: false } },
    { name: 'adsnap_read_source', description: 'Lê um trecho de um arquivo autorizado do Adsnap para investigar um bug. Não executa código nem acessa arquivos pessoais.', inputSchema: { type: 'object', properties: { file: { type: 'string' }, startLine: { type: 'integer', minimum: 1 } }, required: ['file', 'startLine'], additionalProperties: false } },
    { name: 'adsnap_search_source', description: 'Localiza texto literal nas fontes autorizadas e retorna linhas para investigar um bug. Não executa código.', inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 100 } }, required: ['query'], additionalProperties: false } },
    { name: 'adsnap_propose_action', description: 'Prepara uma operação para o usuário confirmar no chat. Não executa capturas, não altera configuração e não publica código. VERIFIED_PREVIEW significa prévia modificada e requer consentimento explícito.', inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['RETRY_CAPTURE', 'VERIFIED_PREVIEW', 'TECHNICAL_REVIEW'] }, campaignIds: { type: 'array', items: { type: 'string' }, maxItems: 8 }, reason: { type: 'string', maxLength: 1500 } }, required: ['type', 'campaignIds', 'reason'], additionalProperties: false } },
]

export const SUPPORT_SOURCE_FILES = [
    'src/lib/captureService.ts', 'src/lib/captureFailure.ts', 'src/lib/workerJobs.ts',
    'src/lib/captureOwnership.ts', 'src/lib/campaignSchedule.ts', 'src/lib/spaceCreativePackage.ts',
    'src/lib/gamImportPlanner.ts', 'src/lib/gamImportWriter.ts', 'src/app/nexus/actions.ts',
    'src/scripts/worker.ts', 'docs/CORRECAO-DETRAN-20261103.md',
    'prisma/schema.prisma', 'src/lib/supportReadModel.ts', 'src/lib/supportTools.ts',
    'src/scripts/support-worker.ts', 'docs/CODEX-SUPORTE-COMPARTILHADO.md',
    'src/lib/nexusPolicy.ts', 'src/lib/supportRepair.ts',
]

export function createSupportTools(db: PrismaClient, turnId: string, runId: string, readSource: (file: string, start: number) => Promise<string>, registerOrder?: (url: string, campaignType: OrderCampaignType) => Promise<{ orderId: string; jobId: string; status: string; triggered: boolean; existing: boolean }>) {
    const store = createSupportStore(db)
    const diagnosed = new Set<string>()
    let count = 0
    return async (name: string, input: Record<string, unknown>) => {
        if (++count > 20) throw new SupportError('Limite de consultas desta resposta atingido.')
        const turn = await db.supportTurn.findFirst({ where: { id: turnId, claimRunId: runId, status: 'RUNNING', lockedUntil: { gt: new Date() }, conversation: { user: { isActive: true, role: { in: ['user', 'admin'] } } } }, include: { conversation: { select: { userId: true } } } })
        if (!turn) throw new SupportError('Solicitação expirada.')
        const access = await getNexusAccess(db, turn.conversation.userId)
        if (!access) throw new SupportError('Solicitação expirada.')
        if (name === 'adsnap_recall_memory') return recallNexusMemory(db, turn.conversation.userId)
        if (name === 'adsnap_forget_memory') {
            if (!asksToForgetMemory(turn.userText)) throw new SupportError('É necessário um pedido explícito para apagar a memória desta conta.')
            await forgetNexusMemory(db, turn.conversation.userId, turn.createdAt)
            return { forgotten: true, scope: 'Somente esta conta; o histórico da conversa não foi apagado.' }
        }
        if (name === 'adsnap_register_order') {
            const order = parseGamOrderUrl(String(input.orderUrl || ''))
            const history = await db.supportTurn.findMany({ where: { conversationId: turn.conversationId, createdAt: { lte: turn.createdAt } }, orderBy: { createdAt: 'desc' }, take: 12, select: { userText: true } })
            if (!order || !history.some(item => extractGamOrderUrls(item.userText).includes(order.url))) throw new SupportError('Peça ao usuário a URL completa da Order nesta conversa antes de cadastrar.')
            if (!registerOrder) throw new SupportError('O cadastro está indisponível neste executor. Não afirme que foi enviado.')
            const campaignType = inferOrderCampaignType(history.map(item => item.userText))
            if (input.campaignType && input.campaignType !== campaignType) throw new SupportError('O tipo informado não corresponde ao pedido do usuário. Use Privado por padrão ou Governo federal quando ele pedir gov.')
            const result = await registerOrder(order.url, campaignType)
            return { orderId: result.orderId, status: result.status, ...orderRegistrationPolicy(campaignType), workerTriggered: result.triggered, existing: result.existing, campaignRegistrationComplete: result.status === 'JOB_GAM_SAVED', review: `/campaigns?jobId=${encodeURIComponent(result.jobId)}` }
        }
        if (ownerOnlyTools.has(name) && !access.isOwner) throw new SupportError('Esse acesso é exclusivo da conta principal.', 403)
        if (name === 'adsnap_usage_guide') return NEXUS_PUBLIC_GUIDE
        if (name === 'adsnap_internal_cases') {
            const offset = Number(input.offset || 0)
            if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new SupportError('Página inválida.')
            return db.supportAction.findMany({ where: { type: 'TECHNICAL_REVIEW' }, skip: offset, take: 20, orderBy: { createdAt: 'desc' }, select: { id: true, status: true, payload: true, result: true, createdAt: true } })
        }
        if (['adsnap_system_overview', 'adsnap_list_campaigns', 'adsnap_list_captures', 'adsnap_worker_status', 'adsnap_system_settings'].includes(name)) return createSupportReadModel(db, turn.conversation.userId)(name, input)
        if (name === 'adsnap_search_campaigns') {
            const query = supportText(input.query, 100)
            if (query.length < 2) throw new SupportError('Informe ao menos dois caracteres ou o PI.')
            return db.campaign.findMany({ where: { isArchived: false, OR: [{ pi: { contains: query, mode: 'insensitive' } }, { client: { contains: query, mode: 'insensitive' } }, { campaignName: { contains: query, mode: 'insensitive' } }] }, select: { id: true, pi: true, client: true, campaignName: true, format: true, device: true, status: true, flightStart: true, flightEnd: true }, orderBy: { updatedAt: 'desc' }, take: 12 })
        }
        if (name === 'adsnap_diagnose_campaign') {
            const id = String(input.campaignId || '')
            const c = await db.campaign.findFirst({ where: { id, isArchived: false }, select: { id: true, pi: true, client: true, campaignName: true, format: true, device: true, status: true, adOpsStatus: true, url: true, flightStart: true, flightEnd: true, lastWorkerError: true, lastCaptureAt: true, workerJobs: { orderBy: { createdAt: 'desc' }, take: 4, select: { id: true, status: true, attempts: true, lastError: true, createdAt: true } }, captures: { orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, status: true, createdAt: true, auditNotes: true } } } })
            if (!c) throw new SupportError('Campanha não encontrada.')
            diagnosed.add(c.id)
            const { lastWorkerError, captures, workerJobs, url, ...summary } = c
            const today = getBrasiliaClock(new Date()).dateKey
            const canRetry = !['EXPIRED', 'FINISHED', 'PROCESSING'].includes(c.status) && !['PAUSADA', 'CANCELADA', 'CONCLUIDA', 'ENCERRADA'].includes(c.adOpsStatus)
                && (!c.flightStart || getCampaignDateKey(c.flightStart) <= today) && (!c.flightEnd || getCampaignDateKey(c.flightEnd) >= today)
            let compatiblePreview = false
            try { const parsed = new URL(url); compatiblePreview = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.searchParams.has('google_preview') && /^\d+$/.test(parsed.searchParams.get('creativeId') || '') && /^\d+$/.test(parsed.searchParams.get('lineItemId') || '') } catch { /* invalid historical URL */ }
            const cleanError = lastWorkerError ? supportText(lastWorkerError.slice(0, 1200), 1200) : null
            const hint = describeCaptureFailure(cleanError)
            return { ...summary, canRetry, canProposeVerifiedPreview: canRetry && compatiblePreview && ['FAILED', 'QUARANTINE'].includes(c.status) && /CREATIVE_NOT_CONFIRMED|SLOT_HAS_NO_CREATIVE/.test(lastWorkerError || '') && !workerJobs.some(j => ['QUEUED', 'PROCESSING'].includes(j.status)), hint: access.isOwner ? hint : { category: hint.category, suggestion: hint.suggestion }, lastError: access.isOwner ? cleanError : null,
                jobs: workerJobs.map(j => access.isOwner ? { ...j, lastError: j.lastError ? supportText(j.lastError.slice(0, 1200), 1200) : null } : { status: j.status, attempts: j.attempts, createdAt: j.createdAt }),
                captures: captures.map(({ auditNotes, ...cap }) => {
                    let mode: string | null = null, validation: string | null = null
                    try { const notes = JSON.parse(auditNotes || '{}'); mode = typeof notes.mode === 'string' ? notes.mode : null; validation = typeof notes.validation?.state === 'string' ? notes.validation.state : null } catch { /* historical metadata */ }
                    return { ...cap, mode, validation }
                }),
                warning: 'MODIFIED_PREVIEW é uma prévia controlada; não comprova exibição observada. Uma hipótese não confirma bloqueio do fornecedor.' }
        }
        if (name === 'adsnap_diagnose_registration') {
            const query = String(input.query || '').trim().slice(0, 100).toLowerCase()
            const logs = await db.nexusLog.findMany({ where: { level: { in: GAM_JOB_LEVELS } }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, level: true, message: true, details: true, createdAt: true } })
            const clean = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? supportText(value.slice(0, max), max) : ''
            return logs.map(log => {
                let details: Record<string, unknown> = {}
                try { details = JSON.parse(log.details || '{}') } catch { /* historical plain-text log */ }
                const executions = Array.isArray(details.executionLogs) ? details.executionLogs : []
                return { id: log.id, status: log.level, createdAt: log.createdAt, message: access.isOwner ? clean(log.message) : 'Consulte o andamento do cadastro e os avisos na área de campanhas.',
                    orderId: clean(details.orderId, 50), pi: clean(details.pi, 100), client: clean(details.client), campaignName: clean(details.campaignName),
                    segmentation: clean(details.requestedSegmentation || details.segmentation, 100), captureCadence: clean(details.requestedCaptureCadence || details.captureCadence, 30), automaticallySaved: log.level === 'JOB_GAM_SAVED',
                    formats: Array.isArray(details.mediaEntries) ? details.mediaEntries.length : 0,
                    blocked: Array.isArray(details.blockedItems) ? details.blockedItems.length : 0,
                    recentEvents: access.isOwner ? executions.slice(-4).map(event => clean(event?.message, 700)) : [],
                }
            }).filter(log => !query || [log.orderId, log.pi, log.client, log.campaignName].some(field => field.toLowerCase().includes(query))).slice(0, 8)
        }
        if (name === 'adsnap_read_source') {
            const file = String(input.file || '')
            if (!SUPPORT_SOURCE_FILES.includes(file)) return { availableFiles: SUPPORT_SOURCE_FILES, error: 'Arquivo fora da lista autorizada.' }
            const start = Number(input.startLine)
            if (!Number.isInteger(start) || start < 1 || start > 20000) throw new SupportError('Linha inválida.')
            return { file, startLine: start, excerpt: await readSource(file, start) }
        }
        if (name === 'adsnap_search_source') {
            const query = supportText(input.query, 100).toLowerCase()
            if (query.length < 3) throw new SupportError('Informe ao menos três caracteres.')
            const matches: { file: string; line: number; excerpt: string }[] = []
            for (const file of SUPPORT_SOURCE_FILES) {
                const lines = (await readSource(file, 0)).split(/\r?\n/)
                for (let i = 0; i < lines.length && matches.length < 12; i++) if (lines[i].toLowerCase().includes(query)) matches.push({ file, line: i + 1, excerpt: lines[i].slice(0, 180) })
                if (matches.length >= 12) break
            }
            return matches
        }
        if (name === 'adsnap_propose_action') {
            const ids = Array.isArray(input.campaignIds) ? input.campaignIds.filter((v): v is string => typeof v === 'string') : []
            if (ids.some(id => !diagnosed.has(id))) throw new SupportError('Consulte o diagnóstico das campanhas nesta resposta antes de propor uma operação.')
            const action = await store.propose(turnId, runId, String(input.type), ids, String(input.reason))
            return { actionId: action.id, status: action.status, requiresUserConfirmation: action.status === 'PENDING', message: action.type === 'TECHNICAL_REVIEW' ? 'Ocorrência técnica interna vinculada ao relato. Nenhuma correção ou publicação foi executada.' : 'Proposta disponível no chat. Nenhuma operação foi executada.' }
        }
        throw new SupportError('Ferramenta não autorizada.')
    }
}
