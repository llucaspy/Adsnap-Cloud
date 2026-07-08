'use client'

import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Camera,
    CheckCircle2,
    Clock3,
    ImageIcon,
    Layers,
    Loader2,
    MonitorDot,
    PlusCircle,
    ServerCog,
    ShieldCheck,
    TimerReset,
    type LucideIcon,
} from 'lucide-react'
import { CaptureImage } from '@/components/CaptureImage'

type HomeStats = {
    totalCapturesToday: number
    failedToday: number
    quarantined: number
    activePis: number
    activeCampaigns: number
    totalFormats: number
    successRate: number
    queued: number
    processing: number
    failedJobs: number
}

type RecentCapture = {
    id: string
    createdAt: string
    isAssembly: boolean
    campaign: {
        pi: string
        client: string
        format: string
        formatLabel: string
        device: string
        campaignName: string
    } | null
}

type RecentLog = {
    id: string
    level: string
    message: string
    createdAt: string
}

type ActivePrintCampaign = {
    id: string
    pi: string
    client: string
    campaignName: string
    status: string
    formatCount: number
    formatSummary: string
    deviceSummary: string
}

const C = {
    canvas: '#0f0f0f',
    surface: '#141414',
    surfaceSoft: '#1a1a1a',
    glass: 'rgba(255,255,255,0.04)',
    glassStrong: 'rgba(255,255,255,0.08)',
    hairline: 'rgba(255,255,255,0.08)',
    hairlineStrong: 'rgba(255,255,255,0.16)',
    inkDeep: '#ffffff',
    ink: '#e5e5e5',
    charcoal: '#a3a3a3',
    slate: '#737373',
    muted: '#525252',
    accent: '#e5e5e5',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
}

const GRID = {
    hero: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
    kpis: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    panels: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
    captures: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
}

const ease = [0.16, 1, 0.3, 1] as const

const container: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.08 },
    },
}

const item: Variants = {
    hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
    show: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.7, ease },
    },
}

function formatClock(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(value))
}

function levelColor(level: string) {
    if (level.includes('ERROR') || level.includes('FAIL')) return C.error
    if (level.includes('SUCCESS') || level.includes('REVIEW')) return C.success
    if (level.includes('WARN') || level.includes('PENDING')) return C.warning
    return C.ink
}

function printStatusMeta(status: string) {
    if (status === 'PROCESSING') return { label: 'Capturando', tone: C.success }
    if (status.includes('QUEUED')) return { label: 'Na fila', tone: C.warning }
    if (status === 'AUTOCONFIG') return { label: 'Preparando', tone: C.ink }
    if (['ACTIVE', 'SUCCESS', 'PENDING'].includes(status)) return { label: 'Ativa', tone: C.success }
    return { label: status, tone: C.slate }
}

function getGreetingLabel(isoDate: string) {
    const hourPart = new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        hour12: false,
        timeZone: 'America/Sao_Paulo',
    }).formatToParts(new Date(isoDate)).find(part => part.type === 'hour')
    const hour = Number(hourPart?.value ?? new Date(isoDate).getHours())

    if (hour < 12) return 'Bom dia'
    if (hour < 18) return 'Boa tarde'
    return 'Boa noite'
}

function getFirstName(name?: string | null) {
    const cleanName = name?.trim()
    if (!cleanName) return 'time'
    return cleanName.split(/\s+/)[0]
}

export function HomeView({
    generatedAt,
    stats,
    recentCaptures,
    recentLogs,
    activePrintTotal,
    activePrintCampaigns,
    currentUserName,
}: {
    generatedAt: string
    stats: HomeStats
    recentCaptures: RecentCapture[]
    recentLogs: RecentLog[]
    activePrintTotal: number
    activePrintCampaigns: ActivePrintCampaign[]
    currentUserName?: string | null
}) {
    const hasAttention = stats.failedToday > 0 || stats.quarantined > 0 || stats.failedJobs > 0
    const operationTone = hasAttention ? C.warning : C.success
    const greetingLabel = getGreetingLabel(generatedAt)
    const displayName = getFirstName(currentUserName)

    const kpis = [
        { label: 'Capturas hoje', value: stats.totalCapturesToday, hint: `${stats.failedToday} falhas hoje`, icon: Camera, tone: C.ink },
        { label: 'Taxa de sucesso', value: `${stats.successRate}%`, hint: 'janela do dia', icon: ShieldCheck, tone: stats.successRate >= 95 ? C.success : C.warning },
        { label: 'PIs cadastrados', value: stats.activePis, hint: `${stats.activeCampaigns} campanhas cadastradas`, icon: MonitorDot, tone: C.ink },
        { label: 'Formatos por campanhas', value: stats.totalFormats, hint: 'cadastros de formatos', icon: Layers, tone: C.ink },
    ]

    const queueSignals = [
        { label: 'Em fila', value: stats.queued, hint: 'aguardando worker', icon: Clock3, tone: C.warning },
        { label: 'Em execucao', value: stats.processing, hint: 'processando agora', icon: Loader2, tone: C.ink },
        { label: 'Quarentena', value: stats.quarantined, hint: 'precisam revisao', icon: AlertTriangle, tone: stats.quarantined > 0 ? C.error : C.slate },
        { label: 'Jobs com erro', value: stats.failedJobs, hint: 'estado do worker', icon: TimerReset, tone: stats.failedJobs > 0 ? C.error : C.slate },
    ]

    return (
        <main style={{ minHeight: '100vh', background: C.canvas, color: C.ink, overflowX: 'hidden' }}>
            <motion.section
                variants={container}
                initial="hidden"
                animate="show"
                style={{
                    width: '100%',
                    maxWidth: 1280,
                    margin: '0 auto',
                    padding: '56px 32px 28px',
                }}
            >
                <motion.div variants={item} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: C.charcoal, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: operationTone, boxShadow: `0 0 0 4px ${operationTone}22` }} />
                        Home
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: C.slate, fontSize: 12, fontWeight: 600 }}>
                        <Clock3 size={14} />
                        Atualizado {formatClock(generatedAt)}
                    </div>
                </motion.div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: GRID.hero,
                        gap: 20,
                        alignItems: 'stretch',
                    }}
                >
                    <motion.div variants={item} style={{ minHeight: 360, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 32 }}>
                        <div>
                            <div style={{ color: C.charcoal, fontSize: 15, lineHeight: 1.5, fontWeight: 600, marginBottom: 16 }}>
                                <span style={{ color: C.ink }}>{greetingLabel}, {displayName}.</span>
                            </div>
                            <h1 style={{ margin: 0, maxWidth: 760, color: C.inkDeep, fontFamily: 'var(--font-display)', fontSize: 'clamp(40px, 6vw, 76px)', lineHeight: 1.04, fontWeight: 700, letterSpacing: '-1px' }}>
                                Controle de capturas, fila e evidencias.
                            </h1>
                        </div>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <ActionLink href="/monitoring" label="Monitoramento" icon={Activity} primary />
                            <ActionLink href="/workers" label="Workers" icon={ServerCog} />
                            <ActionLink href="/campaigns" label="Novo setup" icon={PlusCircle} />
                        </div>
                    </motion.div>

                    <motion.aside
                        variants={item}
                        whileHover={{ y: -4 }}
                        transition={{ duration: 0.25, ease }}
                        style={{
                            background: C.glass,
                            border: `1px solid ${C.hairline}`,
                            borderRadius: 12,
                            padding: 24,
                            boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                            backdropFilter: 'blur(16px)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
                            <div>
                                <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Hoje</p>
                                <h2 style={{ margin: '6px 0 0', color: C.inkDeep, fontSize: 26, fontWeight: 700, letterSpacing: '-0.4px' }}>Pulso do Nexus</h2>
                            </div>
                            <CheckCircle2 size={22} color={operationTone} />
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                            <PulseRow label="Sucesso" value={`${stats.successRate}%`} tone={stats.successRate >= 95 ? C.success : C.warning} />
                            <PulseRow label="Fila" value={stats.queued} tone={stats.queued > 0 ? C.warning : C.slate} />
                            <PulseRow label="Processando" value={stats.processing} tone={stats.processing > 0 ? C.ink : C.slate} />
                            <PulseRow label="Quarentena" value={stats.quarantined} tone={stats.quarantined > 0 ? C.error : C.slate} />
                        </div>

                        <div style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.hairline}` }}>
                            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                                <div>
                                    <p style={{ margin: 0, color: C.slate, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Prints atuais</p>
                                    <strong style={{ display: 'block', marginTop: 5, color: C.inkDeep, fontSize: 15, fontWeight: 800 }}>Campanhas ativas</strong>
                                </div>
                                <span style={{ color: C.inkDeep, fontSize: 20, fontWeight: 800 }}>{activePrintTotal}</span>
                            </div>

                            <div style={{ display: 'grid', gap: 0, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                                {activePrintCampaigns.length === 0 && (
                                    <div style={{ minHeight: 54, display: 'flex', alignItems: 'center', color: C.slate, fontSize: 12, fontWeight: 700, borderTop: `1px solid ${C.hairline}` }}>
                                        Nenhuma campanha ativa para print agora
                                    </div>
                                )}
                                {activePrintCampaigns.map(campaign => (
                                    <ActivePrintRow key={campaign.id} campaign={campaign} />
                                ))}
                            </div>
                            {activePrintTotal > activePrintCampaigns.length && (
                                <p style={{ margin: '10px 0 0', color: C.slate, fontSize: 10, fontWeight: 700 }}>
                                    Exibindo {activePrintCampaigns.length} de {activePrintTotal}
                                </p>
                            )}
                        </div>
                    </motion.aside>
                </div>
            </motion.section>

            <RevealSection>
                <div style={{ display: 'grid', gridTemplateColumns: GRID.kpis, gap: 14 }}>
                    {kpis.map((kpi, index) => (
                        <KpiCard key={kpi.label} {...kpi} index={index} />
                    ))}
                </div>
            </RevealSection>

            <RevealSection>
                <div style={{ display: 'grid', gridTemplateColumns: GRID.panels, gap: 20, alignItems: 'start' }}>
                    <SignalPanel title="Fila e risco" subtitle="Leitura rapida do ciclo atual">
                        <div style={{ display: 'grid', gap: 10 }}>
                            {queueSignals.map(signal => (
                                <SignalRow key={signal.label} {...signal} />
                            ))}
                        </div>
                    </SignalPanel>

                    <SignalPanel title="Eventos recentes" subtitle="Ultimos sinais do Nexus">
                        <div style={{ display: 'grid', gap: 0 }}>
                            {recentLogs.length === 0 && (
                                <EmptyState label="Sem eventos recentes" />
                            )}
                            {recentLogs.map((log, index) => (
                                <LogRow key={log.id} log={log} isFirst={index === 0} />
                            ))}
                        </div>
                    </SignalPanel>
                </div>
            </RevealSection>

            <RevealSection bottom>
                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div>
                        <p style={{ margin: '0 0 8px', color: C.slate, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Evidencias recentes</p>
                        <h2 style={{ margin: 0, color: C.inkDeep, fontSize: 32, lineHeight: 1.15, fontWeight: 700, letterSpacing: '-0.5px' }}>
                            O que acabou de ser capturado.
                        </h2>
                    </div>
                    <Link href="/books" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 14px', borderRadius: 8, color: C.ink, border: `1px solid ${C.hairlineStrong}`, textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                        Abrir books <ArrowRight size={14} />
                    </Link>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: GRID.captures, gap: 14 }}>
                    {recentCaptures.length === 0 && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <EmptyState label="Nenhuma captura recente encontrada" large />
                        </div>
                    )}
                    {recentCaptures.map((capture, index) => (
                        <CaptureTile key={capture.id} capture={capture} index={index} />
                    ))}
                </div>
            </RevealSection>
        </main>
    )
}

function RevealSection({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) {
    return (
        <motion.section
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.22 }}
            style={{
                width: '100%',
                maxWidth: 1280,
                margin: '0 auto',
                padding: bottom ? '28px 32px 88px' : '28px 32px',
            }}
        >
            {children}
        </motion.section>
    )
}

function ActionLink({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: LucideIcon; primary?: boolean }) {
    return (
        <motion.div variants={item} whileHover={{ y: -2 }} transition={{ duration: 0.2, ease }}>
            <Link
                href={href}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 44,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: primary ? 'none' : `1px solid ${C.hairlineStrong}`,
                    background: primary ? C.accent : 'transparent',
                    color: primary ? C.canvas : C.ink,
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: primary ? 'rgba(0,0,0,0.30) 0px 8px 24px 0px' : 'none',
                }}
            >
                <Icon size={16} />
                {label}
            </Link>
        </motion.div>
    )
}

function KpiCard({ label, value, hint, icon: Icon, tone, index }: { label: string; value: string | number; hint: string; icon: LucideIcon; tone: string; index: number }) {
    return (
        <motion.article
            variants={item}
            custom={index}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25, ease }}
            style={{
                minHeight: 148,
                padding: 20,
                background: C.glass,
                border: `1px solid ${C.hairline}`,
                borderRadius: 12,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: C.slate, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</span>
                <Icon size={18} color={tone} />
            </div>
            <div>
                <strong style={{ display: 'block', color: C.inkDeep, fontSize: 36, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.6px' }}>{value}</strong>
                <span style={{ display: 'block', marginTop: 10, color: C.charcoal, fontSize: 12, fontWeight: 600 }}>{hint}</span>
            </div>
        </motion.article>
    )
}

function PulseRow({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${C.hairline}` }}>
            <span style={{ color: C.charcoal, fontSize: 13, fontWeight: 600 }}>{label}</span>
            <strong style={{ color: tone, fontSize: 18, fontWeight: 800 }}>{value}</strong>
        </div>
    )
}

function ActivePrintRow({ campaign }: { campaign: ActivePrintCampaign }) {
    const meta = printStatusMeta(campaign.status)
    const formatCountLabel = `${campaign.formatCount} formato${campaign.formatCount === 1 ? '' : 's'}`

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', minHeight: 68, borderTop: `1px solid ${C.hairline}` }}>
            <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: meta.tone, boxShadow: `0 0 0 3px ${meta.tone}22`, flex: '0 0 auto' }} />
                    <strong style={{ color: C.ink, fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {campaign.client || campaign.campaignName}
                    </strong>
                </div>
                <span style={{ display: 'block', marginTop: 5, color: C.slate, fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    PI {campaign.pi} - {formatCountLabel} - {campaign.deviceSummary}
                </span>
                <span style={{ display: 'block', marginTop: 3, color: C.muted, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {campaign.formatSummary}
                </span>
            </div>
            <span style={{ color: meta.tone, fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {meta.label}
            </span>
        </div>
    )
}

function SignalPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
    return (
        <motion.article
            variants={item}
            style={{
                background: C.glass,
                border: `1px solid ${C.hairline}`,
                borderRadius: 12,
                padding: 20,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
            }}
        >
            <div style={{ marginBottom: 18 }}>
                <p style={{ margin: 0, color: C.slate, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{subtitle}</p>
                <h2 style={{ margin: '6px 0 0', color: C.inkDeep, fontSize: 22, fontWeight: 700 }}>{title}</h2>
            </div>
            {children}
        </motion.article>
    )
}

function SignalRow({ label, value, hint, icon: Icon, tone }: { label: string; value: number; hint: string; icon: LucideIcon; tone: string }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', alignItems: 'center', gap: 12, minHeight: 54, borderTop: `1px solid ${C.hairline}` }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.glassStrong, color: tone }}>
                <Icon size={15} />
            </span>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: C.ink, fontSize: 13, fontWeight: 700 }}>{label}</span>
                <span style={{ display: 'block', color: C.slate, fontSize: 11, fontWeight: 600 }}>{hint}</span>
            </span>
            <strong style={{ color: tone, fontSize: 20, fontWeight: 800 }}>{value}</strong>
        </div>
    )
}

function LogRow({ log, isFirst }: { log: RecentLog; isFirst: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr)', gap: 12, padding: '12px 0', borderTop: isFirst ? 'none' : `1px solid ${C.hairline}` }}>
            <span style={{ color: C.slate, fontSize: 11, fontWeight: 700 }}>{formatClock(log.createdAt)}</span>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: 'inline-flex', marginBottom: 5, color: levelColor(log.level), fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{log.level}</span>
                <span style={{ display: 'block', color: C.ink, fontSize: 12, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</span>
            </span>
        </div>
    )
}

function CaptureTile({ capture, index }: { capture: RecentCapture; index: number }) {
    return (
        <motion.article
            variants={item}
            custom={index}
            whileHover={{ y: -4 }}
            transition={{ duration: 0.25, ease }}
            style={{
                overflow: 'hidden',
                borderRadius: 12,
                border: `1px solid ${C.hairline}`,
                background: C.glass,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
            }}
        >
            <div style={{ position: 'relative', aspectRatio: capture.isAssembly ? '16 / 10' : '3 / 4', background: C.surfaceSoft }}>
                <CaptureImage
                    src={`/api/captures/${capture.id}`}
                    alt={capture.campaign?.client || 'Captura'}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            </div>
            <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: C.slate, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <ImageIcon size={12} />
                    PI {capture.campaign?.pi || '--'}
                </div>
                <h3 style={{ margin: 0, color: C.inkDeep, fontSize: 14, fontWeight: 800, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {capture.campaign?.client || 'Campanha sem nome'}
                </h3>
                <p style={{ margin: '6px 0 0', color: C.charcoal, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {capture.campaign?.formatLabel || 'Formato'} - {formatClock(capture.createdAt)}
                </p>
            </div>
        </motion.article>
    )
}

function EmptyState({ label, large = false }: { label: string; large?: boolean }) {
    return (
        <div style={{ minHeight: large ? 180 : 80, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${C.hairlineStrong}`, borderRadius: 12, color: C.slate, fontSize: 13, fontWeight: 700 }}>
            {label}
        </div>
    )
}
