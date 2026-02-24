'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RunCaptureButton } from '@/components/RunCaptureButton'
import { Monitor, Smartphone, Archive, Trash2, Activity, Globe, Clock, Zap, CalendarRange, Pencil, ShieldAlert, CheckCircle2, Timer, Search, X, Filter, ArrowRight, Layers, Calendar, Loader2, Save } from 'lucide-react'
import { formatDistanceToNow, format as formatDate, isAfter, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { QueueIndicator } from '@/components/QueueIndicator'
import { NetworkIndicator } from '@/components/NetworkIndicator'
import { archiveCampaign, deleteCampaign } from '@/app/actions'
import { EditCampaignModal } from '@/components/EditCampaignModal'



function getFlightStatus(flightStart: Date | null, flightEnd: Date | null) {
    if (!flightStart || !flightEnd) {
        return { id: 'NEUTRAL', label: 'Sem período', color: 'var(--text-muted)', bg: 'var(--bg-tertiary)', icon: Clock }
    }

    const now = new Date()
    if (isBefore(now, flightStart)) {
        return { id: 'UPCOMING', label: 'Aguardando', color: 'var(--tertiary)', bg: 'var(--tertiary-muted)', icon: Timer }
    }
    if (isAfter(now, flightEnd)) {
        return { id: 'FINISHED', label: 'Encerrada', color: 'var(--destructive)', bg: 'var(--destructive-muted)', icon: ShieldAlert }
    }
    return { id: 'ACTIVE', label: 'Em veiculação', color: 'var(--accent)', bg: 'var(--accent-muted)', icon: CheckCircle2 }
}

export function MonitoringView({ initialCampaigns, formats }: { initialCampaigns: any[], formats: any[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState('')
    const [activeFilter, setActiveFilter] = useState<'all' | 'desktop' | 'mobile'>('all')
    const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'UPCOMING' | 'FINISHED' | 'NEUTRAL'>('all')

    const filteredCampaigns = useMemo(() => {
        return initialCampaigns.filter(c => {
            const status = getFlightStatus(c.flightStart, c.flightEnd).id

            const matchesSearch =
                c.client.toLowerCase().includes(search.toLowerCase()) ||
                c.agency.toLowerCase().includes(search.toLowerCase()) ||
                c.pi.toLowerCase().includes(search.toLowerCase()) ||
                c.url.toLowerCase().includes(search.toLowerCase())

            const matchesDevice =
                activeFilter === 'all' ||
                c.device === activeFilter

            const matchesStatus =
                statusFilter === 'all' ||
                status === statusFilter

            return matchesSearch && matchesDevice && matchesStatus
        })
    }, [initialCampaigns, search, activeFilter, statusFilter])

    const piGroups = useMemo(() => {
        const groups: Record<string, any> = {}

        filteredCampaigns.forEach(c => {
            if (!groups[c.pi]) {
                groups[c.pi] = {
                    pi: c.pi,
                    client: c.client,
                    agency: c.agency,
                    device: c.device,
                    campaigns: [],
                    earliestStart: c.flightStart ? new Date(c.flightStart) : null,
                    latestEnd: c.flightEnd ? new Date(c.flightEnd) : null,
                    formats: new Set()
                }
            }

            groups[c.pi].campaigns.push(c)
            if (c.format) groups[c.pi].formats.add(c.format)

            if (c.flightStart) {
                const start = new Date(c.flightStart)
                if (!groups[c.pi].earliestStart || start < groups[c.pi].earliestStart) {
                    groups[c.pi].earliestStart = start
                }
            }
            if (c.flightEnd) {
                const end = new Date(c.flightEnd)
                if (!groups[c.pi].latestEnd || end > groups[c.pi].latestEnd) {
                    groups[c.pi].latestEnd = end
                }
            }
        })

        return Object.values(groups).map(g => {
            // Determine combined status
            const statuses = g.campaigns.map((c: any) => getFlightStatus(c.flightStart, c.flightEnd).id)
            let finalStatus = 'NEUTRAL'
            if (statuses.includes('ACTIVE')) finalStatus = 'ACTIVE'
            else if (statuses.includes('UPCOMING')) finalStatus = 'UPCOMING'
            else if (statuses.every((s: string) => s === 'FINISHED')) finalStatus = 'FINISHED'

            return {
                ...g,
                statusId: finalStatus,
                formatsList: Array.from(g.formats).join(', ')
            }
        })
    }, [filteredCampaigns])

    const groups = useMemo(() => ({
        ACTIVE: piGroups.filter(g => g.statusId === 'ACTIVE'),
        UPCOMING: piGroups.filter(g => g.statusId === 'UPCOMING'),
        FINISHED: piGroups.filter(g => g.statusId === 'FINISHED'),
        NEUTRAL: piGroups.filter(g => g.statusId === 'NEUTRAL'),
    }), [piGroups])

    const stats = {
        totalPis: new Set(initialCampaigns.map(c => c.pi)).size,
        totalFormats: initialCampaigns.length,
        visible: piGroups.length,
        active: new Set(initialCampaigns.filter(c => getFlightStatus(c.flightStart, c.flightEnd).id === 'ACTIVE').map(c => c.pi)).size,
        upcoming: new Set(initialCampaigns.filter(c => getFlightStatus(c.flightStart, c.flightEnd).id === 'UPCOMING').map(c => c.pi)).size,
        finished: new Set(initialCampaigns.filter(c => getFlightStatus(c.flightStart, c.flightEnd).id === 'FINISHED').map(c => c.pi)).size
    }

    return (
        <div className="space-y-12 pb-20 animate-fade-in font-sans">
            {/* Command Center Header */}
            <header className="relative p-8 md:p-10 rounded-[2.5rem] overflow-hidden border border-white/5 bg-[#0a0a0f]/80 backdrop-blur-3xl shadow-2xl">
                <div
                    className="absolute top-0 right-0 w-2/3 h-full opacity-20 pointer-events-none bg-[radial-gradient(circle_at_70%_30%,var(--accent)_0%,transparent_70%)]"
                />

                <div className="relative z-10 space-y-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                        <div className="space-y-6">
                            <div className="flex items-center gap-5">
                                <div className="w-14 h-14 rounded-2xl bg-accent/20 flex items-center justify-center text-accent shadow-[0_0_30px_rgba(168,85,247,0.3)] border border-accent/20">
                                    <Activity size={28} />
                                </div>
                                <div>
                                    <h1 className="text-4xl md:text-5xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                                        CENTRO DE <span className="text-gradient">MONITORAMENTO</span>
                                    </h1>
                                    <p className="text-[10px] font-black tracking-[0.4em] text-white/30 uppercase mt-1">Status Intelligence • Live Monitor</p>
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-8 md:gap-12 pt-4">
                                <StatBox
                                    label="PIs Ativos"
                                    value={stats.totalPis}
                                    color="var(--accent-light)"
                                />
                                <StatBox
                                    label="Total Formatos"
                                    value={stats.totalFormats}
                                    color="white"
                                />
                                <StatBox
                                    label="Em Veiculação"
                                    value={stats.active}
                                    color="var(--accent)"
                                    pulse
                                    active={statusFilter === 'ACTIVE'}
                                    onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'all' : 'ACTIVE')}
                                />
                                <StatBox
                                    label="Encerradas"
                                    value={stats.finished}
                                    color="var(--destructive)"
                                    active={statusFilter === 'FINISHED'}
                                    onClick={() => setStatusFilter(statusFilter === 'FINISHED' ? 'all' : 'FINISHED')}
                                />
                            </div>
                        </div>

                        <div className="hidden lg:flex flex-col items-end gap-3">
                            <NetworkIndicator />
                            <QueueIndicator />
                        </div>
                    </div>

                    {/* Search and Advanced Filters Bar */}
                    <div className="flex flex-col xl:flex-row gap-6 items-center">
                        <div className="relative flex-1 w-full group">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-accent transition-colors duration-200" size={20} />
                            <input
                                type="text"
                                placeholder="Pesquisar por Cliente, PI ou Agência..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-white/[0.08] border border-white/10 rounded-2xl py-5 pl-14 pr-12 text-sm font-medium focus:outline-none focus:border-accent/40 focus:bg-white/[0.12] transition-all duration-200 shadow-inner"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch('')}
                                    className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors duration-200"
                                >
                                    <X size={18} />
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 p-2 bg-white/[0.05] border border-white/5 rounded-[1.5rem] w-full xl:w-auto self-stretch">
                            <div className="flex items-center gap-1 px-3 border-r border-white/10 mr-2">
                                <Filter size={14} className="text-white/20" />
                                <span className="text-[10px] font-black uppercase text-white/20">Status:</span>
                            </div>
                            <FilterButton
                                active={statusFilter === 'all'}
                                onClick={() => setStatusFilter('all')}
                                label="Tudo"
                            />
                            <FilterButton
                                active={statusFilter === 'ACTIVE'}
                                onClick={() => setStatusFilter('ACTIVE')}
                                label="Ativas"
                                dotColor="var(--accent)"
                            />
                            <FilterButton
                                active={statusFilter === 'UPCOMING'}
                                onClick={() => setStatusFilter('UPCOMING')}
                                label="Espera"
                                dotColor="var(--tertiary)"
                            />
                            <FilterButton
                                active={statusFilter === 'FINISHED'}
                                onClick={() => setStatusFilter('FINISHED')}
                                label="Fim"
                                dotColor="var(--destructive)"
                            />
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-white/[0.02] border border-white/5 rounded-[1.5rem] w-full xl:w-auto">
                            <FilterButton
                                active={activeFilter === 'all'}
                                onClick={() => setActiveFilter('all')}
                                icon={Globe}
                                label="Global"
                            />
                            <FilterButton
                                active={activeFilter === 'desktop'}
                                onClick={() => setActiveFilter('desktop')}
                                icon={Monitor}
                                label="Desk"
                            />
                            <FilterButton
                                active={activeFilter === 'mobile'}
                                onClick={() => setActiveFilter('mobile')}
                                icon={Smartphone}
                                label="Mob"
                            />
                        </div>
                    </div>
                </div>
            </header>

            {/* Campaign Sections */}
            <div className="space-y-24 px-2">
                {stats.visible === 0 && (
                    <div className="py-40 text-center rounded-[3rem] border-2 border-dashed border-white/5 bg-white/[0.02] animate-fade-in">
                        <Search size={64} className="mx-auto mb-6 text-white/10" />
                        <h2 className="text-2xl font-black mb-2 text-white/60 uppercase tracking-tighter">Nenhum rastro encontrado</h2>
                        <p className="text-white/20 font-medium">Os filtros neurais não detectaram campanhas com estes parâmetros.</p>
                        <button
                            onClick={() => { setSearch(''); setActiveFilter('all'); setStatusFilter('all'); }}
                            className="mt-8 px-8 py-3 rounded-2xl bg-accent text-white font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-[0_10px_30px_rgba(168,85,247,0.3)]"
                        >
                            Resetar Parâmetros
                        </button>
                    </div>
                )}

                {/* 1. EM VEICULAÇÃO (PRIORITY) */}
                {groups.ACTIVE.length > 0 && (
                    <section className="animate-slide-up sticky-top-[2rem]">
                        <SectionHeader label="Em Veiculação" count={groups.ACTIVE.length} color="var(--success)" active />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
                            {groups.ACTIVE.map(group => (
                                <PiCard
                                    key={group.pi}
                                    group={group}
                                    router={router}
                                    isPending={isPending}
                                    startTransition={startTransition}
                                    formats={formats}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* 2. AGUARDANDO INÍCIO */}
                {groups.UPCOMING.length > 0 && (
                    <section className="animate-slide-up [animation-delay:100ms]">
                        <SectionHeader label="Aguardando Período" count={groups.UPCOMING.length} color="var(--warning)" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {groups.UPCOMING.map(group => (
                                <PiCard
                                    key={group.pi}
                                    group={group}
                                    router={router}
                                    isPending={isPending}
                                    startTransition={startTransition}
                                    formats={formats}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* 3. FLUXO MANUAL */}
                {groups.NEUTRAL.length > 0 && (
                    <section className="animate-slide-up [animation-delay:200ms]">
                        <SectionHeader label="Fluxo Sem Período" count={groups.NEUTRAL.length} color="var(--text-muted)" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {groups.NEUTRAL.map(group => (
                                <PiCard
                                    key={group.pi}
                                    group={group}
                                    router={router}
                                    isPending={isPending}
                                    startTransition={startTransition}
                                    formats={formats}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* 4. ENCERRADAS */}
                {groups.FINISHED.length > 0 && (
                    <section className="animate-slide-up [animation-delay:300ms]">
                        <SectionHeader label="Ciclo Encerrado" count={groups.FINISHED.length} color="var(--destructive)" />
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 grayscale-70 opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-700">
                            {groups.FINISHED.map(group => (
                                <PiCard
                                    key={group.pi}
                                    group={group}
                                    router={router}
                                    isPending={isPending}
                                    startTransition={startTransition}
                                    formats={formats}
                                />
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}

function PiCard({ group, router, isPending, startTransition, formats }: { group: any, router: any, isPending: boolean, startTransition: any, formats: any[] }) {
    const [editingCampaign, setEditingCampaign] = useState<any>(null)
    const [isFlipped, setIsFlipped] = useState(false)
    const [editForm, setEditForm] = useState<any>(null)
    const [isSaving, startSaveTransition] = useTransition()
    const isActive = group.statusId === 'ACTIVE'
    const statusLabels = {
        ACTIVE: { label: 'Em Veiculação', color: 'var(--accent)', icon: Activity },
        UPCOMING: { label: 'Aguardando', color: 'var(--tertiary)', icon: Timer },
        FINISHED: { label: 'Encerrada', color: 'var(--destructive)', icon: ShieldAlert },
        NEUTRAL: { label: 'Fluxo Manual', color: 'var(--text-muted)', icon: Clock }
    }
    const status = (statusLabels as any)[group.statusId] || statusLabels.NEUTRAL

    const progressPercent = useMemo(() => {
        if (!group.earliestStart || !group.latestEnd) return 0
        const start = group.earliestStart.getTime()
        const end = group.latestEnd.getTime()
        const now = new Date().getTime()
        if (now < start) return 0
        if (now > end) return 100
        return Math.floor(((now - start) / (end - start)) * 100)
    }, [group.earliestStart, group.latestEnd])

    const handleRunBatch = () => {
        if (!confirm(`Deseja capturar os ${group.campaigns.length} formatos desta PI?`)) return
        startTransition(async () => {
            const { runCapture } = await import('@/app/actions')
            for (const c of group.campaigns) {
                await runCapture(c.id)
            }
            router.refresh()
        })
    }

    const getFormatLabel = (formatId: string) => {
        const foundFormat = (formats as any[]).find((f: any) => f.id === formatId)
        return foundFormat ? foundFormat.label : formatId
    }

    const startEditing = (campaign: any) => {
        setEditingCampaign(campaign)
        setEditForm({
            agency: campaign.agency || '',
            client: campaign.client || '',
            campaignName: campaign.campaignName || '',
            pi: campaign.pi || '',
            url: campaign.url || '',
            device: campaign.device || 'desktop',
            format: campaign.format || '',
            segmentation: campaign.segmentation || 'PRIVADO',
            flightStart: campaign.flightStart ? new Date(campaign.flightStart).toISOString().slice(0, 10) : '',
            flightEnd: campaign.flightEnd ? new Date(campaign.flightEnd).toISOString().slice(0, 10) : '',
            isScheduled: campaign.isScheduled || false,
            scheduledTimes: campaign.scheduledTimes || '[]',
        })
        setIsFlipped(true)
    }

    const cancelEditing = () => {
        setIsFlipped(false)
        setTimeout(() => { setEditingCampaign(null); setEditForm(null) }, 400)
    }

    const handleSave = () => {
        if (!editingCampaign || !editForm) return
        const data = new FormData()
        Object.entries(editForm).forEach(([key, value]) => data.append(key, (value as any).toString()))

        startSaveTransition(async () => {
            try {
                const { updateCampaign } = await import('@/app/actions')
                await updateCampaign(editingCampaign.id, data)
                setIsFlipped(false)
                setTimeout(() => { setEditingCampaign(null); setEditForm(null); router.refresh() }, 400)
            } catch (err) {
                alert('Erro ao salvar: ' + (err as Error).message)
            }
        })
    }

    const updateField = (fields: any) => setEditForm((prev: any) => ({ ...prev, ...fields }))

    const cardStyle = `rounded-2xl border transition-all duration-200 flex flex-col min-h-[360px]`
    const frontBg = isActive
        ? 'bg-[#111118] border-white/10'
        : 'bg-[#0e0e14] border-white/[0.06]'

    return (
        <div style={{ perspective: '1200px' }} className="relative">
            <div
                className="relative w-full transition-transform duration-500 ease-in-out"
                style={{
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
            >
                {/* ======= FRONT FACE ======= */}
                <div
                    className={`${cardStyle} ${frontBg} p-6`}
                    style={{ backfaceVisibility: 'hidden' }}
                >
                    {/* Top: Status + Client */}
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 px-3 rounded-lg flex items-center gap-1.5"
                                        style={{ background: `color-mix(in srgb, ${status.color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${status.color} 20%, transparent)` }}>
                                        <status.icon size={10} style={{ color: status.color }} />
                                        <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: status.color }}>
                                            {status.label}
                                        </span>
                                    </div>
                                </div>
                                <h3 className="text-2xl font-black tracking-tight text-white leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
                                    {group.client}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-lg bg-accent/10 border border-accent/20 text-[10px] font-bold text-accent">
                                        PI {group.pi}
                                    </span>
                                    <span className="text-[10px] font-medium text-white/25">{group.agency}</span>
                                </div>
                            </div>
                            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/25">
                                {group.device === 'mobile' ? <Smartphone size={24} /> : <Monitor size={24} />}
                            </div>
                        </div>
                    </div>

                    {/* Formats List */}
                    <div className="mt-5 space-y-2 flex-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/15">
                            Formatos
                        </span>
                        <div className="space-y-1">
                            {group.campaigns.slice(0, 5).map((c: any) => (
                                <div
                                    key={c.id}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.07] hover:border-accent/20 transition-all cursor-pointer group/fmt"
                                    onClick={() => startEditing(c)}
                                >
                                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-accent/10">
                                        {c.device === 'mobile' ? <Smartphone size={10} className="text-accent/70" /> : <Monitor size={10} className="text-accent/70" />}
                                    </div>
                                    <span className="text-[10px] font-medium text-white/60 flex-1 truncate">
                                        {getFormatLabel(c.format)}
                                    </span>
                                    <Pencil size={10} className="text-white/0 group-hover/fmt:text-accent/50 transition-colors flex-shrink-0" />
                                </div>
                            ))}
                            {group.campaigns.length > 5 && (
                                <span className="text-[9px] font-bold text-white/20 pl-3">
                                    +{group.campaigns.length - 5} outros
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-4 space-y-3">
                        {(group.earliestStart || group.latestEnd) && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold text-white/15 uppercase tracking-wider">Veiculação</span>
                                    <span className="text-[10px] font-bold text-white/30 tabular-nums">{progressPercent}%</span>
                                </div>
                                <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${isActive ? 'bg-accent' : 'bg-white/15'}`}
                                        style={{ width: `${progressPercent}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[9px] text-white/20 tabular-nums">
                                    <span>{group.earliestStart ? formatDate(group.earliestStart, 'dd/MM/yy') : '—'}</span>
                                    <span>{group.latestEnd ? formatDate(group.latestEnd, 'dd/MM/yy') : '—'}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-4 pt-4 flex items-center justify-between border-t border-white/[0.04]">
                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-wider">
                            {group.campaigns.length} formato{group.campaigns.length !== 1 ? 's' : ''}
                        </span>
                        <button
                            onClick={handleRunBatch}
                            disabled={isPending}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition-all disabled:opacity-40"
                        >
                            <Zap size={12} className="fill-current" />
                            Capturar
                        </button>
                    </div>
                </div>

                {/* ======= BACK FACE (Edit) ======= */}
                <div
                    className={`${cardStyle} bg-[#0f0f14] border-accent/20 p-5 absolute inset-0 overflow-y-auto`}
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                    {editForm && (
                        <>
                            {/* Edit Header */}
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h4 className="text-sm font-black text-white" style={{ fontFamily: 'var(--font-display)' }}>
                                        Editar <span className="text-accent">Formato</span>
                                    </h4>
                                    <p className="text-[9px] text-white/25 mt-0.5">
                                        {editingCampaign ? getFormatLabel(editingCampaign.format) : ''}
                                    </p>
                                </div>
                                <button
                                    onClick={cancelEditing}
                                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            {/* Edit Fields */}
                            <div className="space-y-3 flex-1">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-white/20 flex items-center gap-1">
                                        <Globe size={10} /> URL Alvo
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.url}
                                        onChange={e => updateField({ url: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-accent/40 transition-colors"
                                        placeholder="https://..."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20">Dispositivo</label>
                                        <div className="flex gap-1 p-1 rounded-lg bg-white/[0.03]">
                                            <button
                                                onClick={() => updateField({ device: 'desktop' })}
                                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${editForm.device === 'desktop' ? 'bg-accent text-white' : 'text-white/30'}`}
                                            >
                                                <Monitor size={10} /> Desk
                                            </button>
                                            <button
                                                onClick={() => updateField({ device: 'mobile' })}
                                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-bold transition-all ${editForm.device === 'mobile' ? 'bg-accent text-white' : 'text-white/30'}`}
                                            >
                                                <Smartphone size={10} /> Mob
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20 flex items-center gap-1">
                                            <Layers size={10} /> Formato
                                        </label>
                                        <select
                                            value={editForm.format}
                                            onChange={e => updateField({ format: e.target.value })}
                                            className="w-full px-2 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-white outline-none focus:border-accent/40 transition-colors appearance-none"
                                        >
                                            <option value="">—</option>
                                            {formats.map((fmt: any) => (
                                                <option key={fmt.id} value={fmt.id}>
                                                    {fmt.label} ({fmt.width}x{fmt.height})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20">Cliente</label>
                                        <input
                                            type="text"
                                            value={editForm.client}
                                            onChange={e => updateField({ client: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-accent/40 transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20">PI</label>
                                        <input
                                            type="text"
                                            value={editForm.pi}
                                            onChange={e => updateField({ pi: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-white outline-none focus:border-accent/40 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20 flex items-center gap-1">
                                            <Calendar size={10} /> Início
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.flightStart}
                                            onChange={e => updateField({ flightStart: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-white outline-none focus:border-accent/40 transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold uppercase tracking-wider text-white/20 flex items-center gap-1">
                                            <Calendar size={10} /> Fim
                                        </label>
                                        <input
                                            type="date"
                                            value={editForm.flightEnd}
                                            onChange={e => updateField({ flightEnd: e.target.value })}
                                            className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[11px] text-white outline-none focus:border-accent/40 transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Edit Actions */}
                            <div className="flex gap-2 mt-4 pt-3 border-t border-white/[0.04]">
                                <button
                                    onClick={cancelEditing}
                                    disabled={isSaving}
                                    className="flex-1 py-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-white/40 font-bold text-[10px] uppercase tracking-wider hover:bg-white/[0.08] hover:text-white transition-all disabled:opacity-40"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="flex-1 py-2.5 rounded-lg bg-accent text-white font-bold text-[10px] uppercase tracking-wider hover:bg-accent/80 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                                >
                                    {isSaving ? (
                                        <><Loader2 size={12} className="animate-spin" /> Salvando</>
                                    ) : (
                                        <><Save size={12} /> Salvar</>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function FilterButton({ active, onClick, icon: Icon, label, dotColor }: { active: boolean, onClick: () => void, icon?: any, label: string, dotColor?: string }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all min-w-[80px] justify-center ${active
                ? 'bg-accent text-white shadow-[0_10px_20px_rgba(168,85,247,0.3)] scale-105'
                : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                }`}
        >
            {Icon && <Icon size={14} className={active ? 'text-white' : 'text-white/20'} />}
            {dotColor && <div className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />}
            {label}
        </button>
    )
}

function StatBox({ label, value, color, pulse = false, onClick, active = false }: { label: string, value: number, color: string, pulse?: boolean, onClick?: () => void, active?: boolean }) {
    return (
        <div
            onClick={onClick}
            className={`flex flex-col group cursor-pointer transition-all duration-200 p-4 rounded-2xl border border-white/[0.03] ${onClick ? 'hover:scale-105 active:scale-95 hover:border-white/10 hover:bg-white/[0.05]' : ''
                } ${active ? 'bg-white/[0.08] border-accent/30 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'bg-white/[0.02]'}`}
        >
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2 group-hover:text-white/50 transition-colors duration-200" style={{ fontFamily: 'var(--font-body)' }}>
                {label}
            </span>
            <div className="flex items-center gap-3">
                <span className="text-3xl font-black leading-none tracking-tighter transition-colors duration-200" style={{ fontFamily: 'var(--font-display)', color: active ? 'white' : 'var(--text-secondary)' }}>
                    {value.toString().padStart(2, '0')}
                </span>
                {pulse && (
                    <div className="relative flex items-center justify-center">
                        <div className="absolute w-3 h-3 rounded-full animate-ping opacity-40 transition-colors duration-200" style={{ background: color }} />
                        <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_15px_currentColor] transition-colors duration-200" style={{ background: color, color }} />
                    </div>
                )}
            </div>
        </div>
    )
}

function SectionHeader({ label, count, color, active = false }: { label: string, count: number, color: string, active?: boolean }) {
    return (
        <div className="flex items-center gap-6 mb-12 sticky top-[2rem] z-20 bg-bg-primary py-6 -mx-2 px-4 rounded-3xl border border-white/[0.03] transition-all duration-200">
            <div className="flex items-center gap-4">
                <div className={`w-1.5 h-10 rounded-full transition-all duration-300 ${active ? 'scale-y-110 shadow-[0_0_20px_var(--accent)]' : ''}`} style={{ background: color }} />
                <h2 className="text-2xl font-black uppercase tracking-tighter text-white" style={{ fontFamily: 'var(--font-display)' }}>
                    {label}
                </h2>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-white/[0.1] to-transparent" />
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-white/[0.04] border border-white/5 shadow-inner transition-colors duration-200">
                <span className="text-xs font-black text-white/40 uppercase tracking-widest" style={{ fontFamily: 'var(--font-body)' }}>{count}</span>
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">{count === 1 ? 'Item' : 'Itens'}</span>
            </div>
        </div>
    )
}

