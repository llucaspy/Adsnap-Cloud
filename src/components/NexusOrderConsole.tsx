'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
    AlertTriangle,
    Bot,
    CheckCircle2,
    CircleDot,
    Clock3,
    ExternalLink,
    FileCheck2,
    History,
    Link2,
    Loader2,
    Mail,
    MessageCircle,
    RefreshCw,
    Send,
} from 'lucide-react'
import { getNexusOrderJobs, submitNexusOrderLink } from '@/app/nexus/actions'

type NexusOrderJob = Awaited<ReturnType<typeof getNexusOrderJobs>>[number]

const statusMap: Record<string, { label: string; color: string; background: string; icon: typeof Clock3 }> = {
    JOB_GAM_PENDING: { label: 'Na fila', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', icon: Clock3 },
    JOB_GAM_RUNNING: { label: 'Processando', color: '#93c5fd', background: 'rgba(59,130,246,0.12)', icon: Loader2 },
    JOB_GAM_REVIEW: { label: 'Revisao', color: '#22c55e', background: 'rgba(34,197,94,0.12)', icon: CheckCircle2 },
    JOB_GAM_ERROR: { label: 'Erro', color: '#ef4444', background: 'rgba(239,68,68,0.12)', icon: AlertTriangle },
    JOB_GAM_CANCELLED: { label: 'Cancelado', color: '#a3a3a3', background: 'rgba(255,255,255,0.08)', icon: CircleDot },
}

function formatTime(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value))
}

function reviewHref(job: NexusOrderJob) {
    return job.notifications?.reviewUrl || `/campaigns?jobId=${encodeURIComponent(job.id)}`
}

function StatusBadge({ level }: { level: string }) {
    const status = statusMap[level] || statusMap.JOB_GAM_PENDING
    const Icon = status.icon

    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold"
            style={{ color: status.color, background: status.background, borderRadius: '999px' }}
        >
            <Icon size={12} className={level === 'JOB_GAM_RUNNING' ? 'animate-spin' : ''} />
            {status.label}
        </span>
    )
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: 'warning' | 'success' | 'danger' | 'neutral' }) {
    const color = tone === 'warning' ? '#f59e0b'
        : tone === 'success' ? '#22c55e'
            : tone === 'danger' ? '#ef4444'
                : '#e5e5e5'

    return (
        <div className="p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: '#737373' }}>{label}</p>
            <p className="mt-3 text-3xl font-black leading-none" style={{ color }}>{value}</p>
        </div>
    )
}

function NotificationPills({ job }: { job: NexusOrderJob }) {
    if (!job.notifications) return null

    return (
        <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold" style={{ color: job.notifications.telegram ? '#22c55e' : '#737373', background: 'rgba(255,255,255,0.06)', borderRadius: '999px' }}>
                <MessageCircle size={12} />
                Telegram
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold" style={{ color: job.notifications.email ? '#22c55e' : '#737373', background: 'rgba(255,255,255,0.06)', borderRadius: '999px' }}>
                <Mail size={12} />
                Email
            </span>
        </div>
    )
}

function JobCard({ job }: { job: NexusOrderJob }) {
    const result = job.autoRegisterResult
    const logs = job.executionLogs.slice(-4)

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-5"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
        >
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge level={job.level} />
                        <span className="text-[11px] font-semibold" style={{ color: '#737373' }}>{formatTime(job.createdAt)}</span>
                    </div>
                    <h2 className="mt-3 text-lg md:text-xl font-black leading-tight truncate" style={{ color: '#f5f5f5' }}>
                        {job.client || `Order ${job.orderId || 'GAM'}`}
                    </h2>
                    <p className="mt-1 text-sm truncate" style={{ color: '#a3a3a3' }}>
                        {job.campaignName || job.message}
                    </p>
                    <p className="mt-2 text-xs" style={{ color: '#737373' }}>
                        PI {job.pi || '-'} | Order {job.orderId || '-'}
                    </p>
                </div>

                <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
                    <NotificationPills job={job} />
                    {job.level === 'JOB_GAM_REVIEW' && (
                        <Link
                            href={reviewHref(job)}
                            className="h-10 px-3 inline-flex items-center gap-2 text-sm font-bold"
                            style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: '8px' }}
                        >
                            Revisar <ExternalLink size={14} />
                        </Link>
                    )}
                </div>
            </div>

            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="px-3 py-3" style={{ background: '#0f0f0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>Criadas</p>
                    <p className="mt-1 text-xl font-black" style={{ color: '#e5e5e5' }}>{result?.created ?? 0}</p>
                </div>
                <div className="px-3 py-3" style={{ background: '#0f0f0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>Existentes</p>
                    <p className="mt-1 text-xl font-black" style={{ color: '#e5e5e5' }}>{result?.skipped ?? 0}</p>
                </div>
                <div className="px-3 py-3" style={{ background: '#0f0f0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>Formatos</p>
                    <p className="mt-1 text-xl font-black" style={{ color: '#e5e5e5' }}>{job.formats}</p>
                </div>
                <div className="px-3 py-3" style={{ background: '#0f0f0f', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>Pendencias</p>
                    <p className="mt-1 text-xl font-black" style={{ color: job.blocked > 0 ? '#f59e0b' : '#e5e5e5' }}>{result?.blocked ?? job.blocked}</p>
                </div>
            </div>

            {logs.length > 0 && (
                <div className="mt-5 space-y-2">
                    {logs.map((log, index) => (
                        <div key={`${log.at}-${index}`} className="flex items-start gap-3 text-xs">
                            <span className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: log.tone === 'error' ? '#ef4444' : log.tone === 'success' ? '#22c55e' : '#737373' }} />
                            <span className="leading-5" style={{ color: '#a3a3a3' }}>{log.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </motion.article>
    )
}

export function NexusOrderConsole({ initialJobs }: { initialJobs: NexusOrderJob[] }) {
    const [jobs, setJobs] = useState(initialJobs)
    const [orderUrl, setOrderUrl] = useState('')
    const [message, setMessage] = useState('')
    const [isPending, startTransition] = useTransition()
    const [isRefreshing, setIsRefreshing] = useState(false)

    async function refreshJobs() {
        setIsRefreshing(true)
        try {
            setJobs(await getNexusOrderJobs())
        } finally {
            setIsRefreshing(false)
        }
    }

    useEffect(() => {
        const interval = window.setInterval(() => {
            refreshJobs().catch(() => null)
        }, 8000)
        return () => window.clearInterval(interval)
    }, [])

    const metrics = useMemo(() => ({
        pending: jobs.filter(job => job.level === 'JOB_GAM_PENDING').length,
        running: jobs.filter(job => job.level === 'JOB_GAM_RUNNING').length,
        review: jobs.filter(job => job.level === 'JOB_GAM_REVIEW').length,
        error: jobs.filter(job => job.level === 'JOB_GAM_ERROR').length,
    }), [jobs])

    function handleSubmit() {
        setMessage('')
        startTransition(async () => {
            try {
                const result = await submitNexusOrderLink(orderUrl)
                setOrderUrl('')
                setMessage(result.existing
                    ? `Order ${result.orderId} ja estava registrada no fluxo Nexus.`
                    : `Order ${result.orderId} enviada para cadastro automatico.`
                )
                await refreshJobs()
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Nao foi possivel enviar a order.')
            }
        })
    }

    return (
        <div className="space-y-6">
            <motion.section
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden"
                style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}
            >
                <div className="p-5 md:p-7 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-end">
                    <div className="min-w-0">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: '#e5e5e5', background: 'rgba(255,255,255,0.08)', borderRadius: '999px' }}>
                            <Bot size={13} />
                            Nexus V2
                        </div>
                        <h1 className="mt-5 text-3xl md:text-5xl font-black tracking-tight leading-[0.98]" style={{ color: '#ffffff' }}>
                            Cadastro automatico de orders GAM
                        </h1>
                    </div>

                    <div className="space-y-3">
                        <label htmlFor="nexus-order-url" className="text-xs font-bold uppercase tracking-widest" style={{ color: '#737373' }}>
                            Link da order
                        </label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <div className="relative flex-1 min-w-0">
                                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2" size={16} style={{ color: '#737373' }} />
                                <input
                                    id="nexus-order-url"
                                    value={orderUrl}
                                    onChange={event => setOrderUrl(event.target.value)}
                                    onKeyDown={event => {
                                        if (event.key === 'Enter' && orderUrl.trim() && !isPending) handleSubmit()
                                    }}
                                    placeholder="https://admanager.google.com/...order_id=..."
                                    className="w-full h-12 pl-10 pr-3 outline-none text-sm"
                                    style={{ background: '#0f0f0f', color: '#e5e5e5', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px' }}
                                />
                            </div>
                            <button
                                onClick={handleSubmit}
                                disabled={isPending || !orderUrl.trim()}
                                className="h-12 px-5 inline-flex items-center justify-center gap-2 text-sm font-black disabled:opacity-40"
                                style={{ background: '#e5e5e5', color: '#0f0f0f', borderRadius: '8px' }}
                            >
                                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                Enviar
                            </button>
                        </div>
                        <div className="min-h-5">
                            {message && <p className="text-xs" style={{ color: /valido|possivel|nao/i.test(message) ? '#f59e0b' : '#a3a3a3' }}>{message}</p>}
                        </div>
                    </div>
                </div>
            </motion.section>

            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="Na fila" value={metrics.pending} tone="warning" />
                <MetricCard label="Executando" value={metrics.running} tone="neutral" />
                <MetricCard label="Em revisao" value={metrics.review} tone="success" />
                <MetricCard label="Erros" value={metrics.error} tone="danger" />
            </section>

            <section className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <History size={17} style={{ color: '#a3a3a3' }} />
                        <h2 className="text-sm font-black uppercase tracking-[0.14em]" style={{ color: '#e5e5e5' }}>
                            Orders recentes
                        </h2>
                    </div>
                    <button
                        onClick={() => refreshJobs()}
                        disabled={isRefreshing}
                        className="w-10 h-10 inline-flex items-center justify-center disabled:opacity-40"
                        style={{ color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '8px' }}
                        title="Atualizar"
                    >
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    </button>
                </div>

                {jobs.length > 0 ? (
                    <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                        {jobs.map(job => <JobCard key={job.id} job={job} />)}
                    </div>
                ) : (
                    <div className="min-h-[280px] flex flex-col items-center justify-center text-center px-6" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
                        <FileCheck2 size={24} style={{ color: '#737373' }} />
                        <p className="mt-3 text-sm font-bold" style={{ color: '#e5e5e5' }}>Nenhuma order recente</p>
                    </div>
                )}
            </section>
        </div>
    )
}
