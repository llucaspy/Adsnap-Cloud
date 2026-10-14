'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { hasExpiredLease, workerJobHref } from '@/lib/workerPresentation'
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock3,
    DatabaseZap,
    ExternalLink,
    FileWarning,
    Layers,
    Loader2,
    RefreshCw,
    ServerCog,
    ShieldAlert,
    TimerReset,
} from 'lucide-react'

type QueueItem = {
    id: string
    jobId?: string | null
    pi: string
    client: string
    campaignName: string
    format: string
    formatLabel: string
    device: string
    status: string
    updatedAt: string
    lastCaptureAt: string | null
    processingStartedAt: string | null
    processingHeartbeatAt: string | null
    processingRunId: string | null
    processingAttempts: number
    lastWorkerError: string | null
    lockedUntil: string | null
    latestCaptureAt: string | null
    latestCaptureUrl: string | null
}

type LogItem = {
    id: string
    level: string
    message: string
    details: string | null
    campaignId: string | null
    createdAt: string
    campaign: { id: string; pi: string; client: string; format: string; formatLabel: string; status: string } | null
}

type CountItem = { status?: string; level?: string; count: number }

type WorkerRun = {
    id: string
    level: string
    message: string
    createdAt: string
    details: Record<string, unknown> | null
}

type GamJob = {
    id: string
    level: string
    message: string
    details: string | null
    createdAt: string
}

type BatchMetrics = {
    batchSize: number
    total: number
    running: number
    waiting: number
    errors: number
    totalItems: number
    runningItems: number
    waitingItems: number
    errorItems: number
}

const C = {
    bg: '#0f0f0f',
    surface: '#141414',
    surfaceSoft: '#1a1a1a',
    card: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    text: '#ffffff',
    ink: '#e5e5e5',
    muted: '#a3a3a3',
    dim: '#737373',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    accent: '#e5e5e5',
}

function minutesSince(value: string | null) {
    if (!value) return null
    return Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
}

function formatClock(value: string | null) {
    if (!value) return '-'
    return new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(value))
}

function countBy<T extends CountItem>(items: T[], key: string) {
    return items.find(item => item.status === key || item.level === key)?.count || 0
}

function levelTone(level: string) {
    if (level.includes('ERROR') || level === 'QUARANTINE' || level === 'FAILED') return { color: C.error, bg: 'rgba(239,68,68,0.12)', icon: AlertTriangle }
    if (level.includes('SUCCESS') || level === 'SUCCESS' || level.includes('REVIEW')) return { color: C.success, bg: 'rgba(34,197,94,0.12)', icon: CheckCircle2 }
    if (level.includes('RUNNING') || level === 'PROCESSING') return { color: C.accent, bg: 'rgba(255,255,255,0.12)', icon: Loader2 }
    if (level === 'QUEUED' || level.includes('PENDING') || level === 'AUTOCONFIG') return { color: C.warning, bg: 'rgba(245,158,11,0.12)', icon: Clock3 }
    return { color: C.muted, bg: C.surface, icon: Activity }
}

function StatCard({ label, value, icon: Icon, tone = C.text, hint }: { label: string; value: string | number; icon: any; tone?: string; hint?: string }) {
    return (
        <div className="hover-lift" style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 20,
            minHeight: 116,
            boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{label}</span>
                <Icon size={18} style={{ color: tone }} />
            </div>
            <div style={{ marginTop: 18, fontFamily: 'var(--font-display)', color: C.text, fontSize: 34, lineHeight: 1, fontWeight: 800, letterSpacing: '-0.5px' }}>
                {value}
            </div>
            {hint && (
                <div style={{ marginTop: 10, color: C.muted, fontSize: 11, fontWeight: 700, lineHeight: 1.35 }}>
                    {hint}
                </div>
            )}
        </div>
    )
}

function StatusBadge({ value }: { value: string }) {
    const tone = levelTone(value)
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
            padding: '3px 8px',
            borderRadius: 4,
            background: tone.bg,
            color: tone.color,
            border: `1px solid ${C.border}`,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
        }}>
            {value}
        </span>
    )
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: C.text }} />
            <h2 style={{ color: C.text, fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</h2>
            <div style={{ height: 1, flex: 1, background: C.border }} />
            {typeof count === 'number' && <span style={{ color: C.muted, fontSize: 11, fontWeight: 700 }}>{count}</span>}
        </div>
    )
}

export function WorkerLogsPanel({
    generatedAt,
    batchMetrics,
    queue,
    campaignStatusCounts,
    recentLogs,
    recentErrors,
    logLevelCounts,
    captureStatusCounts,
    workerRuns,
    gamJobs,
}: {
    generatedAt: string
    batchMetrics: BatchMetrics
    queue: QueueItem[]
    campaignStatusCounts: CountItem[]
    recentLogs: LogItem[]
    recentErrors?: LogItem[]
    logLevelCounts: CountItem[]
    captureStatusCounts: CountItem[]
    workerRuns: WorkerRun[]
    gamJobs: GamJob[]
}) {
    const router = useRouter()

    useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden) router.refresh() }, 15000)
        return () => clearInterval(timer)
    }, [router])

    const stats = useMemo(() => {
        const queued = countBy(campaignStatusCounts, 'QUEUED')
        const processing = countBy(campaignStatusCounts, 'PROCESSING')
        const autoconfig = countBy(campaignStatusCounts, 'AUTOCONFIG')
        const errors24h = countBy(logLevelCounts, 'ERROR') + countBy(logLevelCounts, 'API_ERROR')
        const success24h = countBy(captureStatusCounts, 'SUCCESS')
        const oldest = queue
            .filter(item => ['QUEUED', 'PROCESSING', 'AUTOCONFIG'].includes(item.status))
            .map(item => minutesSince(item.processingStartedAt || item.updatedAt) || 0)
            .sort((a, b) => b - a)[0] || 0
        return { queued, processing, autoconfig, errors24h, success24h, oldest }
    }, [campaignStatusCounts, logLevelCounts, captureStatusCounts, queue])

    const errorLogs = recentErrors || recentLogs.filter(log => log.level.includes('ERROR')).slice(0, 12)

    return (
        <main className="page-enter workers-panel" style={{ minHeight: '100vh', color: C.text, background: C.bg }}>
            <header className="worker-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
                <div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 4, background: C.card, color: C.muted, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 14 }}>
                        <ServerCog size={14} />
                        Nexus Engine
                    </div>
                    <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 4vw, 48px)', lineHeight: 1.08, fontWeight: 800, letterSpacing: '-0.5px', color: C.text }}>
                        Painel dos Workers
                    </h1>
                    <p style={{ marginTop: 10, color: C.muted, fontSize: 14, maxWidth: 560 }}>
                        Atualizado {formatClock(generatedAt)} · Fila atual e histórico de tarefas
                    </p>
                </div>
                <button
                    onClick={() => router.refresh()}
                    className="hover-lift"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        border: `0.5px solid ${C.borderStrong}`,
                        borderRadius: 8,
                        background: C.card,
                        color: C.text,
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                    }}
                >
                    <RefreshCw size={15} />
                    Atualizar
                </button>
            </header>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 18 }}>
                <StatCard label="Tarefas ativas" value={batchMetrics.waitingItems + batchMetrics.runningItems} icon={Layers} tone={C.text} hint="Aguardando ou em processamento" />
                <StatCard label="Em execução" value={batchMetrics.runningItems} icon={Loader2} tone={C.accent} hint="Tarefas com processamento iniciado" />
                <StatCard label="Em espera" value={batchMetrics.waitingItems} icon={Clock3} tone={C.warning} hint="Tarefas aguardando o worker" />
                <StatCard label="Falhas no histórico" value={batchMetrics.errorItems} icon={AlertTriangle} tone={batchMetrics.errors > 0 ? C.error : C.muted} hint="Todos os períodos, sem arquivados" />
            </section>

            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
                <StatCard label="Na fila" value={stats.queued} icon={Layers} tone={C.warning} />
                <StatCard label="Processando" value={stats.processing} icon={Loader2} tone={C.accent} />
                <StatCard label="Autoconfig" value={stats.autoconfig} icon={DatabaseZap} tone={C.text} />
                <StatCard label="Eventos de erro · 24h" value={stats.errors24h} icon={ShieldAlert} tone={stats.errors24h > 0 ? C.error : C.muted} />
                <StatCard label="Capturas salvas · 24h" value={stats.success24h} icon={CheckCircle2} tone={C.success} hint="Resultado técnico; revisão é independente" />
                <StatCard label="Mais antigo" value={`${stats.oldest}m`} icon={TimerReset} tone={stats.oldest > 45 ? C.error : C.muted} />
            </section>

            <section className="worker-columns" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: 20, alignItems: 'start' }}>
                <div>
                    <SectionTitle title="Tarefas e histórico" count={queue.length} />
                    <div style={{ display: 'grid', gap: 10 }}>
                        {queue.length === 0 && (
                            <div style={{ border: `1px dashed ${C.borderStrong}`, borderRadius: 12, padding: 32, color: C.muted, textAlign: 'center', background: C.card }}>
                                Fila limpa
                            </div>
                        )}
                        {queue.map(item => {
                            const age = minutesSince(item.processingStartedAt || item.updatedAt) || 0
                            const expired = hasExpiredLease(item)
                            return (
                                <Link
                                    key={item.jobId || `campaign-${item.id}`}
                                    href={workerJobHref(item)}
                                    className="hover-lift worker-queue-card"
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                                        gap: 16,
                                        textDecoration: 'none',
                                        background: C.card,
                                        border: `1px solid ${expired ? 'rgba(239,68,68,0.35)' : C.border}`,
                                        borderRadius: 12,
                                        padding: 16,
                                        boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                                            <StatusBadge value={item.status} />
                                            <span style={{ color: C.muted, fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>PI {item.pi}</span>
                                            <span style={{ color: C.dim, fontSize: 11 }}>{item.device}</span>
                                        </div>
                                        <h3 style={{ margin: 0, color: C.text, fontSize: 15, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.client}
                                        </h3>
                                        <p style={{ margin: '6px 0 0', color: C.muted, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {[item.campaignName, item.formatLabel].filter(Boolean).join(' - ')}
                                        </p>
                                        {item.lastWorkerError && (
                                            <p style={{ margin: '10px 0 0', color: C.error, fontSize: 12, lineHeight: 1.45 }}>
                                                {item.lastWorkerError}
                                            </p>
                                        )}
                                    </div>
                                    <div className="worker-queue-meta" style={{ display: 'grid', gap: 7, justifyItems: 'end', color: C.muted, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                        <span>{age}m {item.status === 'PROCESSING' ? 'em execução' : 'desde atualização'}</span>
                                        {item.status === 'PROCESSING' && <span>{expired ? 'Reserva vencida' : `Sinal há ${minutesSince(item.processingHeartbeatAt) ?? '?'}m`}</span>}
                                        <span>{item.processingAttempts} tent.</span>
                                        <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{item.processingRunId || '-'}</span>
                                        <ExternalLink size={14} />
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </div>

                <aside>
                    <SectionTitle title="Ciclos Recentes" count={workerRuns.length} />
                    <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
                        {workerRuns.length === 0 && <SmallEmpty label="Sem ciclos recentes" />}
                        {workerRuns.map(run => {
                            const summary = run.details?.captureSummary as { claimed?: number; success?: number; failed?: number; timeout?: number; quarantine?: number } | undefined
                            return (
                                <div key={run.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                                        <StatusBadge value={run.level} />
                                        <span style={{ color: C.muted, fontSize: 11, fontWeight: 700 }}>{formatClock(run.createdAt)}</span>
                                    </div>
                                    <p style={{ margin: 0, color: C.text, fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>{run.message}</p>
                                    {summary && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
                                            <MiniMetric label="claim" value={summary.claimed || 0} />
                                            <MiniMetric label="ok" value={summary.success || 0} />
                                            <MiniMetric label="fail" value={summary.failed || 0} />
                                            <MiniMetric label="time" value={summary.timeout || 0} />
                                            <MiniMetric label="quar" value={summary.quarantine || 0} />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    <SectionTitle title="Jobs GAM" count={gamJobs.length} />
                    <div style={{ display: 'grid', gap: 10 }}>
                        {gamJobs.length === 0 && <SmallEmpty label="Sem jobs GAM recentes" />}
                        {gamJobs.map(job => (
                            <div key={job.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                    <StatusBadge value={job.level.replace('JOB_GAM_', '')} />
                                    <span style={{ color: C.muted, fontSize: 11, fontWeight: 700 }}>{formatClock(job.createdAt)}</span>
                                </div>
                                <p style={{ margin: 0, color: C.text, fontSize: 12, lineHeight: 1.45 }}>{job.message}</p>
                            </div>
                        ))}
                    </div>
                </aside>
            </section>

            <section className="worker-event-columns" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)', gap: 20, marginTop: 32 }}>
                <div>
                    <SectionTitle title="Erros nas últimas 24h" count={errorLogs.length} />
                    <div style={{ display: 'grid', gap: 10 }}>
                        {errorLogs.length === 0 && <SmallEmpty label="Nenhum erro recente" />}
                        {errorLogs.map(log => (
                            <div key={log.id} style={{ background: C.card, border: '1px solid rgba(239,68,68,0.35)', borderRadius: 12, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                                    <StatusBadge value={log.level} />
                                    <span style={{ color: C.muted, fontSize: 11, fontWeight: 700 }}>{formatClock(log.createdAt)}</span>
                                </div>
                                <p style={{ margin: 0, color: C.text, fontSize: 12, lineHeight: 1.45 }}>{log.message}</p>
                                {log.campaign && (
                                    <p style={{ margin: '8px 0 0', color: C.muted, fontSize: 11 }}>
                                        PI {log.campaign.pi} - {log.campaign.client} - {log.campaign.formatLabel}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div>
                    <SectionTitle title="Eventos recentes" count={Math.min(recentLogs.length, 60)} />
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
                        {recentLogs.slice(0, 60).map((log, index) => {
                            const tone = levelTone(log.level)
                            const Icon = tone.icon
                            return (
                                <div key={log.id} className="worker-event-row" style={{
                                    display: 'grid',
                                    gridTemplateColumns: '28px minmax(0, 1fr) auto',
                                    gap: 12,
                                    padding: '12px 14px',
                                    borderTop: index === 0 ? 'none' : `0.5px solid ${C.border}`,
                                    alignItems: 'start',
                                }}>
                                    <div style={{ width: 28, height: 28, borderRadius: 6, background: tone.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: tone.color }}>
                                        <Icon size={14} />
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={{ margin: 0, color: C.text, fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{log.message}</p>
                                        {log.campaign && (
                                            <p style={{ margin: '5px 0 0', color: C.muted, fontSize: 11 }}>
                                                PI {log.campaign.pi} - {log.campaign.client} - {log.campaign.formatLabel}
                                            </p>
                                        )}
                                    </div>
                                    <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{formatClock(log.createdAt)}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </section>
            <style jsx global>{`
                .workers-panel .worker-queue-meta { min-width: 0; max-width: 260px; }
                @media (max-width: 900px) {
                    .workers-panel .worker-columns,
                    .workers-panel .worker-event-columns { grid-template-columns: minmax(0, 1fr) !important; }
                }
                @media (max-width: 600px) {
                    .workers-panel .worker-header { padding-top: 40px; }
                    .workers-panel .worker-queue-card { grid-template-columns: minmax(0, 1fr) !important; }
                    .workers-panel .worker-queue-meta {
                        display: flex !important; flex-wrap: wrap; justify-content: flex-start;
                        white-space: normal !important; max-width: 100%;
                    }
                    .workers-panel .worker-queue-meta span { overflow-wrap: anywhere; }
                    .workers-panel .worker-event-row { grid-template-columns: 28px minmax(0, 1fr) !important; }
                    .workers-panel .worker-event-row > span:last-child { grid-column: 2; }
                }
            `}</style>
        </main>
    )
}

function MiniMetric({ label, value }: { label: string; value: number }) {
    return (
        <div style={{ background: C.surfaceSoft, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 8px' }}>
            <div style={{ color: C.muted, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: C.text, fontSize: 15, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
        </div>
    )
}

function SmallEmpty({ label }: { label: string }) {
    return (
        <div style={{ background: C.card, border: `1px dashed ${C.borderStrong}`, borderRadius: 12, padding: 18, color: C.muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileWarning size={14} />
            {label}
        </div>
    )
}
