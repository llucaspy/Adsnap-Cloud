'use client'

import Link from 'next/link'
import { motion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Camera,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Filter,
    ImageIcon,
    Layers,
    Loader2,
    MonitorDot,
    PlusCircle,
    RefreshCw,
    Search,
    ServerCog,
    ShieldCheck,
    Sparkles,
    TimerReset,
    TrendingUp,
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
    format: string
    device: string
    status: string
}

const C = {
    canvas: '#f8fafd',
    canvasAlt: '#f1f3f4',
    surface: '#ffffff',
    surfaceTint: '#f8fafd',
    border: '#dadce0',
    borderSoft: '#e8eaed',
    text: '#202124',
    textSoft: '#3c4043',
    muted: '#5f6368',
    faint: '#80868b',
    blue: '#1a73e8',
    blueHover: '#1558b0',
    blueSoft: '#e8f0fe',
    green: '#188038',
    greenSoft: '#e6f4ea',
    amber: '#f9ab00',
    amberSoft: '#fef7e0',
    red: '#d93025',
    redSoft: '#fce8e6',
    shadow: 'rgba(60,64,67,0.16) 0px 1px 3px 0px, rgba(60,64,67,0.08) 0px 4px 12px 0px',
    shadowHover: 'rgba(60,64,67,0.18) 0px 8px 24px -8px, rgba(60,64,67,0.12) 0px 4px 12px 0px',
}

const GRID = {
    hero: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
    kpis: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
    panels: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
    captures: 'repeat(auto-fit, minmax(min(100%, 232px), 1fr))',
}

const ease = [0.16, 1, 0.3, 1] as const

const container: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.075, delayChildren: 0.05 },
    },
}

const item: Variants = {
    hidden: { opacity: 0, y: 18, filter: 'blur(8px)' },
    show: {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        transition: { duration: 0.56, ease },
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
    if (level.includes('ERROR') || level.includes('FAIL')) return C.red
    if (level.includes('SUCCESS') || level.includes('REVIEW')) return C.green
    if (level.includes('WARN') || level.includes('PENDING')) return C.amber
    return C.blue
}

function levelBackground(level: string) {
    if (level.includes('ERROR') || level.includes('FAIL')) return C.redSoft
    if (level.includes('SUCCESS') || level.includes('REVIEW')) return C.greenSoft
    if (level.includes('WARN') || level.includes('PENDING')) return C.amberSoft
    return C.blueSoft
}

function printStatusMeta(status: string) {
    if (status === 'PROCESSING') return { label: 'Capturando', tone: C.green, bg: C.greenSoft }
    if (status === 'QUEUED') return { label: 'Na fila', tone: C.amber, bg: C.amberSoft }
    if (status === 'AUTOCONFIG') return { label: 'Preparando', tone: C.blue, bg: C.blueSoft }
    return { label: status, tone: C.muted, bg: C.canvasAlt }
}

export function HomeView({
    generatedAt,
    stats,
    recentCaptures,
    recentLogs,
    activePrintTotal,
    activePrintCampaigns,
}: {
    generatedAt: string
    stats: HomeStats
    recentCaptures: RecentCapture[]
    recentLogs: RecentLog[]
    activePrintTotal: number
    activePrintCampaigns: ActivePrintCampaign[]
}) {
    const hasAttention = stats.failedToday > 0 || stats.quarantined > 0 || stats.failedJobs > 0
    const operationLabel = hasAttention ? 'Atencao operacional' : 'Operacao estavel'
    const operationTone = hasAttention ? C.amber : C.green

    const kpis = [
        {
            label: 'Capturas hoje',
            value: stats.totalCapturesToday,
            hint: `${stats.failedToday} falhas hoje`,
            icon: Camera,
            tone: C.blue,
            bg: C.blueSoft,
        },
        {
            label: 'Taxa de sucesso',
            value: `${stats.successRate}%`,
            hint: 'janela do dia',
            icon: ShieldCheck,
            tone: stats.successRate >= 95 ? C.green : C.amber,
            bg: stats.successRate >= 95 ? C.greenSoft : C.amberSoft,
        },
        {
            label: 'PIs cadastrados',
            value: stats.activePis,
            hint: `${stats.activeCampaigns} campanhas cadastradas`,
            icon: MonitorDot,
            tone: C.textSoft,
            bg: C.canvasAlt,
        },
        {
            label: 'Formatos por campanhas',
            value: stats.totalFormats,
            hint: 'cadastros de formatos',
            icon: Layers,
            tone: C.textSoft,
            bg: C.canvasAlt,
        },
    ]

    const queueSignals = [
        { label: 'Em fila', value: stats.queued, hint: 'aguardando worker', icon: Clock3, tone: C.amber, bg: C.amberSoft },
        { label: 'Em execucao', value: stats.processing, hint: 'processando agora', icon: Loader2, tone: C.blue, bg: C.blueSoft },
        { label: 'Quarentena', value: stats.quarantined, hint: 'precisam revisao', icon: AlertTriangle, tone: stats.quarantined > 0 ? C.red : C.muted, bg: stats.quarantined > 0 ? C.redSoft : C.canvasAlt },
        { label: 'Jobs com erro', value: stats.failedJobs, hint: 'estado do worker', icon: TimerReset, tone: stats.failedJobs > 0 ? C.red : C.muted, bg: stats.failedJobs > 0 ? C.redSoft : C.canvasAlt },
    ]

    return (
        <main className="gam-home-shell" style={{ minHeight: '100vh', background: C.canvas, color: C.text, overflowX: 'hidden' }}>
            <style>{`
                .gam-home-shell {
                    margin: -16px;
                    width: calc(100% + 32px);
                }

                .gam-home-inner {
                    width: 100%;
                    max-width: 1360px;
                    margin: 0 auto;
                    padding: 72px 16px 72px;
                }

                @media (min-width: 768px) {
                    .gam-home-shell {
                        margin: -48px;
                        width: calc(100% + 96px);
                    }

                    .gam-home-inner {
                        padding: 32px 48px 96px;
                    }
                }
            `}</style>
            <motion.div
                className="gam-home-inner"
                variants={container}
                initial="hidden"
                animate="show"
            >
                <TopWorkspaceBar generatedAt={generatedAt} operationLabel={operationLabel} operationTone={operationTone} />

                <section style={{ display: 'grid', gridTemplateColumns: GRID.hero, gap: 20, alignItems: 'stretch', marginTop: 20 }}>
                    <motion.div variants={item}>
                        <CommandCenter stats={stats} operationLabel={operationLabel} operationTone={operationTone} />
                    </motion.div>

                    <motion.aside variants={item}>
                        <PulseCard
                            stats={stats}
                            activePrintTotal={activePrintTotal}
                            activePrintCampaigns={activePrintCampaigns}
                            operationTone={operationTone}
                        />
                    </motion.aside>
                </section>

                <motion.section variants={container} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.18 }} style={{ marginTop: 20 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: GRID.kpis, gap: 12 }}>
                        {kpis.map((kpi, index) => (
                            <KpiCard key={kpi.label} {...kpi} index={index} />
                        ))}
                    </div>
                </motion.section>

                <RevealSection>
                    <div style={{ display: 'grid', gridTemplateColumns: GRID.panels, gap: 20, alignItems: 'start' }}>
                        <DeliveryPanel signals={queueSignals} />
                        <EventsPanel recentLogs={recentLogs} />
                    </div>
                </RevealSection>

                <RevealSection bottom>
                    <CapturePanel recentCaptures={recentCaptures} />
                </RevealSection>
            </motion.div>
        </main>
    )
}

function TopWorkspaceBar({ generatedAt, operationLabel, operationTone }: { generatedAt: string; operationLabel: string; operationTone: string }) {
    return (
        <motion.header
            variants={item}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                minHeight: 52,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: C.blueSoft, color: C.blue, border: `1px solid ${C.borderSoft}` }}>
                    <BarChart3 size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 12, fontWeight: 600 }}>
                        <span>Home</span>
                        <ChevronRight size={14} />
                        <span>Delivery workspace</span>
                    </div>
                    <strong style={{ display: 'block', marginTop: 2, color: C.text, fontSize: 18, fontWeight: 700, letterSpacing: '-0.2px' }}>
                        Adsnap Cloud
                    </strong>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <ToolbarPill icon={Search} label="Buscar campanha" />
                <ToolbarPill icon={Filter} label="Hoje" />
                <ToolbarPill icon={RefreshCw} label={`Atualizado ${formatClock(generatedAt)}`} />
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: C.surface, color: operationTone, fontSize: 12, fontWeight: 700 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: operationTone }} />
                    {operationLabel}
                </span>
            </div>
        </motion.header>
    )
}

function ToolbarPill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${C.borderSoft}`, background: C.surface, color: C.muted, fontSize: 12, fontWeight: 700 }}>
            <Icon size={14} />
            {label}
        </span>
    )
}

function CommandCenter({ stats, operationLabel, operationTone }: { stats: HomeStats; operationLabel: string; operationTone: string }) {
    const flow = [
        { label: 'Fila', value: stats.queued, tone: C.amber },
        { label: 'Worker', value: stats.processing, tone: C.blue },
        { label: 'Sucesso', value: `${stats.successRate}%`, tone: C.green },
        { label: 'Risco', value: stats.quarantined + stats.failedJobs, tone: stats.quarantined + stats.failedJobs > 0 ? C.red : C.muted },
    ]

    return (
        <motion.article
            whileHover={{ y: -2 }}
            transition={{ duration: 0.22, ease }}
            style={{
                minHeight: 324,
                height: '100%',
                background: C.surface,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                boxShadow: C.shadow,
                overflow: 'hidden',
                display: 'grid',
                gridTemplateRows: 'auto 1fr auto',
            }}
        >
            <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 18px', borderBottom: `1px solid ${C.borderSoft}`, background: C.surfaceTint }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <Sparkles size={14} color={C.blue} />
                    Workspace
                </span>
                <span style={{ color: operationTone, fontSize: 12, fontWeight: 800 }}>{operationLabel}</span>
            </div>

            <div style={{ padding: 24 }}>
                <h1 style={{ margin: 0, maxWidth: 720, color: C.text, fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4.2vw, 52px)', lineHeight: 1.08, fontWeight: 700, letterSpacing: '-1px' }}>
                    Controle de capturas, fila e evidencias.
                </h1>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
                    <ActionLink href="/monitoring" label="Monitoramento" icon={Activity} primary />
                    <ActionLink href="/workers" label="Workers" icon={ServerCog} />
                    <ActionLink href="/campaigns" label="Novo setup" icon={PlusCircle} />
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', borderTop: `1px solid ${C.borderSoft}` }}>
                {flow.map((point, index) => (
                    <div key={point.label} style={{ padding: '16px 18px', borderLeft: index === 0 ? 'none' : `1px solid ${C.borderSoft}`, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            <span style={{ width: 8, height: 8, borderRadius: 999, background: point.tone }} />
                            {point.label}
                        </span>
                        <strong style={{ display: 'block', marginTop: 8, color: C.text, fontSize: 24, lineHeight: 1, fontWeight: 800 }}>{point.value}</strong>
                    </div>
                ))}
            </div>
        </motion.article>
    )
}

function ActionLink({ href, label, icon: Icon, primary = false }: { href: string; label: string; icon: LucideIcon; primary?: boolean }) {
    return (
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.99 }} transition={{ duration: 0.18, ease }}>
            <Link
                href={href}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 40,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: primary ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
                    background: primary ? C.blue : C.surface,
                    color: primary ? '#ffffff' : C.textSoft,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: 800,
                    boxShadow: primary ? 'rgba(26,115,232,0.20) 0px 6px 16px -6px' : 'none',
                }}
            >
                <Icon size={15} />
                {label}
            </Link>
        </motion.div>
    )
}

function PulseCard({
    stats,
    activePrintTotal,
    activePrintCampaigns,
    operationTone,
}: {
    stats: HomeStats
    activePrintTotal: number
    activePrintCampaigns: ActivePrintCampaign[]
    operationTone: string
}) {
    return (
        <motion.article
            whileHover={{ y: -2 }}
            transition={{ duration: 0.22, ease }}
            style={{
                height: '100%',
                minHeight: 324,
                background: C.surface,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                boxShadow: C.shadow,
                overflow: 'hidden',
            }}
        >
            <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 18px', borderBottom: `1px solid ${C.borderSoft}`, background: C.surfaceTint }}>
                <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pulso do Nexus</span>
                <CheckCircle2 size={18} color={operationTone} />
            </div>

            <div style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginBottom: 18 }}>
                    <MiniMetric label="Sucesso" value={`${stats.successRate}%`} tone={stats.successRate >= 95 ? C.green : C.amber} />
                    <MiniMetric label="Capturando" value={stats.processing} tone={stats.processing > 0 ? C.blue : C.muted} />
                    <MiniMetric label="Em fila" value={stats.queued} tone={stats.queued > 0 ? C.amber : C.muted} />
                    <MiniMetric label="Quarentena" value={stats.quarantined} tone={stats.quarantined > 0 ? C.red : C.muted} />
                </div>

                <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 12, paddingTop: 16, borderTop: `1px solid ${C.borderSoft}`, marginBottom: 10 }}>
                    <div>
                        <p style={{ margin: 0, color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Prints atuais</p>
                        <strong style={{ display: 'block', marginTop: 4, color: C.text, fontSize: 16, fontWeight: 800 }}>Campanhas ativas</strong>
                    </div>
                    <span style={{ color: C.text, fontSize: 26, lineHeight: 1, fontWeight: 800 }}>{activePrintTotal}</span>
                </div>

                <div style={{ display: 'grid', gap: 0, maxHeight: 210, overflowY: 'auto', paddingRight: 2 }}>
                    {activePrintCampaigns.length === 0 && (
                        <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', color: C.muted, fontSize: 12, fontWeight: 700, borderTop: `1px solid ${C.borderSoft}` }}>
                            Nenhuma campanha em captura agora
                        </div>
                    )}
                    {activePrintCampaigns.map(campaign => (
                        <ActivePrintRow key={campaign.id} campaign={campaign} />
                    ))}
                </div>
                {activePrintTotal > activePrintCampaigns.length && (
                    <p style={{ margin: '10px 0 0', color: C.faint, fontSize: 10, fontWeight: 700 }}>
                        Exibindo {activePrintCampaigns.length} de {activePrintTotal}
                    </p>
                )}
            </div>
        </motion.article>
    )
}

function MiniMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div style={{ minHeight: 72, borderRadius: 10, border: `1px solid ${C.borderSoft}`, background: C.surfaceTint, padding: 12 }}>
            <span style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 800 }}>{label}</span>
            <strong style={{ display: 'block', marginTop: 8, color: tone, fontSize: 22, lineHeight: 1, fontWeight: 800 }}>{value}</strong>
        </div>
    )
}

function ActivePrintRow({ campaign }: { campaign: ActivePrintCampaign }) {
    const meta = printStatusMeta(campaign.status)

    return (
        <motion.div
            variants={item}
            style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                minHeight: 58,
                borderTop: `1px solid ${C.borderSoft}`,
            }}
        >
            <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', color: C.text, fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {campaign.client || campaign.campaignName}
                </strong>
                <span style={{ display: 'block', marginTop: 5, color: C.muted, fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    PI {campaign.pi} - {campaign.format} - {campaign.device}
                </span>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '0 8px', borderRadius: 999, background: meta.bg, color: meta.tone, fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {meta.label}
            </span>
        </motion.div>
    )
}

function KpiCard({ label, value, hint, icon: Icon, tone, bg, index }: { label: string; value: string | number; hint: string; icon: LucideIcon; tone: string; bg: string; index: number }) {
    return (
        <motion.article
            variants={item}
            custom={index}
            whileHover={{ y: -4, boxShadow: C.shadowHover }}
            transition={{ duration: 0.22, ease }}
            style={{
                minHeight: 142,
                padding: 18,
                background: C.surface,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                boxShadow: C.shadow,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', color: tone, background: bg }}>
                    <Icon size={17} />
                </span>
            </div>
            <div>
                <strong style={{ display: 'block', color: C.text, fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.6px' }}>{value}</strong>
                <span style={{ display: 'block', marginTop: 9, color: C.muted, fontSize: 12, fontWeight: 700 }}>{hint}</span>
            </div>
        </motion.article>
    )
}

function RevealSection({ children, bottom = false }: { children: ReactNode; bottom?: boolean }) {
    return (
        <motion.section
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.16 }}
            style={{ marginTop: 20, paddingBottom: bottom ? 0 : 0 }}
        >
            {children}
        </motion.section>
    )
}

function DeliveryPanel({ signals }: { signals: Array<{ label: string; value: number; hint: string; icon: LucideIcon; tone: string; bg: string }> }) {
    return (
        <Panel title="Delivery overview" subtitle="Status do ciclo atual" icon={TrendingUp}>
            <div style={{ display: 'grid', gap: 0 }}>
                {signals.map((signal, index) => (
                    <SignalRow key={signal.label} signal={signal} isFirst={index === 0} />
                ))}
            </div>
        </Panel>
    )
}

function EventsPanel({ recentLogs }: { recentLogs: RecentLog[] }) {
    return (
        <Panel title="Eventos recentes" subtitle="Ultimos sinais do Nexus" icon={Activity}>
            <div style={{ display: 'grid', gap: 0 }}>
                {recentLogs.length === 0 && (
                    <EmptyState label="Sem eventos recentes" />
                )}
                {recentLogs.map((log, index) => (
                    <LogRow key={log.id} log={log} isFirst={index === 0} />
                ))}
            </div>
        </Panel>
    )
}

function Panel({ title, subtitle, icon: Icon, children }: { title: string; subtitle: string; icon: LucideIcon; children: ReactNode }) {
    return (
        <motion.article
            variants={item}
            whileHover={{ y: -2, boxShadow: C.shadowHover }}
            transition={{ duration: 0.22, ease }}
            style={{
                background: C.surface,
                border: `1px solid ${C.borderSoft}`,
                borderRadius: 12,
                boxShadow: C.shadow,
                overflow: 'hidden',
            }}
        >
            <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '0 18px', borderBottom: `1px solid ${C.borderSoft}`, background: C.surfaceTint }}>
                <div>
                    <p style={{ margin: 0, color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{subtitle}</p>
                    <h2 style={{ margin: '4px 0 0', color: C.text, fontSize: 20, fontWeight: 800, letterSpacing: '-0.2px' }}>{title}</h2>
                </div>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: C.blueSoft, color: C.blue }}>
                    <Icon size={17} />
                </span>
            </div>
            <div style={{ padding: '0 18px 12px' }}>
                {children}
            </div>
        </motion.article>
    )
}

function SignalRow({ signal, isFirst }: { signal: { label: string; value: number; hint: string; icon: LucideIcon; tone: string; bg: string }; isFirst: boolean }) {
    const Icon = signal.icon

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr) auto', alignItems: 'center', gap: 12, minHeight: 70, borderTop: isFirst ? 'none' : `1px solid ${C.borderSoft}` }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', background: signal.bg, color: signal.tone }}>
                <Icon size={16} />
            </span>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', color: C.text, fontSize: 13, fontWeight: 800 }}>{signal.label}</span>
                <span style={{ display: 'block', marginTop: 4, color: C.muted, fontSize: 12, fontWeight: 600 }}>{signal.hint}</span>
            </span>
            <strong style={{ color: signal.tone, fontSize: 24, fontWeight: 800 }}>{signal.value}</strong>
        </div>
    )
}

function LogRow({ log, isFirst }: { log: RecentLog; isFirst: boolean }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '82px minmax(0, 1fr)', gap: 12, padding: '14px 0', borderTop: isFirst ? 'none' : `1px solid ${C.borderSoft}` }}>
            <span style={{ color: C.faint, fontSize: 11, fontWeight: 800 }}>{formatClock(log.createdAt)}</span>
            <span style={{ minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 22, padding: '0 8px', borderRadius: 999, marginBottom: 7, background: levelBackground(log.level), color: levelColor(log.level), fontSize: 10, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {log.level}
                </span>
                <span style={{ display: 'block', color: C.textSoft, fontSize: 12, lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.message}</span>
            </span>
        </div>
    )
}

function CapturePanel({ recentCaptures }: { recentCaptures: RecentCapture[] }) {
    return (
        <motion.article variants={item}>
            <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 20, marginBottom: 14, flexWrap: 'wrap' }}>
                <div>
                    <p style={{ margin: 0, color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Evidencias recentes</p>
                    <h2 style={{ margin: '6px 0 0', color: C.text, fontSize: 24, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-0.4px' }}>
                        O que acabou de ser capturado
                    </h2>
                </div>
                <Link href="/books" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 14px', borderRadius: 8, color: C.blue, border: `1px solid ${C.border}`, background: C.surface, textDecoration: 'none', fontSize: 13, fontWeight: 800 }}>
                    Abrir books <ArrowRight size={14} />
                </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: GRID.captures, gap: 12 }}>
                {recentCaptures.length === 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                        <EmptyState label="Nenhuma captura recente encontrada" large />
                    </div>
                )}
                {recentCaptures.map((capture, index) => (
                    <CaptureTile key={capture.id} capture={capture} index={index} />
                ))}
            </div>
        </motion.article>
    )
}

function CaptureTile({ capture, index }: { capture: RecentCapture; index: number }) {
    return (
        <motion.article
            variants={item}
            custom={index}
            whileHover={{ y: -4, boxShadow: C.shadowHover }}
            transition={{ duration: 0.22, ease }}
            style={{
                overflow: 'hidden',
                borderRadius: 12,
                border: `1px solid ${C.borderSoft}`,
                background: C.surface,
                boxShadow: C.shadow,
            }}
        >
            <div style={{ position: 'relative', aspectRatio: capture.isAssembly ? '16 / 10' : '3 / 4', background: C.canvasAlt }}>
                <CaptureImage
                    src={`/api/captures/${capture.id}`}
                    alt={capture.campaign?.client || 'Captura'}
                    className="absolute inset-0 h-full w-full object-cover"
                />
            </div>
            <div style={{ padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: C.muted, fontSize: 10, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    <ImageIcon size={12} />
                    PI {capture.campaign?.pi || '--'}
                </div>
                <h3 style={{ margin: 0, color: C.text, fontSize: 14, fontWeight: 800, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {capture.campaign?.client || 'Campanha sem nome'}
                </h3>
                <p style={{ margin: '6px 0 0', color: C.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {capture.campaign?.format || 'Formato'} - {formatClock(capture.createdAt)}
                </p>
            </div>
        </motion.article>
    )
}

function EmptyState({ label, large = false }: { label: string; large?: boolean }) {
    return (
        <div style={{ minHeight: large ? 180 : 80, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${C.border}`, borderRadius: 12, color: C.muted, background: C.surface, fontSize: 13, fontWeight: 800 }}>
            {label}
        </div>
    )
}
