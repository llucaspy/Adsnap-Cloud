'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion, type Variants } from 'framer-motion'
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    Clock3,
    FileArchive,
    FolderOpen,
    Landmark,
    Library,
    Mail,
    RefreshCw,
    Send,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    ToggleLeft,
    ToggleRight,
    type LucideIcon,
} from 'lucide-react'
import { BackToTopButton } from '@/components/BackToTopButton'
import { PIFolderCard } from '@/components/PIFolderCard'
import {
    queueGovernmentReportManual,
    updateGovernmentReportSettings,
} from '@/app/admin/government-report-actions'

type ReportDispatch = {
    id: string
    status: string
    triggerMode: string
    lastSentAt: string | null
    errorMessage: string | null
    attachmentCount: number
    attachmentBytes: number
    attempts: number
}

type FederalBookFolder = {
    pi: string
    client: string
    campaignName: string
    captureCount: number
    thumbnailId: string
}

type FederalBookDay = {
    dateKey: string
    weekDay: string
    fullDate: string
    dayNumber: string
    monthLabel: string
    sortedPiGroups: FederalBookFolder[]
}

type FederalActiveCampaign = {
    pi: string
    client: string
    agency: string
    campaignName: string
    flightStart: string | null
    flightEnd: string | null
    formats: string[]
    devices: string[]
    statuses: string[]
    printCount: number
    dispatch: ReportDispatch | null
}

export type FederalBooksWorkspaceData = {
    timeline: FederalBookDay[]
    stats: {
        prints: number
        folders: number
        pis: number
        days: number
        registeredCampaigns: number
        activeCampaigns: number
    }
    organization: {
        canManageReports: boolean
        settings: {
            recipients: string[]
            autoSend: boolean
            dispatchTime: string
        }
        activeCampaigns: FederalActiveCampaign[]
    }
}

const C = {
    canvas: '#0f0f0f',
    surface: '#141414',
    surfaceSoft: '#1a1a1a',
    glass: 'rgba(255,255,255,0.04)',
    glassStrong: 'rgba(255,255,255,0.08)',
    hairline: 'rgba(255,255,255,0.08)',
    hairlineStrong: 'rgba(255,255,255,0.16)',
    ink: '#e5e5e5',
    inkDeep: '#ffffff',
    charcoal: '#a3a3a3',
    slate: '#737373',
    muted: '#525252',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
}

const ease = [0.16, 1, 0.3, 1] as const

const container: Variants = {
    hidden: { opacity: 0, y: 12, filter: 'blur(8px)' },
    show: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.65, ease, staggerChildren: 0.07 },
    },
}

const item: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease } },
}

function formatDate(value: string | null) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value))
}

function formatBytes(value: number) {
    if (!value) return '0 MB'
    return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function daysUntil(value: string | null) {
    if (!value) return null
    const diff = new Date(value).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)))
}

function StatusBadge({ dispatch }: { dispatch: ReportDispatch | null }) {
    const status = dispatch?.status || 'NOT_SENT'
    const styles: Record<string, { label: string; icon: LucideIcon; color: string; border: string; background: string }> = {
        NOT_SENT: { label: 'Nao enviado', icon: Clock3, color: C.slate, border: C.hairline, background: C.glass },
        QUEUED_AUTO: { label: 'Na fila', icon: Clock3, color: C.warning, border: 'rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.10)' },
        QUEUED_MANUAL: { label: 'Na fila', icon: Clock3, color: C.warning, border: 'rgba(245,158,11,0.24)', background: 'rgba(245,158,11,0.10)' },
        PROCESSING: { label: 'Anexando', icon: RefreshCw, color: '#3b82f6', border: 'rgba(59,130,246,0.24)', background: 'rgba(59,130,246,0.10)' },
        SENT: { label: 'Enviado', icon: CheckCircle2, color: C.success, border: 'rgba(34,197,94,0.24)', background: 'rgba(34,197,94,0.10)' },
        FAILED: { label: 'Falhou', icon: AlertCircle, color: C.error, border: 'rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.10)' },
    }
    const config = styles[status] || styles.NOT_SENT
    const Icon = config.icon

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                minHeight: 28,
                padding: '0 10px',
                borderRadius: 999,
                color: config.color,
                border: `1px solid ${config.border}`,
                background: config.background,
                fontSize: 11,
                fontWeight: 700,
            }}
        >
            <Icon size={13} className={status === 'PROCESSING' ? 'animate-spin' : ''} />
            {config.label}
        </span>
    )
}

function MetricCard({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: string | number; hint: string }) {
    return (
        <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25, ease }}
            style={{
                background: C.glass,
                border: `1px solid ${C.hairline}`,
                borderRadius: 12,
                padding: 18,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                minHeight: 118,
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <div>
                    <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                        {label}
                    </p>
                    <strong style={{ display: 'block', marginTop: 12, color: C.inkDeep, fontSize: 34, lineHeight: 1, fontWeight: 800 }}>
                        {value}
                    </strong>
                </div>
                <div style={{ width: 38, height: 38, borderRadius: 8, border: `1px solid ${C.hairline}`, background: C.glassStrong, display: 'grid', placeItems: 'center', color: C.charcoal }}>
                    <Icon size={18} />
                </div>
            </div>
            <p style={{ margin: '14px 0 0', color: C.slate, fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>{hint}</p>
        </motion.div>
    )
}

function ViewButton({
    active,
    icon: Icon,
    children,
    onClick,
}: {
    active: boolean
    icon: LucideIcon
    children: React.ReactNode
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                height: 42,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '0 14px',
                borderRadius: 8,
                border: `1px solid ${active ? C.hairlineStrong : 'transparent'}`,
                background: active ? '#e5e5e5' : 'transparent',
                color: active ? C.canvas : C.charcoal,
                fontSize: 13,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
            }}
            onMouseEnter={event => {
                event.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={event => {
                event.currentTarget.style.transform = 'translateY(0)'
            }}
        >
            <Icon size={16} />
            {children}
        </button>
    )
}

function Feedback({ value }: { value: { type: 'success' | 'error'; message: string } }) {
    const success = value.type === 'success'
    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            style={{
                borderRadius: 12,
                border: `1px solid ${success ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.24)'}`,
                background: success ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
                color: success ? C.success : C.error,
                padding: '12px 14px',
                fontSize: 13,
                fontWeight: 700,
            }}
        >
            {value.message}
        </motion.div>
    )
}

export function FederalBooksWorkspace({ data }: { data: FederalBooksWorkspaceData }) {
    const router = useRouter()
    const [view, setView] = useState<'books' | 'organization'>('books')
    const [isPending, startTransition] = useTransition()
    const [recipientsText, setRecipientsText] = useState(data.organization.settings.recipients.join('\n'))
    const [autoSend, setAutoSend] = useState(data.organization.settings.autoSend)
    const [dispatchTime, setDispatchTime] = useState(data.organization.settings.dispatchTime)
    const [campaigns, setCampaigns] = useState(data.organization.activeCampaigns)
    const [busyPi, setBusyPi] = useState<string | null>(null)
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    useEffect(() => {
        setRecipientsText(data.organization.settings.recipients.join('\n'))
        setAutoSend(data.organization.settings.autoSend)
        setDispatchTime(data.organization.settings.dispatchTime)
        setCampaigns(data.organization.activeCampaigns)
    }, [data.organization])

    const recipients = useMemo(() => recipientsText
        .split(/[,;\n]/)
        .map(item => item.trim())
        .filter(Boolean), [recipientsText])

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message })
        window.setTimeout(() => setFeedback(null), 5000)
    }

    const saveSettings = () => {
        if (!data.organization.canManageReports) {
            showFeedback('error', 'Apenas admins podem alterar o envio automatico')
            return
        }

        startTransition(async () => {
            try {
                await updateGovernmentReportSettings({ recipients, autoSend, dispatchTime })
                showFeedback('success', 'Configuracao de envio Gov salva')
                router.refresh()
            } catch (error) {
                showFeedback('error', error instanceof Error ? error.message : 'Falha ao salvar configuracao')
            }
        })
    }

    const sendNow = (campaign: FederalActiveCampaign) => {
        if (!data.organization.canManageReports) {
            showFeedback('error', 'Apenas admins podem enviar books por e-mail')
            return
        }

        const destination = recipients.join(', ')
        if (!window.confirm(`Enviar agora o book da PI ${campaign.pi} para ${destination}?`)) return

        setBusyPi(campaign.pi)
        startTransition(async () => {
            try {
                const result = await queueGovernmentReportManual(campaign.pi)
                if (!result.success) throw new Error(result.error || 'Falha ao enviar')
                const nextStatus = 'sent' in result && result.sent ? 'SENT' : 'PROCESSING'
                setCampaigns(current => current.map(item => item.pi === campaign.pi
                    ? {
                        ...item,
                        dispatch: item.dispatch
                            ? { ...item.dispatch, status: nextStatus, errorMessage: null }
                            : {
                                id: '',
                                status: nextStatus,
                                triggerMode: 'MANUAL',
                                lastSentAt: null,
                                errorMessage: null,
                                attachmentCount: 0,
                                attachmentBytes: 0,
                                attempts: 0,
                            },
                    }
                    : item))
                showFeedback('success', result.message || 'Book enviado por e-mail')
                router.refresh()
            } catch (error) {
                showFeedback('error', error instanceof Error ? error.message : 'Falha ao enviar book')
            } finally {
                setBusyPi(null)
            }
        })
    }

    const activePrints = campaigns.reduce((sum, campaign) => sum + campaign.printCount, 0)

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            style={{ minHeight: '100vh', paddingBottom: 96 }}
        >
            <motion.header variants={item} style={{ borderBottom: `1px solid ${C.hairline}`, paddingBottom: 28, marginBottom: 28 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
                        <div>
                            <Link
                                href="/books"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    height: 36,
                                    padding: '0 12px',
                                    borderRadius: 8,
                                    border: `1px solid ${C.hairline}`,
                                    background: C.glass,
                                    color: C.charcoal,
                                    textDecoration: 'none',
                                    fontSize: 12,
                                    fontWeight: 700,
                                }}
                            >
                                <Library size={14} />
                                Books
                            </Link>
                            <p style={{ margin: '22px 0 8px', display: 'flex', alignItems: 'center', gap: 8, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                                <Landmark size={14} />
                                Governo Federal
                            </p>
                            <h1 style={{ margin: 0, color: C.inkDeep, fontFamily: 'var(--font-display)', fontSize: 'clamp(42px, 6vw, 72px)', lineHeight: 1.04, fontWeight: 800 }}>
                                Books Gov.
                            </h1>
                        </div>

                        <div
                            style={{
                                display: 'flex',
                                gap: 4,
                                padding: 4,
                                borderRadius: 12,
                                border: `1px solid ${C.hairline}`,
                                background: C.surface,
                                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                            }}
                        >
                            <ViewButton active={view === 'books'} icon={FolderOpen} onClick={() => setView('books')}>
                                Books
                            </ViewButton>
                            <ViewButton active={view === 'organization'} icon={SlidersHorizontal} onClick={() => setView('organization')}>
                                Organizacao
                            </ViewButton>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
                        <MetricCard icon={Library} label="Prints" value={data.stats.prints} hint="ultimos 60 dias" />
                        <MetricCard icon={FolderOpen} label="Pastas" value={data.stats.folders} hint="PI por dia" />
                        <MetricCard icon={Landmark} label="PIs" value={data.stats.pis} hint="books com capturas" />
                        <MetricCard icon={ShieldCheck} label="Em veiculacao" value={data.stats.activeCampaigns} hint={`${data.stats.registeredCampaigns} Gov cadastradas`} />
                    </div>
                </div>
            </motion.header>

            <AnimatePresence mode="wait">
                {view === 'books' ? (
                    <motion.div
                        key="books"
                        variants={container}
                        initial="hidden"
                        animate="show"
                        exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
                    >
                        <BooksView timeline={data.timeline} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="organization"
                        variants={container}
                        initial="hidden"
                        animate="show"
                        exit={{ opacity: 0, y: 10, transition: { duration: 0.2 } }}
                    >
                        <OrganizationView
                            campaigns={campaigns}
                            canManageReports={data.organization.canManageReports}
                            autoSend={autoSend}
                            dispatchTime={dispatchTime}
                            recipientsText={recipientsText}
                            recipientsCount={recipients.length}
                            activePrints={activePrints}
                            feedback={feedback}
                            isPending={isPending}
                            busyPi={busyPi}
                            onAutoSendChange={setAutoSend}
                            onDispatchTimeChange={setDispatchTime}
                            onRecipientsTextChange={setRecipientsText}
                            onSaveSettings={saveSettings}
                            onSendNow={sendNow}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {view === 'books' && <BackToTopButton />}
        </motion.div>
    )
}

function BooksView({ timeline }: { timeline: FederalBookDay[] }) {
    if (timeline.length === 0) {
        return (
            <motion.div variants={item} style={{ borderRadius: 12, border: `1px dashed ${C.hairline}`, background: 'rgba(255,255,255,0.015)', padding: '96px 24px', textAlign: 'center' }}>
                <Landmark size={44} style={{ margin: '0 auto 20px', color: C.muted }} />
                <h2 style={{ margin: '0 0 8px', color: C.charcoal, fontSize: 22, fontWeight: 800 }}>Nenhum print de Governo Federal</h2>
                <p style={{ margin: 0, color: C.slate, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                    Os prints GOV_FEDERAL aparecem aqui quando forem capturados.
                </p>
            </motion.div>
        )
    }

    return (
        <>
            {timeline.length > 1 && (
                <motion.nav variants={item} className="sticky top-3 z-50 mb-8 hidden md:flex">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 12, border: `1px solid ${C.hairline}`, background: 'rgba(15,15,15,0.80)', padding: '8px 12px', boxShadow: 'rgba(0,0,0,0.40) 0px 24px 64px -8px', backdropFilter: 'blur(20px) saturate(200%)' }}>
                        <span style={{ borderRight: `1px solid ${C.hairline}`, paddingRight: 12, color: C.muted, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
                            Ir para
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingLeft: 8 }}>
                            {timeline.slice(0, 12).map(day => (
                                <a
                                    key={day.fullDate}
                                    href={`#day-${day.dateKey}`}
                                    style={{ borderRadius: 8, padding: '7px 10px', color: C.slate, textDecoration: 'none', fontSize: 11, fontWeight: 800 }}
                                >
                                    {day.fullDate.split('/')[0]}/{day.fullDate.split('/')[1]}
                                </a>
                            ))}
                        </div>
                    </div>
                </motion.nav>
            )}

            <div style={{ display: 'grid', gap: 64 }}>
                {timeline.map(day => (
                    <motion.section variants={item} key={day.dateKey} id={`day-${day.dateKey}`} className="scroll-mt-24">
                        <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.hairline}`, paddingBottom: 16, gap: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                <div style={{ width: 48, textAlign: 'center' }}>
                                    <p style={{ margin: 0, color: C.ink, fontSize: 34, lineHeight: 1, fontWeight: 900 }}>{day.dayNumber}</p>
                                    <p style={{ margin: '4px 0 0', color: C.slate, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>{day.monthLabel}</p>
                                </div>

                                <div style={{ height: 40, width: 1, background: C.hairlineStrong }} />

                                <div>
                                    <h2 style={{ margin: 0, color: C.ink, fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, textTransform: 'capitalize' }}>
                                        {day.weekDay}
                                    </h2>
                                    <p style={{ margin: '4px 0 0', color: C.slate, fontFamily: 'monospace', fontSize: 11 }}>{day.fullDate}</p>
                                </div>
                            </div>

                            <span style={{ borderRadius: 999, border: `1px solid ${C.hairline}`, background: C.glass, padding: '5px 10px', color: C.slate, fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>
                                {day.sortedPiGroups.length} pasta{day.sortedPiGroups.length > 1 ? 's' : ''}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                            {day.sortedPiGroups.map(piGroup => (
                                <PIFolderCard
                                    key={`${day.dateKey}-${piGroup.pi}`}
                                    pi={piGroup.pi}
                                    client={piGroup.client}
                                    campaignName={piGroup.campaignName}
                                    captureCount={piGroup.captureCount}
                                    thumbnailId={piGroup.thumbnailId}
                                    date={day.dateKey}
                                />
                            ))}
                        </div>
                    </motion.section>
                ))}
            </div>
        </>
    )
}

type OrganizationViewProps = {
    campaigns: FederalActiveCampaign[]
    canManageReports: boolean
    autoSend: boolean
    dispatchTime: string
    recipientsText: string
    recipientsCount: number
    activePrints: number
    feedback: { type: 'success' | 'error'; message: string } | null
    isPending: boolean
    busyPi: string | null
    onAutoSendChange: (value: boolean) => void
    onDispatchTimeChange: (value: string) => void
    onRecipientsTextChange: (value: string) => void
    onSaveSettings: () => void
    onSendNow: (campaign: FederalActiveCampaign) => void
}

function OrganizationView({
    campaigns,
    canManageReports,
    autoSend,
    dispatchTime,
    recipientsText,
    recipientsCount,
    activePrints,
    feedback,
    isPending,
    busyPi,
    onAutoSendChange,
    onDispatchTimeChange,
    onRecipientsTextChange,
    onSaveSettings,
    onSendNow,
}: OrganizationViewProps) {
    return (
        <div style={{ display: 'grid', gap: 20 }}>
            <AnimatePresence>{feedback && <Feedback value={feedback} />}</AnimatePresence>

            <motion.section variants={item} style={{ alignItems: 'stretch' }} className="grid gap-5 min-[981px]:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div style={{ borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.glass, boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px', padding: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, marginBottom: 24 }}>
                        <div>
                            <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Envio automatico</p>
                            <h2 style={{ margin: '8px 0 0', color: C.inkDeep, fontSize: 28, lineHeight: 1.2, fontWeight: 800 }}>Books por e-mail</h2>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${autoSend ? 'rgba(34,197,94,0.24)' : C.hairline}`, background: autoSend ? 'rgba(34,197,94,0.10)' : C.glassStrong, color: autoSend ? C.success : C.charcoal, display: 'grid', placeItems: 'center' }}>
                            {autoSend ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </div>
                    </div>

                    <div className="grid gap-4 min-[761px]:grid-cols-[minmax(0,1fr)_180px]">
                        <label style={{ display: 'grid', gap: 8 }}>
                            <span style={{ color: C.charcoal, fontSize: 12, fontWeight: 800 }}>Destinatarios</span>
                            <textarea
                                rows={4}
                                value={recipientsText}
                                disabled={!canManageReports}
                                onChange={event => onRecipientsTextChange(event.target.value)}
                                style={{
                                    width: '100%',
                                    resize: 'vertical',
                                    minHeight: 112,
                                    borderRadius: 8,
                                    border: `1px solid ${C.hairlineStrong}`,
                                    background: C.surface,
                                    color: C.ink,
                                    padding: '12px 14px',
                                    fontFamily: 'monospace',
                                    fontSize: 13,
                                    outline: 'none',
                                    opacity: canManageReports ? 1 : 0.55,
                                }}
                            />
                        </label>

                        <div style={{ display: 'grid', gap: 12, alignContent: 'end' }}>
                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: C.charcoal, fontSize: 12, fontWeight: 800 }}>Horario</span>
                                <input
                                    type="time"
                                    value={dispatchTime}
                                    disabled={!canManageReports}
                                    onChange={event => onDispatchTimeChange(event.target.value)}
                                    style={{
                                        height: 44,
                                        borderRadius: 8,
                                        border: `1px solid ${C.hairlineStrong}`,
                                        background: C.surface,
                                        color: C.ink,
                                        padding: '0 12px',
                                        fontSize: 14,
                                        fontWeight: 700,
                                        outline: 'none',
                                        opacity: canManageReports ? 1 : 0.55,
                                    }}
                                />
                            </label>

                            <label
                                style={{
                                    height: 44,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    borderRadius: 8,
                                    border: `1px solid ${C.hairline}`,
                                    background: C.surface,
                                    padding: '0 12px',
                                    cursor: canManageReports ? 'pointer' : 'not-allowed',
                                    opacity: canManageReports ? 1 : 0.55,
                                }}
                            >
                                <span style={{ color: C.ink, fontSize: 13, fontWeight: 800 }}>Ativo</span>
                                <input
                                    type="checkbox"
                                    checked={autoSend}
                                    disabled={!canManageReports}
                                    onChange={event => onAutoSendChange(event.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: '#e5e5e5' }}
                                />
                            </label>

                            <button
                                type="button"
                                onClick={onSaveSettings}
                                disabled={isPending || !canManageReports}
                                style={{
                                    height: 44,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    borderRadius: 8,
                                    border: '1px solid #e5e5e5',
                                    background: '#e5e5e5',
                                    color: C.canvas,
                                    fontSize: 13,
                                    fontWeight: 800,
                                    cursor: isPending || !canManageReports ? 'not-allowed' : 'pointer',
                                    opacity: isPending || !canManageReports ? 0.5 : 1,
                                }}
                            >
                                {isPending ? <RefreshCw size={15} className="animate-spin" /> : <Settings2 size={15} />}
                                Salvar
                            </button>
                        </div>
                    </div>

                    {!canManageReports && (
                        <p style={{ margin: '14px 0 0', color: C.warning, fontSize: 12, fontWeight: 700 }}>
                            Login admin necessario para alterar automacao de e-mail.
                        </p>
                    )}
                </div>

                <div style={{ display: 'grid', gap: 12 }}>
                    <InfoTile icon={Mail} label="Automacao" value={autoSend ? 'Ligada' : 'Desligada'} hint={`${recipientsCount} destinatario(s) as ${dispatchTime}`} tone={autoSend ? C.success : C.slate} />
                    <InfoTile icon={Landmark} label="Campanhas ativas" value={campaigns.length} hint="PIs Gov em veiculacao agora" tone={C.ink} />
                    <InfoTile icon={FileArchive} label="Prints disponiveis" value={activePrints} hint="capturas nos PIs ativos" tone={C.ink} />
                </div>
            </motion.section>

            <motion.section variants={item} style={{ borderRadius: 12, border: `1px solid ${C.hairline}`, background: C.surface, overflow: 'hidden', boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px' }}>
                <div style={{ padding: '20px 22px', borderBottom: `1px solid ${C.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                        <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Organizacao</p>
                        <h2 style={{ margin: '6px 0 0', color: C.inkDeep, fontSize: 24, lineHeight: 1.25, fontWeight: 800 }}>Campanhas Gov em veiculacao</h2>
                    </div>
                    <span style={{ borderRadius: 999, border: `1px solid ${C.hairline}`, background: C.glass, padding: '6px 10px', color: C.charcoal, fontSize: 12, fontWeight: 800 }}>
                        {campaigns.length} ativa{campaigns.length === 1 ? '' : 's'}
                    </span>
                </div>

                {campaigns.length === 0 ? (
                    <div style={{ padding: '72px 24px', textAlign: 'center' }}>
                        <Calendar size={42} style={{ color: C.muted, margin: '0 auto 16px' }} />
                        <h3 style={{ margin: '0 0 8px', color: C.charcoal, fontSize: 20, fontWeight: 800 }}>Nenhuma campanha Gov ativa agora</h3>
                        <p style={{ margin: 0, color: C.slate, fontSize: 13, fontWeight: 600 }}>Quando a data de veiculacao estiver vigente, ela aparece nesta lista.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 0 }}>
                        {campaigns.map(campaign => (
                            <CampaignRow
                                key={campaign.pi}
                                campaign={campaign}
                                canManageReports={canManageReports}
                                busy={busyPi === campaign.pi}
                                pending={isPending}
                                onSendNow={onSendNow}
                            />
                        ))}
                    </div>
                )}
            </motion.section>
        </div>
    )
}

function InfoTile({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string | number; hint: string; tone: string }) {
    return (
        <motion.div
            variants={item}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25, ease }}
            style={{
                borderRadius: 12,
                border: `1px solid ${C.hairline}`,
                background: C.glass,
                padding: 18,
                minHeight: 112,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
                <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{label}</p>
                <Icon size={17} style={{ color: tone }} />
            </div>
            <strong style={{ display: 'block', marginTop: 12, color: tone, fontSize: 28, lineHeight: 1, fontWeight: 900 }}>{value}</strong>
            <p style={{ margin: '10px 0 0', color: C.slate, fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>{hint}</p>
        </motion.div>
    )
}

function CampaignRow({
    campaign,
    canManageReports,
    busy,
    pending,
    onSendNow,
}: {
    campaign: FederalActiveCampaign
    canManageReports: boolean
    busy: boolean
    pending: boolean
    onSendNow: (campaign: FederalActiveCampaign) => void
}) {
    const processing = ['PROCESSING', 'QUEUED_AUTO', 'QUEUED_MANUAL'].includes(campaign.dispatch?.status || '')
    const daysLeft = daysUntil(campaign.flightEnd)

    return (
        <div style={{ alignItems: 'center', padding: '18px 22px', borderTop: `1px solid ${C.hairline}` }} className="grid gap-[18px] min-[1081px]:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.8fr)_minmax(170px,0.6fr)_auto]">
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, color: C.inkDeep, fontSize: 16, lineHeight: 1.35, fontWeight: 800 }}>{campaign.client}</h3>
                    <span style={{ borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.glass, padding: '4px 7px', color: C.charcoal, fontSize: 10, fontWeight: 900 }}>
                        PI {campaign.pi}
                    </span>
                </div>
                <p style={{ margin: '6px 0 0', color: C.charcoal, fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>
                    {campaign.campaignName || 'Campanha sem nome'}{campaign.agency ? ` - ${campaign.agency}` : ''}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                    {campaign.formats.slice(0, 4).map(format => (
                        <span key={format} style={{ borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.glass, padding: '5px 7px', color: C.slate, fontSize: 11, fontWeight: 800 }}>
                            {format}
                        </span>
                    ))}
                    {campaign.formats.length > 4 && (
                        <span style={{ borderRadius: 6, border: `1px solid ${C.hairline}`, background: C.glass, padding: '5px 7px', color: C.slate, fontSize: 11, fontWeight: 800 }}>
                            +{campaign.formats.length - 4}
                        </span>
                    )}
                </div>
            </div>

            <div>
                <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Veiculacao</p>
                <p style={{ margin: '7px 0 0', color: C.ink, fontSize: 13, fontWeight: 800 }}>
                    {formatDate(campaign.flightStart)} a {formatDate(campaign.flightEnd)}
                </p>
                <p style={{ margin: '5px 0 0', color: C.slate, fontSize: 12, fontWeight: 600 }}>
                    {daysLeft === null ? 'Sem data final' : `${daysLeft} dia(s) restantes`}
                </p>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
                <StatusBadge dispatch={campaign.dispatch} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.charcoal, fontSize: 12, fontWeight: 700 }}>
                    <FileArchive size={14} />
                    {campaign.printCount} print(s)
                    {campaign.dispatch && campaign.dispatch.attachmentBytes > 0 ? ` - ${formatBytes(campaign.dispatch.attachmentBytes)}` : ''}
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                <Link
                    href={`/books/${encodeURIComponent(campaign.pi)}`}
                    style={{
                        height: 38,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: `1px solid ${C.hairlineStrong}`,
                        color: C.ink,
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 800,
                    }}
                >
                    <Library size={14} />
                    Book
                </Link>
                <button
                    type="button"
                    onClick={() => onSendNow(campaign)}
                    disabled={!canManageReports || campaign.printCount === 0 || processing || busy || pending}
                    style={{
                        height: 38,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 7,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: `1px solid ${C.hairlineStrong}`,
                        background: C.glass,
                        color: C.ink,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: !canManageReports || campaign.printCount === 0 || processing || busy || pending ? 'not-allowed' : 'pointer',
                        opacity: !canManageReports || campaign.printCount === 0 || processing || busy || pending ? 0.45 : 1,
                    }}
                >
                    {busy ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    Enviar
                </button>
            </div>
        </div>
    )
}
