import { Prisma, type PrismaClient } from '@prisma/client'
import { getBrasiliaClock, getBrasiliaDayRangeFor, getCampaignDateKey } from './campaignSchedule'
import { SupportError, supportText } from './supportStore'
import { createFormatLabelMap, resolveFormatLabel } from './formatLabels'
import { getNexusAccess, nexusAuthority } from './nexusPolicy'
import { describeCaptureFailure } from './captureFailure'

type Flight = { flightStart: Date | null; flightEnd: Date | null; adOpsStatus: string; status: string }
export function supportFlightState(c: Flight, now = new Date()) {
    const today = getBrasiliaClock(now).dateKey
    if (['PAUSADA', 'CANCELADA', 'CONCLUIDA', 'ENCERRADA'].includes(c.adOpsStatus)) return 'INACTIVE'
    if (['EXPIRED', 'FINISHED'].includes(c.status)) return 'FINISHED'
    if (!c.flightStart || !c.flightEnd) return 'NO_DATES'
    if (getCampaignDateKey(c.flightStart) > today) return 'UPCOMING'
    if (getCampaignDateKey(c.flightEnd) < today) return 'FINISHED'
    return 'ACTIVE'
}
const definition = 'Em veiculação: não arquivada, não pausada/cancelada/concluída, com início e fim vigentes na data civil de Brasília. Falha de print não encerra a veiculação. Sem datas é informado à parte. Campanhas agrupadas por PI; registros representam formatos/dispositivos.'
const selected = { id: true, pi: true, agency: true, client: true, campaignName: true, format: true, device: true, status: true, adOpsStatus: true, segmentation: true, captureCadence: true, flightStart: true, flightEnd: true, lastCaptureAt: true, isScheduled: true, isMonitoringActive: true, lastDelivered: true, lastGoal: true, lastViewability: true, lastFetchedAt: true } as const
const clean = (text: string | null) => text ? supportText(text.slice(0, 1200), 1200) : null
function page(input: Record<string, unknown>) {
    const offset = Number(input.offset ?? 0), limit = Number(input.limit ?? 25)
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new SupportError('Página inválida: limit 1–50, offset 0–100000.')
    return { offset, limit }
}
function dates(input: Record<string, unknown>) {
    const result: { gte?: Date; lt?: Date } = {}
    for (const [key, field] of [['from', 'gte'], ['to', 'lt']] as const) if (input[key]) {
        const value = new Date(String(input[key]))
        if (!Number.isFinite(value.getTime())) throw new SupportError('Data inválida. Use ISO 8601 com fuso horário.')
        result[field] = value
    }
    if (result.gte && result.lt && result.gte >= result.lt) throw new SupportError('Período inválido.')
    return Object.keys(result).length ? result : undefined
}
function queryWhere(input: Record<string, unknown>): Prisma.CampaignWhereInput {
    const query = String(input.query || '').trim().slice(0, 100)
    return { isArchived: input.archived === true, ...(query ? { OR: ['pi', 'client', 'campaignName', 'agency'].map(key => ({ [key]: { contains: query, mode: 'insensitive' } })) } : {}),
        ...(input.pi ? { pi: { equals: String(input.pi).trim(), mode: 'insensitive' } } : {}), ...(input.campaignId ? { id: String(input.campaignId) } : {}), ...(input.status ? { status: String(input.status) } : {}),
        ...(input.format ? { format: { in: Array.isArray(input.formatIds) ? input.formatIds.map(String) : [String(input.format)], mode: 'insensitive' } } : {}), ...(input.device ? { device: String(input.device) } : {}) }
}

export function createSupportReadModel(db: PrismaClient, userId: string) {
    async function user() {
        const access = await getNexusAccess(db, userId)
        if (!access) throw new SupportError('Entre novamente para consultar o sistema.', 401)
        return access
    }
    return async (name: string, input: Record<string, unknown> = {}) => {
        const { user: current, isOwner } = await user()
        const now = new Date()
        if (name === 'adsnap_system_overview') {
            const today = getBrasiliaDayRangeFor(now)
            const data = await db.$transaction(async tx => {
                const campaigns = await tx.campaign.findMany({ where: { isArchived: false }, select: selected })
                const captures = await tx.capture.groupBy({ by: ['status'], _count: { _all: true } })
                const capturesToday = await tx.capture.groupBy({ by: ['status'], where: { createdAt: { gte: today.start, lt: today.end } }, _count: { _all: true } })
                const jobs = await tx.workerJob.groupBy({ by: ['status'], _count: { _all: true } })
                const executor = await tx.supportExecutor.findUnique({ where: { id: 'codex-plus' }, select: { state: true, heartbeatAt: true, lockedUntil: true } })
                const formats = await tx.settings.findUnique({ where: { id: 1 }, select: { bannerFormats: true } })
                return { campaigns, captures, capturesToday, jobs, executor, formats }
            }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
            const active = data.campaigns.filter(c => supportFlightState(c, now) === 'ACTIVE')
            const labels = createFormatLabelMap(data.formats?.bannerFormats)
            const formatCounts = (rows: typeof active) => [...new Set(rows.map(c => c.format))].sort().map(format => ({ formatId: format, label: resolveFormatLabel(labels, format), records: rows.filter(c => c.format === format).length }))
            const pis = (rows: typeof active) => new Set(rows.map(c => c.pi.trim() || c.id)).size
            const countBy = (rows: typeof active, key: 'format' | 'device' | 'status') => Object.fromEntries([...new Set(rows.map(c => c[key]))].sort().map(value => [value, rows.filter(c => c[key] === value).length]))
            return { asOf: now.toISOString(), timezone: 'America/Sao_Paulo', definition, viewer: current, authority: nexusAuthority(isOwner),
                campaigns: { registeredPis: pis(data.campaigns), registeredFormatRecords: data.campaigns.length, activePis: pis(active), activeFormatRecords: active.length, noDatesRecords: data.campaigns.filter(c => supportFlightState(c, now) === 'NO_DATES').length, upcomingRecords: data.campaigns.filter(c => supportFlightState(c, now) === 'UPCOMING').length, formats: formatCounts(data.campaigns), activeFormats: formatCounts(active), devices: countBy(data.campaigns, 'device'), captureStates: countBy(data.campaigns, 'status') },
                captures: { scope: 'Todos os prints persistidos, incluindo campanhas arquivadas e montagens; não confundir SUCCESS com prova de exibição observada: consulte mode e validation.', allTimeByStatus: data.captures, todayByStatus: data.capturesToday, todayStart: today.start, todayEndExclusive: today.end }, jobsByStatus: data.jobs,
                supportExecutor: data.executor ? { ...(isOwner ? data.executor : { state: data.executor.state }), online: data.executor.lockedUntil > now && now.getTime() - data.executor.heartbeatAt.getTime() < 45000 } : null,
                capabilities: isOwner ? 'Você é a conta principal: suporte, fontes autorizadas, configurações e ocorrências técnicas internas. Sem credenciais ou conversas de terceiros.' : 'Suporte operacional de campanhas, cadastro, prints e tutoriais. Sem código-fonte, APIs, configurações internas ou dados críticos. Falhas internas podem ser encaminhadas sem expor detalhes técnicos.' }
        }
        const formats = await db.settings.findUnique({ where: { id: 1 }, select: { bannerFormats: true } })
        const labels = createFormatLabelMap(formats?.bannerFormats)
        if (input.format) {
            const matched = [...labels].filter(([, label]) => label.toLowerCase() === String(input.format).toLowerCase())
            if (matched.length) input = { ...input, formatIds: [...matched.map(([id]) => id), String(input.format)] }
        }
        const formatRecord = <T extends { format: string }>(c: T) => ({ ...c, formatId: c.format, format: resolveFormatLabel(labels, c.format) })
        if (name === 'adsnap_list_campaigns') {
            const { offset, limit } = page(input)
            const rows = await db.campaign.findMany({ where: queryWhere(input), select: { ...selected, _count: { select: { captures: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] })
            const filtered = rows.filter(c => !input.flightState || supportFlightState(c, now) === input.flightState)
            return { asOf: now, definition, totalFormatRecords: filtered.length, totalPis: new Set(filtered.map(c => c.pi.trim() || c.id)).size, offset, nextOffset: offset + limit < filtered.length ? offset + limit : null,
                items: filtered.slice(offset, offset + limit).map(c => ({ ...formatRecord(c), flightState: supportFlightState(c, now), book: `/books/${encodeURIComponent(c.pi)}` })) }
        }
        if (name === 'adsnap_list_captures') {
            const { offset, limit } = page(input)
            const where: Prisma.CaptureWhereInput = { campaign: queryWhere({ ...input, status: undefined }), ...(input.status ? { status: String(input.status) } : {}), createdAt: dates(input) }
            const [total, items] = await db.$transaction([db.capture.count({ where }), db.capture.findMany({ where, skip: offset, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, campaignId: true, status: true, createdAt: true, aiAuditStatus: true, aiScore: true, aiDiagnostic: true, isAssembly: true, auditNotes: true, campaign: { select: { pi: true, client: true, campaignName: true, format: true, device: true } } } })])
            return { asOf: now, total, nextOffset: offset + limit < total ? offset + limit : null, items: items.map(({ auditNotes, aiDiagnostic, ...item }) => {
                let mode: string | null = null, validation: string | null = null
                try { const notes = JSON.parse(auditNotes || '{}'); mode = typeof notes.mode === 'string' ? clean(notes.mode) : null; validation = typeof notes.validation?.state === 'string' ? clean(notes.validation.state) : null } catch { /* historical metadata */ }
                return { ...item, campaign: formatRecord(item.campaign), aiDiagnostic: isOwner ? clean(aiDiagnostic) : null, mode: ['MODIFIED_PREVIEW', 'OBSERVED', 'NATIVE', 'ASSEMBLY'].includes(mode || '') ? mode : null, validation: ['VERIFIED', 'CONFIRMED', 'PASSED', 'FAILED', 'UNCONFIRMED', 'SUCCESS'].includes(validation || '') ? validation : null, book: `/books/${encodeURIComponent(item.campaign.pi)}` }
            }) }
        }
        if (name === 'adsnap_worker_status') {
            const { offset, limit } = page(input)
            const where: Prisma.WorkerJobWhereInput = { ...(input.query || input.pi || input.campaignId || input.format || input.device || input.archived !== undefined ? { campaign: queryWhere({ ...input, status: undefined }) } : {}), ...(input.status ? { status: String(input.status) } : {}), createdAt: dates(input) }
            const [counts, total, jobs, processing, recentErrors] = await Promise.all([
                db.workerJob.groupBy({ by: ['status'], _count: { _all: true } }), db.workerJob.count({ where }),
                db.workerJob.findMany({ where, take: limit, skip: offset, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, type: true, status: true, campaignId: true, attempts: true, maxAttempts: true, createdAt: true, scheduledFor: true, startedAt: true, finishedAt: true, lockedUntil: true, lastError: true, campaign: { select: { pi: true, client: true, format: true, device: true } } } }),
                db.campaign.findMany({ where: { isArchived: false, status: 'PROCESSING' }, take: 50, select: { id: true, pi: true, format: true, processingStartedAt: true, processingHeartbeatAt: true, lockedUntil: true } }),
                db.campaign.findMany({ where: { ...queryWhere({ ...input, status: undefined }), lastWorkerError: { not: null } }, take: 20, orderBy: { updatedAt: 'desc' }, select: { id: true, pi: true, client: true, format: true, status: true, lastWorkerError: true, updatedAt: true } }),
            ])
            if (!isOwner) return { asOf: now, counts, total, nextOffset: offset + limit < total ? offset + limit : null, jobs: jobs.map(j => ({ status: j.status, attempts: j.attempts, createdAt: j.createdAt, finishedAt: j.finishedAt, campaign: j.campaign ? formatRecord(j.campaign) : null })), recentErrors: recentErrors.map(c => { const hint = describeCaptureFailure(c.lastWorkerError); return { id: c.id, pi: c.pi, client: c.client, format: resolveFormatLabel(labels, c.format), status: c.status, category: hint.category, suggestion: hint.suggestion } }), warning: 'Consulta operacional. A fila histórica não comprova que uma captura está sendo executada agora.' }
            return { asOf: now, counts, total, nextOffset: offset + limit < total ? offset + limit : null, jobs: jobs.map(j => ({ ...j, campaign: j.campaign ? formatRecord(j.campaign) : null, lastError: clean(j.lastError), leaseExpired: j.lockedUntil ? j.lockedUntil <= now : null })), processing: processing.map(formatRecord), recentErrors: recentErrors.map(c => ({ ...formatRecord(c), lastWorkerError: clean(c.lastWorkerError) })), warning: 'Jobs históricos e fila não provam que um processo está online. Avalie heartbeat, lease e horário. Processing e erros são amostras limitadas a 50 e 20; counts é o total global.' }
        }
        if (name === 'adsnap_system_settings') {
            if (!isOwner) return { viewer: current, error: 'Esse acesso é exclusivo da conta principal. Você pode consultar campanhas e prints.' }
            const settings = await db.settings.findUnique({ where: { id: 1 }, select: { nexusMaxRetries: true, nexusTimeout: true, nexusDelay: true, autoCleanupDays: true, performanceMode: true, feedPollingRate: true, maintenanceMode: true, bannerFormats: true, telegramAlertsEnabled: true, governmentReportAutoSend: true, governmentReportTime: true, updatedAt: true } })
            const users = await db.user.groupBy({ by: ['role', 'isActive'], _count: { _all: true } })
            return { asOf: now, viewer: current, settings, usersByRoleAndActive: users }
        }
        throw new SupportError('Consulta não autorizada.')
    }
}
