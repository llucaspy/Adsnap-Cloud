import prisma from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { getBrasiliaDayRange } from '@/lib/governmentReportScope'
import { getCampaignDateKey } from '@/lib/campaignSchedule'
import { BookEmailButton } from '@/components/BookEmailButton'
import {
    AlertTriangle,
    Archive,
    CalendarClock,
    CheckCircle2,
    Clock3,
    ExternalLink,
    FileArchive,
    Gauge,
    ImageIcon,
    Mail,
    MailCheck,
    RadioTower,
    ShieldCheck,
    Users,
    XCircle,
    type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const FEDERAL_SEGMENTATION = 'GOV_FEDERAL'
const DEFAULT_RECIPIENTS = [
    'opec.gov@metropoles.com',
    'karoliny.sousa@metropoles.com',
]

type DispatchSummary = {
    id: string
    pi: string
    status: string
    triggerMode: string
    reportScope: string
    reportDate: Date | null
    dispatchTime: string
    lastSentAt: Date | null
    updatedAt: Date
    errorMessage: string | null
    attachmentCount: number
    attachmentBytes: number
    attempts: number
}

type CampaignGroup = {
    pi: string
    client: string
    agency: string
    campaignNames: string[]
    campaignCount: number
    formatCount: number
    formats: string[]
    devices: string[]
    captureCadences: string[]
    scheduledTimes: string[]
    statuses: string[]
    flightStart: Date | null
    flightEnd: Date | null
    printCount: number
    todayPrintCount: number
    lastCaptureAt: Date | null
    lastCaptureDateKey: string | null
    lastWorkerError: string | null
    reportDispatch: DispatchSummary | null
    dayDispatch: DispatchSummary | null
    latestDispatch: DispatchSummary | null
}

function parseRecipients(value: string | null | undefined) {
    try {
        const parsed = JSON.parse(value || '[]')
        return Array.isArray(parsed)
            ? parsed.filter(item => typeof item === 'string' && item.includes('@'))
            : DEFAULT_RECIPIENTS
    } catch {
        return DEFAULT_RECIPIENTS
    }
}

function parseStringList(value: string | null | undefined) {
    try {
        const parsed = JSON.parse(value || '[]')
        return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string' && item.trim()) : []
    } catch {
        return []
    }
}

function parseFormatDefinitions(value: string | null | undefined) {
    try {
        const parsed = JSON.parse(value || '[]') as Array<{
            id?: string
            label?: string
            width?: number
            height?: number
        }>
        if (!Array.isArray(parsed)) return new Map<string, string>()
        return new Map(parsed.flatMap(format => {
            if (!format.id) return []
            return [[format.id, format.label || (format.width && format.height ? `${format.width}x${format.height}` : format.id)]]
        }))
    } catch {
        return new Map<string, string>()
    }
}

function unique(values: Array<string | null | undefined>) {
    return Array.from(new Set(values.map(value => value?.trim()).filter(Boolean) as string[]))
}

function getBrtDateKey(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date)
}

function formatDate(value: Date | null) {
    if (!value) return '-'
    return getCampaignDateKey(value).split('-').reverse().join('/')
}

function formatDateTime(value: Date | null) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(value)
}

function formatBytes(value: number) {
    if (!value) return '0 MB'
    return `${(value / 1024 / 1024).toFixed(value > 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function cadenceLabel(value: string) {
    return value === 'DAILY' ? 'Diaria' : value === 'BOUNDARY' ? 'Inicio e fim' : value || 'Indefinida'
}

function statusMeta(status?: string | null) {
    const normalized = status || 'NOT_SENT'
    const map: Record<string, { label: string; className: string; icon: LucideIcon }> = {
        NOT_SENT: {
            label: 'Nao enviado',
            className: 'border-white/10 bg-white/[0.04] text-[#a3a3a3]',
            icon: Clock3,
        },
        PENDING: {
            label: 'Pendente',
            className: 'border-white/10 bg-white/[0.04] text-[#a3a3a3]',
            icon: Clock3,
        },
        QUEUED_AUTO: {
            label: 'Na fila',
            className: 'border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]',
            icon: Clock3,
        },
        QUEUED_MANUAL: {
            label: 'Na fila',
            className: 'border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#f59e0b]',
            icon: Clock3,
        },
        PROCESSING: {
            label: 'Enviando',
            className: 'border-[#3b82f6]/20 bg-[#3b82f6]/10 text-[#3b82f6]',
            icon: RadioTower,
        },
        SENT: {
            label: 'Enviado',
            className: 'border-[#22c55e]/20 bg-[#22c55e]/10 text-[#22c55e]',
            icon: CheckCircle2,
        },
        FAILED: {
            label: 'Falhou',
            className: 'border-[#ef4444]/20 bg-[#ef4444]/10 text-[#ef4444]',
            icon: XCircle,
        },
    }
    return map[normalized] || map.NOT_SENT
}

function scopeLabel(dispatch: DispatchSummary | null) {
    if (!dispatch) return 'Sem envio'
    if (dispatch.reportScope === 'DAY') return dispatch.reportDate ? `Dia ${formatDate(dispatch.reportDate)}` : 'Diario'
    return 'Book completo'
}

function StatusBadge({ status }: { status?: string | null }) {
    const meta = statusMeta(status)
    const Icon = meta.icon

    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}>
            <Icon size={12} className={status === 'PROCESSING' ? 'animate-pulse' : ''} />
            {meta.label}
        </span>
    )
}

function MetricCard({
    icon: Icon,
    label,
    value,
    detail,
    tone = 'default',
}: {
    icon: LucideIcon
    label: string
    value: string
    detail: string
    tone?: 'default' | 'success' | 'warning' | 'error'
}) {
    const toneClass = {
        default: 'text-[#a3a3a3] border-white/8 bg-white/[0.04]',
        success: 'text-[#22c55e] border-[#22c55e]/20 bg-[#22c55e]/10',
        warning: 'text-[#f59e0b] border-[#f59e0b]/20 bg-[#f59e0b]/10',
        error: 'text-[#ef4444] border-[#ef4444]/20 bg-[#ef4444]/10',
    }[tone]

    return (
        <div className="scroll-reveal rounded-xl border border-white/8 bg-white/[0.04] p-5 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-[rgba(0,0,0,0.45)_0px_16px_40px_-4px]">
            <div className="mb-5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">{label}</span>
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass}`}>
                    <Icon size={17} />
                </span>
            </div>
            <p className="text-3xl font-semibold leading-none tracking-[-0.5px] text-[#ffffff]">{value}</p>
            <p className="mt-2 text-sm leading-6 text-[#a3a3a3]">{detail}</p>
        </div>
    )
}

async function getGovernmentBooksData() {
    const todayKey = getBrtDateKey(new Date())
    const todayRange = getBrasiliaDayRange(todayKey)

    const [settings, campaigns, secretRows] = await Promise.all([
        prisma.settings.findUnique({ where: { id: 1 } }),
        prisma.campaign.findMany({
            where: {
                segmentation: FEDERAL_SEGMENTATION,
                isArchived: false,
            },
            select: {
                id: true,
                pi: true,
                client: true,
                agency: true,
                campaignName: true,
                format: true,
                device: true,
                status: true,
                captureCadence: true,
                scheduledTimes: true,
                flightStart: true,
                flightEnd: true,
                lastCaptureAt: true,
                lastWorkerError: true,
            },
            orderBy: [{ pi: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.nexusSecrets.findMany({
            where: { name: { in: ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] } },
            select: { name: true, value: true },
        }).catch(() => []),
    ])

    const recipients = parseRecipients(settings?.governmentReportRecipients)
    const campaignIds = campaigns.map(campaign => campaign.id)
    const piValues = unique(campaigns.map(campaign => campaign.pi))
    const [captureCounts, todayCaptureCounts, lastCaptureGroups, dispatches] = await Promise.all([
        campaignIds.length > 0
            ? prisma.capture.groupBy({
                by: ['campaignId'],
                where: {
                    campaignId: { in: campaignIds },
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                },
                _count: { id: true },
            })
            : Promise.resolve([]),
        campaignIds.length > 0
            ? prisma.capture.groupBy({
                by: ['campaignId'],
                where: {
                    campaignId: { in: campaignIds },
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                    createdAt: { gte: todayRange.start, lte: todayRange.end },
                },
                _count: { id: true },
            })
            : Promise.resolve([]),
        campaignIds.length > 0
            ? prisma.capture.groupBy({
                by: ['campaignId'],
                where: {
                    campaignId: { in: campaignIds },
                    status: 'SUCCESS',
                    screenshotPath: { not: '' },
                },
                _max: { createdAt: true },
            })
            : Promise.resolve([]),
        piValues.length > 0
            ? prisma.emailDispatch.findMany({
                where: {
                    pi: { in: piValues },
                    reportScope: { in: ['CAMPAIGN', 'DAY'] },
                },
                select: {
                    id: true,
                    pi: true,
                    status: true,
                    triggerMode: true,
                    reportScope: true,
                    reportDate: true,
                    dispatchTime: true,
                    lastSentAt: true,
                    updatedAt: true,
                    errorMessage: true,
                    attachmentCount: true,
                    attachmentBytes: true,
                    attempts: true,
                },
                orderBy: { updatedAt: 'desc' },
                take: 80,
            })
            : Promise.resolve([]),
    ])

    const formatLabelById = parseFormatDefinitions(settings?.bannerFormats)
    const countsByCampaign = new Map(captureCounts.map(item => [item.campaignId, item._count.id]))
    const todayCountsByCampaign = new Map(todayCaptureCounts.map(item => [item.campaignId, item._count.id]))
    const lastCaptureByCampaign = new Map(lastCaptureGroups.map(item => [item.campaignId, item._max.createdAt]))
    const dispatchRows: DispatchSummary[] = dispatches
    const latestDispatchByPi = new Map<string, DispatchSummary>()
    const campaignDispatchByPi = new Map<string, DispatchSummary>()
    const todayDispatchByPi = new Map<string, DispatchSummary>()

    for (const dispatch of dispatchRows) {
        if (!latestDispatchByPi.has(dispatch.pi)) latestDispatchByPi.set(dispatch.pi, dispatch)
        if (dispatch.reportScope === 'CAMPAIGN' && !campaignDispatchByPi.has(dispatch.pi)) {
            campaignDispatchByPi.set(dispatch.pi, dispatch)
        }
        if (dispatch.reportScope === 'DAY' && dispatch.reportDate && getBrtDateKey(dispatch.reportDate) === todayKey && !todayDispatchByPi.has(dispatch.pi)) {
            todayDispatchByPi.set(dispatch.pi, dispatch)
        }
    }

    const groupsByPi = new Map<string, CampaignGroup>()
    for (const campaign of campaigns) {
        const current = groupsByPi.get(campaign.pi)
        const printCount = countsByCampaign.get(campaign.id) || 0
        const todayPrintCount = todayCountsByCampaign.get(campaign.id) || 0
        const lastCaptureAt = lastCaptureByCampaign.get(campaign.id) || campaign.lastCaptureAt
        const formatLabel = formatLabelById.get(campaign.format) || campaign.format || 'Formato indefinido'

        if (!current) {
            groupsByPi.set(campaign.pi, {
                pi: campaign.pi,
                client: campaign.client,
                agency: campaign.agency,
                campaignNames: unique([campaign.campaignName]),
                campaignCount: 1,
                formatCount: 1,
                formats: unique([`${formatLabel} (${campaign.device})`]),
                devices: unique([campaign.device]),
                captureCadences: unique([campaign.captureCadence]),
                scheduledTimes: parseStringList(campaign.scheduledTimes),
                statuses: unique([campaign.status]),
                flightStart: campaign.flightStart,
                flightEnd: campaign.flightEnd,
                printCount,
                todayPrintCount,
                lastCaptureAt,
                lastCaptureDateKey: lastCaptureAt ? getBrtDateKey(lastCaptureAt) : null,
                lastWorkerError: campaign.lastWorkerError,
                reportDispatch: campaignDispatchByPi.get(campaign.pi) || null,
                dayDispatch: todayDispatchByPi.get(campaign.pi) || null,
                latestDispatch: latestDispatchByPi.get(campaign.pi) || null,
            })
            continue
        }

        current.campaignNames = unique([...current.campaignNames, campaign.campaignName])
        current.campaignCount += 1
        current.formatCount += 1
        current.formats = unique([...current.formats, `${formatLabel} (${campaign.device})`])
        current.devices = unique([...current.devices, campaign.device])
        current.captureCadences = unique([...current.captureCadences, campaign.captureCadence])
        current.scheduledTimes = unique([...current.scheduledTimes, ...parseStringList(campaign.scheduledTimes)]).sort()
        current.statuses = unique([...current.statuses, campaign.status])
        current.printCount += printCount
        current.todayPrintCount += todayPrintCount
        current.lastWorkerError = current.lastWorkerError || campaign.lastWorkerError
        if (campaign.flightStart && (!current.flightStart || campaign.flightStart < current.flightStart)) current.flightStart = campaign.flightStart
        if (campaign.flightEnd && (!current.flightEnd || campaign.flightEnd > current.flightEnd)) current.flightEnd = campaign.flightEnd
        if (lastCaptureAt && (!current.lastCaptureAt || lastCaptureAt > current.lastCaptureAt)) {
            current.lastCaptureAt = lastCaptureAt
            current.lastCaptureDateKey = getBrtDateKey(lastCaptureAt)
        }
    }

    const smtpSecrets = new Map(secretRows.map(secret => [secret.name, secret.value]))
    const smtpConfigured = Boolean(
        (process.env.SMTP_USER || smtpSecrets.get('SMTP_USER')) &&
        (process.env.SMTP_PASS || smtpSecrets.get('SMTP_PASS')) &&
        (process.env.SMTP_FROM || smtpSecrets.get('SMTP_FROM'))
    )
    const groups = Array.from(groupsByPi.values()).sort((a, b) => {
        const aTime = a.flightEnd?.getTime() || 0
        const bTime = b.flightEnd?.getTime() || 0
        return bTime - aTime || a.pi.localeCompare(b.pi)
    })

    return {
        todayKey,
        groups,
        dispatches: dispatchRows,
        recipients,
        settings: {
            autoSend: Boolean(settings?.governmentReportAutoSend),
            dispatchTime: settings?.governmentReportTime || '09:00',
            smtpConfigured,
        },
    }
}

export default async function GovernmentBooksPage() {
    const session = await getSession()
    if (!session || session.role !== 'admin') redirect('/login')

    const { groups, dispatches, recipients, settings, todayKey } = await getGovernmentBooksData()
    const totalFormats = groups.reduce((total, group) => total + group.formatCount, 0)
    const totalPrintsToday = groups.reduce((total, group) => total + group.todayPrintCount, 0)
    const processingCount = dispatches.filter(dispatch => ['PROCESSING', 'QUEUED_AUTO', 'QUEUED_MANUAL'].includes(dispatch.status)).length
    const failedCount = dispatches.filter(dispatch => dispatch.status === 'FAILED').length
    const sentCount = dispatches.filter(dispatch => dispatch.status === 'SENT').length

    return (
        <div className="mx-[-1rem] mt-[-1rem] min-h-screen bg-[#0f0f0f] px-4 pb-24 pt-6 text-[#e5e5e5] page-enter md:mx-[-3rem] md:mt-[-3rem] md:px-12 md:pt-10" style={{ fontFamily: 'Inter, var(--font-body)' }}>
            <div className="mx-auto max-w-[1480px] space-y-10">
                <header className="scroll-reveal flex flex-col gap-6 border-b border-white/8 pb-8 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-4xl">
                        <Link
                            href="/books"
                            className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-[#a3a3a3] transition-[background,border-color,color,transform] duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07] hover:text-[#ffffff]"
                        >
                            <Archive size={14} />
                            Voltar para Books
                        </Link>
                        <div className="mb-4 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/25 bg-[#7c3aed]/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffffff]">
                                <ShieldCheck size={13} className="text-[#7c3aed]" />
                                Governo Federal
                            </span>
                            <span className="text-xs font-medium text-[#737373]">Envios oficiais de books por e-mail</span>
                        </div>
                        <h1 className="text-4xl font-semibold leading-[1.08] tracking-[-0.5px] text-[#ffffff] md:text-5xl">
                            Books cadastrados para envio
                        </h1>
                        <p className="mt-4 max-w-3xl text-base leading-7 text-[#a3a3a3]">
                            Visao operacional das PIs GOV_FEDERAL que entram no fluxo de e-mail, com formatos, destinatarios, prints e ultimo estado de disparo.
                        </p>
                    </div>

                    <div className="grid min-w-full grid-cols-1 gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                        <div className="rounded-xl border border-white/8 bg-white/[0.04] p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">SMTP</p>
                            <div className="mt-3 flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${settings.smtpConfigured
                                    ? 'border-[#22c55e]/20 bg-[#22c55e]/10 text-[#22c55e]'
                                    : 'border-[#ef4444]/20 bg-[#ef4444]/10 text-[#ef4444]'}`}>
                                    {settings.smtpConfigured ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                                    {settings.smtpConfigured ? 'Configurado' : 'Pendente'}
                                </span>
                            </div>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.04] p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">Automatico</p>
                            <p className="mt-3 text-sm font-semibold text-[#ffffff]">{settings.autoSend ? 'Ativo' : 'Manual'}</p>
                            <p className="mt-1 text-xs text-[#737373]">{settings.dispatchTime}</p>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-white/[0.04] p-4">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737373]">Hoje</p>
                            <p className="mt-3 text-sm font-semibold text-[#ffffff]">{todayKey.split('-').reverse().join('/')}</p>
                            <p className="mt-1 text-xs text-[#737373]">America/Sao_Paulo</p>
                        </div>
                    </div>
                </header>

                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <MetricCard icon={MailCheck} label="PIs" value={String(groups.length)} detail="campanhas governo federal com email" />
                    <MetricCard icon={FileArchive} label="Formatos" value={String(totalFormats)} detail="criativos cadastrados no fluxo" />
                    <MetricCard icon={ImageIcon} label="Prints hoje" value={String(totalPrintsToday)} detail="evidencias disponiveis para envio diario" />
                    <MetricCard icon={RadioTower} label="Em execucao" value={String(processingCount)} detail="fila ou processamento de e-mail" tone={processingCount > 0 ? 'warning' : 'default'} />
                    <MetricCard icon={AlertTriangle} label="Erros" value={String(failedCount)} detail={`${sentCount} envio(s) concluido(s) no historico recente`} tone={failedCount > 0 ? 'error' : 'success'} />
                </section>

                <section className="scroll-reveal grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
                    <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px]">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#a3a3a3]">
                                <Users size={18} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-[#ffffff]">Destinatarios configurados</h2>
                                <p className="text-sm text-[#737373]">Lista usada nos envios manuais e automaticos de Governo Federal.</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {recipients.map(recipient => (
                                <span key={recipient} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-[#e5e5e5]">
                                    {recipient}
                                </span>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.04] p-5 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px]">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#a3a3a3]">
                                <Gauge size={18} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-[#ffffff]">Regra de envio</h2>
                                <p className="text-sm text-[#737373]">Manual direto, sem acionar captura geral.</p>
                            </div>
                        </div>
                        <div className="space-y-3 text-sm text-[#a3a3a3]">
                            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
                                <span>Envio automatico</span>
                                <span className="font-semibold text-[#ffffff]">{settings.autoSend ? 'Ativo' : 'Desligado'}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-3">
                                <span>Horario final</span>
                                <span className="font-semibold text-[#ffffff]">{settings.dispatchTime}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <span>SMTP</span>
                                <span className={settings.smtpConfigured ? 'font-semibold text-[#22c55e]' : 'font-semibold text-[#ef4444]'}>
                                    {settings.smtpConfigured ? 'Configurado' : 'Pendente'}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-5">
                    <div className="scroll-reveal flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#737373]">Campanhas cadastradas</p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.5px] text-[#ffffff]">PIs elegiveis para e-mail</h2>
                        </div>
                        <p className="text-sm text-[#737373]">{groups.length} PI(s), {totalFormats} formato(s)</p>
                    </div>

                    {groups.length === 0 ? (
                        <div className="scroll-reveal rounded-xl border border-dashed border-white/10 bg-white/[0.025] px-6 py-16 text-center">
                            <Mail size={36} className="mx-auto mb-4 text-[#525252]" />
                            <h3 className="text-lg font-semibold text-[#ffffff]">Nenhuma campanha GOV_FEDERAL cadastrada</h3>
                            <p className="mt-2 text-sm text-[#737373]">Quando houver campanhas ativas desse segmento, elas aparecem aqui.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {groups.map((group, index) => {
                                const delayClass = ['scroll-delay-100', 'scroll-delay-200', 'scroll-delay-300', 'scroll-delay-400', 'scroll-delay-500'][Math.min(index, 4)]

                                return (
                                <article
                                    key={group.pi}
                                    className={`scroll-reveal ${delayClass} rounded-xl border border-white/8 bg-[#141414] p-5 shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-white/16 hover:shadow-[rgba(0,0,0,0.45)_0px_16px_40px_-4px]`}
                                >
                                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                                <span className="rounded-lg border border-[#7c3aed]/25 bg-[#7c3aed]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#ffffff]">
                                                    PI {group.pi}
                                                </span>
                                                <StatusBadge status={group.latestDispatch?.status} />
                                                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-[#a3a3a3]">
                                                    {scopeLabel(group.latestDispatch)}
                                                </span>
                                            </div>
                                            <h3 className="truncate text-2xl font-semibold tracking-[-0.5px] text-[#ffffff]">
                                                {group.client}
                                            </h3>
                                            <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#a3a3a3]">
                                                {group.campaignNames.join(' / ') || 'Sem nome de campanha'} - {group.agency}
                                            </p>
                                            {group.lastWorkerError && (
                                                <p className="mt-3 rounded-lg border border-[#ef4444]/20 bg-[#ef4444]/10 px-3 py-2 text-sm text-[#ef4444]">
                                                    {group.lastWorkerError}
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:max-w-[520px] xl:justify-end">
                                            {group.lastCaptureDateKey && (
                                                <Link
                                                    href={`/books/${encodeURIComponent(group.pi)}?date=${group.lastCaptureDateKey}`}
                                                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-[#e5e5e5] transition-[background,border-color,transform] duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.07]"
                                                >
                                                    <ExternalLink size={16} />
                                                    Abrir ultimo book
                                                </Link>
                                            )}
                                            <Link
                                                href={`/books/${encodeURIComponent(group.pi)}`}
                                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-[#e5e5e5] transition-[background,border-color,transform] duration-200 hover:-translate-y-px hover:border-white/25 hover:bg-white/[0.07]"
                                            >
                                                <Archive size={16} />
                                                Abrir PI
                                            </Link>
                                            {group.todayPrintCount > 0 && (
                                                <BookEmailButton pi={group.pi} reportDate={todayKey} initialStatus={group.dayDispatch?.status} />
                                            )}
                                            {group.flightEnd && (
                                                <BookEmailButton pi={group.pi} initialStatus={group.reportDispatch?.status} />
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Veiculacao</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{formatDate(group.flightStart)} - {formatDate(group.flightEnd)}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Cadencia</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{group.captureCadences.map(cadenceLabel).join(' / ')}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Horarios</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{group.scheduledTimes.join(', ') || '-'}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Prints</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{group.printCount} total / {group.todayPrintCount} hoje</p>
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Ultimo print</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{formatDateTime(group.lastCaptureAt)}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#737373]">Ultimo envio</p>
                                            <p className="mt-2 text-sm font-semibold text-[#ffffff]">{formatDateTime(group.latestDispatch?.lastSentAt || null)}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {group.formats.slice(0, 12).map(format => (
                                            <span key={format} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[#a3a3a3]">
                                                {format}
                                            </span>
                                        ))}
                                        {group.formats.length > 12 && (
                                            <span className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-[#737373]">
                                                +{group.formats.length - 12} formatos
                                            </span>
                                        )}
                                    </div>
                                </article>
                                )
                            })}
                        </div>
                    )}
                </section>

                <section className="scroll-reveal overflow-hidden rounded-xl border border-white/8 bg-[#141414] shadow-[rgba(0,0,0,0.30)_0px_8px_24px_0px]">
                    <div className="flex flex-col gap-2 border-b border-white/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#737373]">Historico recente</p>
                            <h2 className="mt-1 text-xl font-semibold text-[#ffffff]">Disparos de e-mail</h2>
                        </div>
                        <p className="text-sm text-[#737373]">{dispatches.length} registro(s)</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] border-collapse text-left">
                            <thead className="bg-white/[0.025]">
                                <tr className="border-b border-white/8 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#737373]">
                                    <th className="px-5 py-3">PI</th>
                                    <th className="px-5 py-3">Escopo</th>
                                    <th className="px-5 py-3">Status</th>
                                    <th className="px-5 py-3">Tentativas</th>
                                    <th className="px-5 py-3">Anexos</th>
                                    <th className="px-5 py-3">Atualizado</th>
                                    <th className="px-5 py-3">Erro</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/8">
                                {dispatches.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#737373]">
                                            Nenhum disparo registrado para Governo Federal.
                                        </td>
                                    </tr>
                                ) : dispatches.map(dispatch => (
                                    <tr key={dispatch.id} className="transition-colors hover:bg-white/[0.025]">
                                        <td className="px-5 py-4 text-sm font-semibold text-[#ffffff]">PI {dispatch.pi}</td>
                                        <td className="px-5 py-4 text-sm text-[#a3a3a3]">{scopeLabel(dispatch)}</td>
                                        <td className="px-5 py-4"><StatusBadge status={dispatch.status} /></td>
                                        <td className="px-5 py-4 text-sm text-[#a3a3a3]">{dispatch.attempts}</td>
                                        <td className="px-5 py-4 text-sm text-[#a3a3a3]">
                                            {dispatch.attachmentCount} print(s)
                                            <span className="ml-2 text-[#737373]">{formatBytes(dispatch.attachmentBytes)}</span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-[#a3a3a3]">{formatDateTime(dispatch.updatedAt)}</td>
                                        <td className="max-w-[320px] px-5 py-4 text-sm text-[#ef4444]">
                                            <span className="block truncate" title={dispatch.errorMessage || ''}>{dispatch.errorMessage || '-'}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="scroll-reveal rounded-xl border border-white/8 bg-white/[0.04] p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#a3a3a3]">
                                <CalendarClock size={18} />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-[#ffffff]">Comportamento do envio manual</h2>
                                <p className="mt-1 max-w-3xl text-sm leading-6 text-[#a3a3a3]">
                                    O botao de book envia diretamente os anexos da PI/dia selecionado. Ele nao chama o worker de captura geral e libera retentativa quando um disparo fica travado por mais de 15 minutos.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    )
}
