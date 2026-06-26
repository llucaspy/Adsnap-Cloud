'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, Smartphone, Activity, Globe, Clock, Zap, Pencil, ShieldAlert, CheckCircle2, Timer, Search, X, Filter, Radio } from 'lucide-react'
import { format as formatDate, isAfter, isBefore } from 'date-fns'
import Link from 'next/link'
import { QueueIndicator } from '@/components/QueueIndicator'
import { NetworkIndicator } from '@/components/NetworkIndicator'
import { EditCampaignModal } from '@/components/EditCampaignModal'

/* ─── Palette ─────────────────────────────────────── */
const C = {
    bg: '#faf9f7',
    surface: '#f3f0ea',
    card: '#ede9e1',
    border: '#e8e5df',
    borderDim: '#d4cfc7',
    text: '#1c1917',
    muted: '#a89f8c',
    dim: '#d4cfc7',
}

const M = {
    canvas: '#0f0f0f',
    surface: '#141414',
    surfaceSoft: '#1a1a1a',
    glass: 'rgba(255,255,255,0.04)',
    hairline: 'rgba(255,255,255,0.08)',
    hairlineStrong: 'rgba(255,255,255,0.16)',
    inkDeep: '#ffffff',
    ink: '#e5e5e5',
    charcoal: '#a3a3a3',
    slate: '#737373',
    muted: '#525252',
    primary: '#7c3aed',
    primaryMuted: '#7c3aed1a',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
}

interface Campaign {
    id: string; pi: string; client: string; agency: string; url: string
    device: string; format: string; flightStart: string | null; flightEnd: string | null
    isMonitoringActive: boolean
}

interface PIGroup {
    pi: string; client: string; agency: string; device: string; campaigns: Campaign[]
    earliestStart: Date | null; latestEnd: Date | null; formats: Set<string>
    statusId: string; formatsList: string
}

function getFlightStatus(flightStart: Date | null, flightEnd: Date | null) {
    if (!flightStart || !flightEnd) return { id: 'NEUTRAL', label: 'Sem período', color: C.muted, bg: C.card, icon: Clock }
    const now = new Date()
    if (isBefore(now, flightStart)) return { id: 'UPCOMING', label: 'Aguardando', color: '#b45309', bg: '#fef3c7', icon: Timer }
    if (isAfter(now, flightEnd)) return { id: 'FINISHED', label: 'Encerrada', color: '#ef4444', bg: '#fef2f2', icon: ShieldAlert }
    return { id: 'ACTIVE', label: 'Em veiculação', color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle2 }
}

export function MonitoringView({ initialCampaigns, formats }: { initialCampaigns: Campaign[], formats: any[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [search, setSearch] = useState('')
    const [activeFilter, setActiveFilter] = useState<'all' | 'desktop' | 'mobile'>('all')
    const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'UPCOMING' | 'FINISHED' | 'NEUTRAL'>('all')

    const filteredCampaigns = useMemo(() => {
        return initialCampaigns.filter(c => {
            const start = c.flightStart ? new Date(c.flightStart) : null
            const end = c.flightEnd ? new Date(c.flightEnd) : null
            const status = getFlightStatus(start, end).id
            const matchesSearch = c.client.toLowerCase().includes(search.toLowerCase()) ||
                c.agency.toLowerCase().includes(search.toLowerCase()) ||
                c.pi.toLowerCase().includes(search.toLowerCase()) ||
                c.url.toLowerCase().includes(search.toLowerCase())
            return matchesSearch && (activeFilter === 'all' || c.device === activeFilter) && (statusFilter === 'all' || status === statusFilter)
        })
    }, [initialCampaigns, search, activeFilter, statusFilter])

    const piGroups = useMemo(() => {
        const groups: Record<string, any> = {}
        filteredCampaigns.forEach(c => {
            if (!groups[c.pi]) {
                groups[c.pi] = { pi: c.pi, client: c.client, agency: c.agency, device: c.device, campaigns: [], earliestStart: c.flightStart ? new Date(c.flightStart) : null, latestEnd: c.flightEnd ? new Date(c.flightEnd) : null, formats: new Set() }
            }
            groups[c.pi].campaigns.push(c)
            if (c.format) groups[c.pi].formats.add(c.format)
            if (c.flightStart) { const s = new Date(c.flightStart); if (!groups[c.pi].earliestStart || s < groups[c.pi].earliestStart) groups[c.pi].earliestStart = s }
            if (c.flightEnd) { const e = new Date(c.flightEnd); if (!groups[c.pi].latestEnd || e > groups[c.pi].latestEnd) groups[c.pi].latestEnd = e }
        })
        return Object.values(groups).map(g => {
            const statuses = g.campaigns.map((c: Campaign) => { const s = c.flightStart ? new Date(c.flightStart) : null; const e = c.flightEnd ? new Date(c.flightEnd) : null; return getFlightStatus(s, e).id })
            let finalStatus = 'NEUTRAL'
            if (statuses.includes('ACTIVE')) finalStatus = 'ACTIVE'
            else if (statuses.includes('UPCOMING')) finalStatus = 'UPCOMING'
            else if (statuses.every((s: string) => s === 'FINISHED')) finalStatus = 'FINISHED'
            return { ...g, statusId: finalStatus, formatsList: Array.from(g.formats).join(', ') } as PIGroup
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
        active: new Set(initialCampaigns.filter(c => { const s = c.flightStart ? new Date(c.flightStart) : null; const e = c.flightEnd ? new Date(c.flightEnd) : null; return getFlightStatus(s, e).id === 'ACTIVE' }).map(c => c.pi)).size,
        finished: new Set(initialCampaigns.filter(c => { const s = c.flightStart ? new Date(c.flightStart) : null; const e = c.flightEnd ? new Date(c.flightEnd) : null; return getFlightStatus(s, e).id === 'FINISHED' }).map(c => c.pi)).size,
    }

    return (
        <>
            <div className="md:hidden">
                <MobileMonitoringExperience
                    stats={stats}
                    groups={groups}
                    search={search}
                    setSearch={setSearch}
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    router={router}
                    isPending={isPending}
                    startTransition={startTransition}
                    formats={formats}
                />
            </div>
            <div className="hidden md:block space-y-8 pb-20 animate-fade-in">
            {/* Header */}
            <header style={{ background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 8, padding: '28px 32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Title row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <Activity size={18} style={{ color: C.muted }} />
                                <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', fontFamily: 'var(--font-display)' }}>
                                    Monitoramento
                                </h1>
                            </div>
                            <p style={{ fontSize: 12, color: C.muted }}>Status de campanhas em tempo real</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <NetworkIndicator />
                            <QueueIndicator />
                        </div>
                    </div>

                    {/* Stats pills */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <StatPill label="PIs Ativos" value={stats.totalPis} />
                        <StatPill label="Formatos" value={stats.totalFormats} />
                        <StatPill label="Em Veiculação" value={stats.active} accent="green"
                            active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'all' : 'ACTIVE')} />
                        <StatPill label="Encerradas" value={stats.finished} accent="red"
                            active={statusFilter === 'FINISHED'} onClick={() => setStatusFilter(statusFilter === 'FINISHED' ? 'all' : 'FINISHED')} />
                    </div>

                    {/* Search & Filters */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
                            <input
                                type="text" placeholder="Pesquisar PI, Cliente ou Agência..." value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    width: '100%', height: 40, paddingLeft: 36, paddingRight: 36, paddingTop: 0, paddingBottom: 0,
                                    background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 6,
                                    fontSize: 13, color: C.text, fontFamily: 'var(--font-body)', outline: 'none',
                                }}
                            />
                            {search && (
                                <button onClick={() => setSearch('')}
                                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, background: C.surface, padding: '4px', borderRadius: 6, border: `0.5px solid ${C.border}` }}>
                            {[{ key: 'all' as const, icon: Globe, label: 'Todos' }, { key: 'desktop' as const, icon: Monitor, label: 'Desk' }, { key: 'mobile' as const, icon: Smartphone, label: 'Mob' }].map(({ key, icon: Icon, label }) => (
                                <button key={key} onClick={() => setActiveFilter(key)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                        background: activeFilter === key ? '#faf9f7' : 'transparent',
                                        color: activeFilter === key ? C.text : C.muted,
                                        boxShadow: activeFilter === key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                                    }}>
                                    <Icon size={13} />
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4, background: C.surface, padding: '4px', borderRadius: 6, border: `0.5px solid ${C.border}` }}>
                            {[{ key: 'all', label: 'Tudo', dot: '' },
                            { key: 'ACTIVE', label: 'Ativas', dot: '#16a34a' },
                            { key: 'UPCOMING', label: 'Espera', dot: '#b45309' },
                            { key: 'FINISHED', label: 'Fim', dot: '#ef4444' }].map(({ key, label, dot }) => (
                                <button key={key} onClick={() => setStatusFilter(key as any)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                                        background: statusFilter === key ? '#faf9f7' : 'transparent',
                                        color: statusFilter === key ? C.text : C.muted,
                                        boxShadow: statusFilter === key ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
                                    }}>
                                    {dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />}
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                {stats.visible === 0 && (
                    <div style={{ padding: '80px 20px', textAlign: 'center', border: `0.5px dashed ${C.border}`, borderRadius: 8, color: C.muted }}>
                        <Search size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                        <h2 style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Nenhuma campanha encontrada</h2>
                        <p style={{ fontSize: 13, marginBottom: 20 }}>Ajuste os filtros para ampliar a busca.</p>
                        <button onClick={() => { setSearch(''); setActiveFilter('all'); setStatusFilter('all') }}
                            className="btn-primary" style={{ padding: '8px 20px', fontSize: 12 }}>
                            Resetar Filtros
                        </button>
                    </div>
                )}
                {groups.ACTIVE.length > 0 && <PISection label="Em Veiculação" count={groups.ACTIVE.length} accentColor="#16a34a" groups={groups.ACTIVE} router={router} isPending={isPending} startTransition={startTransition} formats={formats} />}
                {groups.UPCOMING.length > 0 && <PISection label="Aguardando Período" count={groups.UPCOMING.length} accentColor="#b45309" groups={groups.UPCOMING} router={router} isPending={isPending} startTransition={startTransition} formats={formats} />}
                {groups.NEUTRAL.length > 0 && <PISection label="Fluxo Sem Período" count={groups.NEUTRAL.length} accentColor={C.muted} groups={groups.NEUTRAL} router={router} isPending={isPending} startTransition={startTransition} formats={formats} />}
                {groups.FINISHED.length > 0 && (
                    <div style={{ opacity: 0.6 }}>
                        <PISection label="Ciclo Encerrado" count={groups.FINISHED.length} accentColor="#ef4444" groups={groups.FINISHED} router={router} isPending={isPending} startTransition={startTransition} formats={formats} />
                    </div>
                )}
            </div>
            </div>
        </>
    )
}

function MobileMonitoringExperience({
    stats,
    groups,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
    statusFilter,
    setStatusFilter,
    router,
    isPending,
    startTransition,
    formats,
}: any) {
    const sections = [
        { id: 'ACTIVE', label: 'Em veiculacao', count: groups.ACTIVE.length, color: M.success, items: groups.ACTIVE },
        { id: 'UPCOMING', label: 'Aguardando', count: groups.UPCOMING.length, color: M.warning, items: groups.UPCOMING },
        { id: 'NEUTRAL', label: 'Sem periodo', count: groups.NEUTRAL.length, color: M.slate, items: groups.NEUTRAL },
        { id: 'FINISHED', label: 'Encerradas', count: groups.FINISHED.length, color: M.error, items: groups.FINISHED },
    ].filter(section => section.count > 0)

    const clearFilters = () => {
        setSearch('')
        setActiveFilter('all')
        setStatusFilter('all')
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                margin: '-24px -16px 0',
                padding: '112px 16px 140px',
                background: M.canvas,
                color: M.ink,
                animation: 'pageEnter 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
        >
            <header style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 9999, background: M.primary, boxShadow: '0 0 0 4px rgba(124,58,237,0.14)' }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: M.slate, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Nexus Monitor
                            </span>
                        </div>
                        <h1 style={{ fontSize: 32, lineHeight: 1.1, fontWeight: 600, color: M.inkDeep, letterSpacing: '-0.5px', fontFamily: 'Inter, var(--font-display)' }}>
                            Minhas campanhas
                        </h1>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                        <NetworkIndicator />
                        <QueueIndicator />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 8 }}>
                    <MobileMetricCard label="Em veiculacao" value={stats.active} tone="primary" />
                    <MobileMetricCard label="PIs" value={stats.totalPis} />
                    <MobileMetricCard label="Formatos" value={stats.totalFormats} />
                    <MobileMetricCard label="Visiveis" value={stats.visible} />
                </div>
            </header>

            <section style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                    <Search size={17} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: M.slate }} />
                    <input
                        type="text"
                        placeholder="Buscar PI, cliente ou agencia"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        style={{
                            width: '100%',
                            height: 48,
                            padding: '0 42px',
                            background: M.surface,
                            border: `1px solid ${M.hairlineStrong}`,
                            borderRadius: 8,
                            color: M.ink,
                            fontSize: 14,
                            fontWeight: 400,
                            outline: 'none',
                            fontFamily: 'Inter, var(--font-body)',
                        }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            style={{
                                position: 'absolute',
                                right: 10,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                width: 32,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: M.glass,
                                border: `1px solid ${M.hairline}`,
                                borderRadius: 8,
                                color: M.charcoal,
                            }}
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                    {[
                        { key: 'all', icon: Globe, label: 'Todos' },
                        { key: 'desktop', icon: Monitor, label: 'Desk' },
                        { key: 'mobile', icon: Smartphone, label: 'Mob' },
                    ].map(({ key, icon: Icon, label }) => (
                        <MobileFilterButton
                            key={key}
                            active={activeFilter === key}
                            onClick={() => setActiveFilter(key)}
                            icon={<Icon size={15} />}
                            label={label}
                        />
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
                    {[
                        { key: 'all', label: 'Tudo', color: M.primary },
                        { key: 'ACTIVE', label: 'Ativas', color: M.success },
                        { key: 'UPCOMING', label: 'Espera', color: M.warning },
                        { key: 'FINISHED', label: 'Fim', color: M.error },
                    ].map(item => (
                        <MobileFilterButton
                            key={item.key}
                            active={statusFilter === item.key}
                            onClick={() => setStatusFilter(item.key)}
                            dotColor={item.color}
                            label={item.label}
                        />
                    ))}
                </div>
            </section>

            <main style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 28 }}>
                {stats.visible === 0 ? (
                    <div
                        style={{
                            padding: 24,
                            border: `1px dashed ${M.hairlineStrong}`,
                            borderRadius: 12,
                            background: M.glass,
                            textAlign: 'left',
                        }}
                    >
                        <Search size={28} style={{ color: M.slate, marginBottom: 14 }} />
                        <h2 style={{ margin: 0, color: M.inkDeep, fontSize: 18, fontWeight: 600 }}>Nada encontrado</h2>
                        <p style={{ margin: '6px 0 18px', color: M.charcoal, fontSize: 14, lineHeight: 1.5 }}>A busca atual nao retornou campanhas.</p>
                        <button
                            onClick={clearFilters}
                            style={{
                                height: 40,
                                padding: '0 16px',
                                background: M.primary,
                                border: 'none',
                                borderRadius: 8,
                                color: M.inkDeep,
                                fontSize: 14,
                                fontWeight: 500,
                            }}
                        >
                            Limpar filtros
                        </button>
                    </div>
                ) : sections.map((section, sectionIndex) => (
                    <MobilePISection
                        key={section.id}
                        section={section}
                        sectionIndex={sectionIndex}
                        router={router}
                        isPending={isPending}
                        startTransition={startTransition}
                        formats={formats}
                    />
                ))}
            </main>
        </div>
    )
}

function MobileMetricCard({ label, value, tone }: { label: string; value: number; tone?: 'primary' }) {
    return (
        <div
            style={{
                minHeight: tone === 'primary' ? 96 : 76,
                padding: 16,
                borderRadius: 12,
                background: tone === 'primary' ? M.primaryMuted : M.glass,
                border: `1px solid ${tone === 'primary' ? 'rgba(124,58,237,0.28)' : M.hairline}`,
                boxShadow: tone === 'primary'
                    ? 'rgba(0,0,0,0.30) 0px 8px 24px 0px'
                    : 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
            }}
        >
            <span style={{ color: tone === 'primary' ? '#a78bfa' : M.slate, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
            <strong style={{ color: M.inkDeep, fontSize: tone === 'primary' ? 34 : 26, lineHeight: 1, fontWeight: 600, letterSpacing: '-0.5px' }}>
                {value.toString().padStart(2, '0')}
            </strong>
        </div>
    )
}

function MobileFilterButton({ active, onClick, icon, label, dotColor }: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string; dotColor?: string }) {
    return (
        <button
            onClick={onClick}
            style={{
                height: 40,
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexShrink: 0,
                background: active ? M.inkDeep : M.glass,
                color: active ? M.canvas : M.charcoal,
                border: `1px solid ${active ? M.inkDeep : M.hairline}`,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
            }}
        >
            {icon}
            {dotColor && <span style={{ width: 7, height: 7, borderRadius: 9999, background: dotColor, flexShrink: 0 }} />}
            {label}
        </button>
    )
}

function MobilePISection({ section, sectionIndex, router, isPending, startTransition, formats }: any) {
    return (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 20, borderRadius: 4, background: section.color, flexShrink: 0 }} />
                    <h2 style={{ color: M.inkDeep, fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                        {section.label}
                    </h2>
                </div>
                <span style={{ color: M.slate, fontSize: 12, fontWeight: 600 }}>{section.count} PI{section.count > 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {section.items.map((group: PIGroup, itemIndex: number) => (
                    <MobilePiCard
                        key={group.pi}
                        group={group}
                        router={router}
                        isPending={isPending}
                        startTransition={startTransition}
                        formats={formats}
                        accentColor={section.color}
                        animationDelay={(sectionIndex * 80) + (itemIndex * 60)}
                    />
                ))}
            </div>
        </section>
    )
}

function MobilePiCard({ group, router, isPending, startTransition, formats, accentColor, animationDelay }: { group: PIGroup; router: any; isPending: boolean; startTransition: any; formats: any[]; accentColor: string; animationDelay: number }) {
    const [showEditModal, setShowEditModal] = useState(false)
    const statusInfo = ({
        ACTIVE: { label: 'Ao vivo', color: M.success, bg: 'rgba(34,197,94,0.10)' },
        UPCOMING: { label: 'Espera', color: M.warning, bg: 'rgba(245,158,11,0.10)' },
        FINISHED: { label: 'Fim', color: M.error, bg: 'rgba(239,68,68,0.10)' },
        NEUTRAL: { label: 'Manual', color: M.slate, bg: M.glass },
    } as any)[group.statusId] || { label: 'Manual', color: M.slate, bg: M.glass }

    const progressPercent = useMemo(() => {
        if (!group.earliestStart || !group.latestEnd) return 0
        const start = group.earliestStart.getTime()
        const end = group.latestEnd.getTime()
        const now = Date.now()
        if (now < start) return 0
        if (now > end) return 100
        return Math.floor(((now - start) / (end - start)) * 100)
    }, [group.earliestStart, group.latestEnd])

    const handleRunBatch = () => {
        if (!confirm(`Capturar os ${group.campaigns.length} formatos desta PI?`)) return
        startTransition(async () => {
            const { runCaptureBatch } = await import('@/app/actions')
            await runCaptureBatch(group.campaigns.map((c: any) => c.id))
            router.refresh()
        })
    }

    const getFormatLabel = (formatId: string) => {
        const f = (formats as any[]).find((item: any) => item.id === formatId)
        return f ? f.label : formatId
    }

    return (
        <>
            <article
                style={{
                    opacity: 0,
                    transform: 'translateY(24px)',
                    animation: `pageEnter 0.62s cubic-bezier(0.16, 1, 0.3, 1) ${animationDelay}ms both`,
                    background: M.surface,
                    border: `1px solid ${M.hairline}`,
                    borderRadius: 12,
                    boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <span style={{ padding: '4px 8px', borderRadius: 6, background: statusInfo.bg, color: statusInfo.color, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{statusInfo.label}</span>
                                <span style={{ padding: '4px 8px', borderRadius: 6, background: M.glass, border: `1px solid ${M.hairline}`, color: M.charcoal, fontSize: 11, fontWeight: 600 }}>PI {group.pi}</span>
                            </div>
                            <h3 style={{ margin: 0, color: M.inkDeep, fontSize: 20, lineHeight: 1.2, fontWeight: 600, letterSpacing: '-0.2px' }}>
                                {group.client}
                            </h3>
                            <p style={{ margin: '6px 0 0', color: M.slate, fontSize: 13, lineHeight: 1.4 }}>{group.agency}</p>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: M.glass, border: `1px solid ${M.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.charcoal, flexShrink: 0 }}>
                            {group.device === 'mobile' ? <Smartphone size={20} /> : <Monitor size={20} />}
                        </div>
                    </div>

                    {(group.earliestStart || group.latestEnd) && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <div style={{ padding: 12, borderRadius: 8, background: M.glass, border: `1px solid ${M.hairline}` }}>
                                <span style={{ color: M.slate, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inicio</span>
                                <p style={{ margin: '6px 0 0', color: M.ink, fontSize: 14, fontWeight: 500 }}>{group.earliestStart ? formatDate(group.earliestStart, 'dd/MM/yy') : '--'}</p>
                            </div>
                            <div style={{ padding: 12, borderRadius: 8, background: M.glass, border: `1px solid ${M.hairline}` }}>
                                <span style={{ color: M.slate, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fim</span>
                                <p style={{ margin: '6px 0 0', color: M.ink, fontSize: 14, fontWeight: 500 }}>{group.latestEnd ? formatDate(group.latestEnd, 'dd/MM/yy') : '--'}</p>
                            </div>
                            <div style={{ gridColumn: '1 / -1', padding: 12, borderRadius: 8, background: M.glass, border: `1px solid ${M.hairline}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ color: M.slate, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Veiculacao</span>
                                    <span style={{ color: M.charcoal, fontSize: 12, fontWeight: 600 }}>{progressPercent}%</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${progressPercent}%`, borderRadius: 9999, background: progressPercent === 100 ? M.error : accentColor, transition: 'width 0.7s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {group.campaigns.slice(0, 4).map((campaign: any) => (
                            <button
                                key={campaign.id}
                                onClick={() => setShowEditModal(true)}
                                style={{
                                    minHeight: 44,
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 12px',
                                    background: M.glass,
                                    border: `1px solid ${M.hairline}`,
                                    borderRadius: 8,
                                    color: M.ink,
                                    textAlign: 'left',
                                }}
                            >
                                <span style={{ width: 28, height: 28, borderRadius: 8, background: M.surfaceSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', color: M.slate, flexShrink: 0 }}>
                                    {campaign.device === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}
                                </span>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getFormatLabel(campaign.format)}</span>
                                    <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: M.slate, textTransform: 'capitalize' }}>{campaign.device}</span>
                                </span>
                                {campaign.isMonitoringActive && (
                                    <Link
                                        href={`/monitoring/live/${campaign.id}`}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 6, background: 'rgba(34,197,94,0.10)', color: M.success, border: '1px solid rgba(34,197,94,0.22)', fontSize: 10, fontWeight: 600, textDecoration: 'none' }}
                                        onClick={event => event.stopPropagation()}
                                    >
                                        <Radio size={8} /> Live
                                    </Link>
                                )}
                            </button>
                        ))}
                        {group.campaigns.length > 4 && (
                            <div style={{ padding: '0 2px', color: M.slate, fontSize: 12, fontWeight: 500 }}>
                                +{group.campaigns.length - 4} formato{group.campaigns.length - 4 > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: 12, borderTop: `1px solid ${M.hairline}`, background: M.surfaceSoft }}>
                    <button
                        onClick={() => setShowEditModal(true)}
                        style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'transparent', border: `1px solid ${M.hairlineStrong}`, borderRadius: 8, color: M.ink, fontSize: 14, fontWeight: 500 }}
                    >
                        <Pencil size={15} /> Editar
                    </button>
                    <button
                        onClick={handleRunBatch}
                        disabled={isPending}
                        style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: isPending ? M.glass : M.primary, border: `1px solid ${isPending ? M.hairline : M.primary}`, borderRadius: 8, color: M.inkDeep, fontSize: 14, fontWeight: 500, opacity: isPending ? 0.72 : 1 }}
                    >
                        <Zap size={15} className="fill-current" /> Capturar
                    </button>
                </div>
            </article>
            {showEditModal && (
                <EditCampaignModal
                    campaigns={group.campaigns}
                    formats={formats}
                    onClose={() => setShowEditModal(false)}
                    onSaved={() => { setShowEditModal(false); router.refresh() }}
                />
            )}
        </>
    )
}

function StatPill({ label, value, accent, active, onClick }: { label: string, value: number, accent?: 'green' | 'red', active?: boolean, onClick?: () => void }) {
    const accentColor = accent === 'green' ? '#16a34a' : accent === 'red' ? '#ef4444' : C.text
    return (
        <div onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                background: active ? (accent === 'green' ? '#f0fdf4' : accent === 'red' ? '#fef2f2' : '#faf9f7') : C.surface,
                border: `0.5px solid ${active ? accentColor : C.border}`, borderRadius: 6,
                cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s',
            }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: active ? accentColor : C.muted }}>{label}</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: active ? accentColor : C.text, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{value.toString().padStart(2, '0')}</span>
        </div>
    )
}

function PISection({ label, count, accentColor, groups, router, isPending, startTransition, formats }: any) {
    return (
        <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: `0.5px solid ${C.border}` }}>
                <div style={{ width: 3, height: 20, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
                <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</h2>
                <div style={{ height: 1, flex: 1, background: C.border }} />
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{count} {count === 1 ? 'PI' : 'PIs'}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groups.map((group: PIGroup) => (
                    <PiCard key={group.pi} group={group} router={router} isPending={isPending} startTransition={startTransition} formats={formats} />
                ))}
            </div>
        </section>
    )
}

function PiCard({ group, router, isPending, startTransition, formats }: { group: PIGroup, router: any, isPending: boolean, startTransition: any, formats: any[] }) {
    const [showEditModal, setShowEditModal] = useState(false)
    const statusInfo = ({ ACTIVE: { label: 'Em Veiculação', color: '#16a34a', bg: '#f0fdf4' }, UPCOMING: { label: 'Aguardando', color: '#b45309', bg: '#fef3c7' }, FINISHED: { label: 'Encerrada', color: '#ef4444', bg: '#fef2f2' }, NEUTRAL: { label: 'Fluxo Manual', color: C.muted, bg: C.card } } as any)[group.statusId] || { label: 'Fluxo Manual', color: C.muted, bg: C.card }

    const progressPercent = useMemo(() => {
        if (!group.earliestStart || !group.latestEnd) return 0
        const start = group.earliestStart.getTime(), end = group.latestEnd.getTime(), now = Date.now()
        if (now < start) return 0; if (now > end) return 100
        return Math.floor(((now - start) / (end - start)) * 100)
    }, [group.earliestStart, group.latestEnd])

    const handleRunBatch = () => {
        if (!confirm(`Capturar os ${group.campaigns.length} formatos desta PI?`)) return
        startTransition(async () => {
            const { runCaptureBatch } = await import('@/app/actions')
            await runCaptureBatch(group.campaigns.map((c: any) => c.id))
            router.refresh()
        })
    }

    const getFormatLabel = (formatId: string) => {
        const f = (formats as any[]).find((f: any) => f.id === formatId)
        return f ? f.label : formatId
    }

    return (
        <>
            <div style={{
                background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 8,
                display: 'flex', flexDirection: 'column', minHeight: 300,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)', transition: 'box-shadow 0.2s',
            }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.03)')}
            >
                <div style={{ padding: '20px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Status + Client */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', background: statusInfo.bg, borderRadius: 4, width: 'fit-content' }}>
                                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: statusInfo.color }}>{statusInfo.label}</span>
                            </div>
                            <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, letterSpacing: '-0.3px', fontFamily: 'var(--font-display)' }}>{group.client}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 3, color: C.text }}>PI {group.pi}</span>
                                <span style={{ fontSize: 11, color: C.muted }}>{group.agency}</span>
                            </div>
                        </div>
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: C.surface, border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, flexShrink: 0 }}>
                            {group.device === 'mobile' ? <Smartphone size={18} /> : <Monitor size={18} />}
                        </div>
                    </div>

                    {/* Formats */}
                    <div>
                        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim, marginBottom: 6 }}>Formatos</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {group.campaigns.slice(0, 5).map((c: any) => (
                                <div key={c.id}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 5, cursor: 'pointer', transition: 'background 0.15s' }}
                                    onClick={() => setShowEditModal(true)}
                                    onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                                    onMouseLeave={e => (e.currentTarget.style.background = C.surface)}
                                >
                                    <div style={{ width: 18, height: 18, borderRadius: 3, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {c.device === 'mobile' ? <Smartphone size={9} style={{ color: C.muted }} /> : <Monitor size={9} style={{ color: C.muted }} />}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 500, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getFormatLabel(c.format)}</span>
                                    {c.isMonitoringActive && (
                                        <Link href={`/monitoring/live/${c.id}`}
                                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px', background: '#f0fdf4', border: '0.5px solid #86efac', borderRadius: 3, fontSize: 8, fontWeight: 700, color: '#16a34a', textDecoration: 'none' }}
                                            onClick={e => e.stopPropagation()}>
                                            <Radio size={7} className="animate-pulse" /> LIVE
                                        </Link>
                                    )}
                                    <Pencil size={9} style={{ color: C.dim, flexShrink: 0 }} />
                                </div>
                            ))}
                            {group.campaigns.length > 5 && <span style={{ fontSize: 10, color: C.muted, paddingLeft: 10, marginTop: 2 }}>+{group.campaigns.length - 5} outros</span>}
                        </div>
                    </div>

                    {/* Progress bar */}
                    {(group.earliestStart || group.latestEnd) && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.dim }}>Veiculação</span>
                                <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{progressPercent}%</span>
                            </div>
                            <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${progressPercent}%`, background: progressPercent === 100 ? '#ef4444' : C.text, borderRadius: 2, transition: 'width 1s' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: C.dim }}>
                                <span>{group.earliestStart ? formatDate(group.earliestStart, 'dd/MM/yy') : '—'}</span>
                                <span>{group.latestEnd ? formatDate(group.latestEnd, 'dd/MM/yy') : '—'}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ borderTop: `0.5px solid ${C.border}`, padding: '12px 20px', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <button onClick={() => setShowEditModal(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: C.muted, cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.card; (e.currentTarget as HTMLElement).style.color = C.text }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; (e.currentTarget as HTMLElement).style.color = C.muted }}
                    >
                        <Pencil size={11} /> Editar
                    </button>
                    <button onClick={handleRunBatch} disabled={isPending}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: isPending ? C.surface : C.text, border: `0.5px solid ${isPending ? C.border : C.text}`, borderRadius: 5, fontSize: 11, fontWeight: 600, color: isPending ? C.muted : '#faf9f7', cursor: isPending ? 'not-allowed' : 'pointer', transition: 'all 0.15s' }}>
                        <Zap size={11} className="fill-current" /> Capturar
                    </button>
                </div>
            </div>
            {showEditModal && (
                <EditCampaignModal campaigns={group.campaigns} formats={formats} onClose={() => setShowEditModal(false)}
                    onSaved={() => { setShowEditModal(false); router.refresh() }} />
            )}
        </>
    )
}
