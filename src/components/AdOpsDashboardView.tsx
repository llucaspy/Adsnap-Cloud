'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
    Activity, Plus, Trash2, ExternalLink, X, Loader2, Search, Pencil,
    RefreshCw, Globe, Mic, Monitor, Upload, ArrowRight,
    CheckCircle2, FileText, Zap, Clock, CalendarDays, AlertCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, differenceInDays, isPast } from 'date-fns'
import {
    saveAdOpsDashboard, deleteAdOpsDashboard, getAdOpsDashboards,
    bulkSaveAdOpsDashboards, syncIncrementalFromSheet,
    type AdOpsDashboard as DashboardType, type DashboardLink
} from '@/app/adops/actions'

/* ─── Palette ───────────────────────────────────────── */
const C = {
    bg: '#faf9f7', surface: '#f3f0ea', card: '#ede9e1',
    border: '#e8e5df', text: '#1c1917', muted: '#a89f8c', dim: '#d4cfc7',
}

const inputSt = {
    width: '100%', padding: '10px 14px', background: '#faf9f7',
    border: `0.5px solid ${C.border}`, borderRadius: 6, fontSize: 13,
    color: C.text, fontFamily: 'var(--font-body)', outline: 'none',
}

/* ─── Helpers ───────────────────────────────────────── */
function getDays(end: Date | null): number | null {
    if (!end) return null
    return differenceInDays(new Date(end), new Date())
}

function getStatusBadge(status: string | undefined, days: number | null, end: Date | null) {
    if (status === 'CONCLUIDA') return { label: 'Concluída', color: C.muted, bg: C.card }
    if (status === 'PAUSADA') return { label: 'Pausada', color: '#b45309', bg: '#fef3c7' }
    if (status === 'PROGRAMADA') return { label: 'Programada', color: '#2563eb', bg: '#eff6ff' }
    if (days === null) return { label: 'Ativa', color: '#16a34a', bg: '#f0fdf4' }
    if (end && isPast(new Date(end)) && days! < 0) return { label: 'Encerrada', color: C.muted, bg: C.surface }
    if (days === 0) return { label: 'Encerra hoje!', color: '#ef4444', bg: '#fef2f2' }
    if (days! <= 3) return { label: `${days}d restantes`, color: '#ef4444', bg: '#fef2f2' }
    return { label: 'Ativa', color: '#16a34a', bg: '#f0fdf4' }
}

function getMediaIcon(media: string | undefined) {
    switch (media) {
        case 'RADIO': return <Mic size={14} />
        case 'PAINEL': return <Monitor size={14} />
        default: return <Globe size={14} />
    }
}

/* ─── Import Modal ───────────────────────────────────── */
function ImportSpreadsheetModal({ isOpen, onClose, onRefresh }: { isOpen: boolean; onClose: () => void; onRefresh: () => void }) {
    const [csvData, setCsvData] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleImport = async () => {
        if (!csvData.trim()) return
        setLoading(true); setError(null)
        try {
            const lines = csvData.trim().split('\n')
            const isTSV = csvData.includes('\t')
            const separator = isTSV ? '\t' : ','
            const dashboards: Partial<DashboardType>[] = lines.slice(1).map(line => {
                const cols = line.split(separator)
                const parseDate = (d: string) => {
                    if (!d || d.trim() === '') return null
                    const p = d.trim().split('/')
                    if (p.length === 3) return new Date(`${p[2]}-${p[1]}-${p[0]}T12:00:00`)
                    return null
                }
                return {
                    pi: cols[0]?.trim(), mediaType: cols[1]?.trim().toUpperCase().includes('RÁDIO') ? 'RADIO' : cols[1]?.trim().toUpperCase().includes('PAINEL') ? 'PAINEL' : 'PORTAL',
                    client: cols[2]?.trim(), agency: cols[3]?.trim(), campaignName: cols[4]?.trim(),
                    flightStart: parseDate(cols[7]?.trim()), flightEnd: parseDate(cols[8]?.trim()),
                    adOpsStatus: cols[10]?.trim().toUpperCase() || 'ATIVA', links: []
                }
            }).filter(d => d.pi && d.client)
            const res = await bulkSaveAdOpsDashboards(dashboards)
            if (res.success) { onRefresh(); onClose() } else { setError(res.error || 'Erro na importação') }
        } catch { setError('Erro ao processar dados. Verifique o formato.') } finally { setLoading(false) }
    }

    if (!isOpen) return null
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                style={{ width: '100%', maxWidth: 600, background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}>
                <div style={{ padding: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                        <div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Importar Dados</h2>
                            <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Cole as linhas da planilha abaixo para atualização manual.</p>
                        </div>
                        <button onClick={onClose} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
                    </div>
                    <textarea value={csvData} onChange={e => setCsvData(e.target.value)}
                        placeholder="Cole aqui os dados..."
                        style={{ ...inputSt, height: 220, resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 }} />
                    {error && <div style={{ marginTop: 8, padding: '8px 12px', background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 5, color: '#ef4444', fontSize: 12 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        <button onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>Cancelar</button>
                        <button onClick={handleImport} disabled={loading || !csvData} className="btn-primary" style={{ flex: 1, padding: '10px 0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            {loading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

/* ─── Add / Edit Modal ────────────────────────────────── */
function AddDashboardModal({ isOpen, onClose, onRefresh, initialData }: { isOpen: boolean; onClose: () => void; onRefresh: () => void; initialData?: DashboardType | null }) {
    const [loading, setLoading] = useState(false)
    const [formData, setFormData] = useState({ client: '', campaignName: '', pi: '', mediaType: 'PORTAL', adOpsStatus: 'ATIVA', flightStart: '', flightEnd: '', links: [{ url: '', type: 'PAGO' } as DashboardLink] })

    useEffect(() => {
        if (!isOpen) return
        if (initialData) {
            setFormData({ client: initialData.client || '', campaignName: initialData.campaignName || '', pi: initialData.pi || '', mediaType: initialData.mediaType || 'PORTAL', adOpsStatus: initialData.adOpsStatus || 'ATIVA', flightStart: initialData.flightStart ? new Date(initialData.flightStart).toISOString().split('T')[0] : '', flightEnd: initialData.flightEnd ? new Date(initialData.flightEnd).toISOString().split('T')[0] : '', links: initialData.links?.length ? initialData.links as DashboardLink[] : [{ url: initialData.manualDashboardUrl || '', type: 'PAGO' }] })
        } else {
            setFormData({ client: '', campaignName: '', pi: '', mediaType: 'PORTAL', adOpsStatus: 'ATIVA', flightStart: new Date().toISOString().split('T')[0], flightEnd: '', links: [{ url: '', type: 'PAGO' }] })
        }
    }, [isOpen, initialData])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setLoading(true)
        const res = await saveAdOpsDashboard({ id: initialData?.id, ...formData, flightStart: formData.flightStart ? new Date(`${formData.flightStart}T12:00:00`) : null, flightEnd: formData.flightEnd ? new Date(`${formData.flightEnd}T12:00:00`) : null, links: formData.links as DashboardLink[] })
        setLoading(false); if (res.success) { onRefresh(); onClose() }
    }

    if (!isOpen) return null
    const labelSt = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: C.muted, display: 'block', marginBottom: 4 }
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                style={{ width: '100%', maxWidth: 480, background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 12, boxShadow: '0 24px 64px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                <div style={{ padding: 28 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{initialData ? 'Editar' : 'Novo'} Dashboard</h2>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted }}><X size={18} /></button>
                    </div>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={labelSt}>PI</label><input required value={formData.pi} onChange={e => setFormData(p => ({ ...p, pi: e.target.value }))} style={inputSt} /></div>
                            <div><label style={labelSt}>Meio</label>
                                <select value={formData.mediaType} onChange={e => setFormData(p => ({ ...p, mediaType: e.target.value }))} style={inputSt}>
                                    <option value="PORTAL">PORTAL</option><option value="RADIO">RÁDIO</option><option value="PAINEL">PAINEL</option>
                                </select>
                            </div>
                        </div>
                        <div><label style={labelSt}>Cliente</label><input required value={formData.client} onChange={e => setFormData(p => ({ ...p, client: e.target.value }))} style={inputSt} /></div>
                        <div><label style={labelSt}>Campanha</label><input required value={formData.campaignName} onChange={e => setFormData(p => ({ ...p, campaignName: e.target.value }))} style={inputSt} /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div><label style={labelSt}>Data Início</label><input required type="date" value={formData.flightStart} onChange={e => setFormData(p => ({ ...p, flightStart: e.target.value }))} style={inputSt} /></div>
                            <div><label style={labelSt}>Data Fim</label><input required type="date" value={formData.flightEnd} onChange={e => setFormData(p => ({ ...p, flightEnd: e.target.value }))} style={inputSt} /></div>
                        </div>
                        <div><label style={labelSt}>Link Principal</label>
                            <input type="url" value={formData.links[0]?.url} onChange={e => { const ls = [...formData.links]; ls[0] = { ...ls[0], url: e.target.value, type: 'PAGO' as const }; setFormData(p => ({ ...p, links: ls })) }} style={inputSt} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button type="button" onClick={onClose} className="btn-ghost" style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>Cancelar</button>
                            <button type="submit" disabled={loading} className="btn-primary" style={{ flex: 1, padding: '10px 0', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {loading && <Loader2 size={14} className="animate-spin" />} Salvar
                            </button>
                        </div>
                    </form>
                </div>
            </motion.div>
        </div>
    )
}

/* ─── Campaign Card ────────────────────────────────────── */
function CampaignCard({ item, onDelete, onEdit, isCompact = false }: { item: DashboardType; onDelete: (id: string) => void; onEdit: (item: DashboardType) => void; isCompact?: boolean }) {
    const days = getDays(item.flightEnd)
    const badge = getStatusBadge(item.adOpsStatus, days, item.flightEnd)
    const progress = useMemo(() => {
        if (!item.flightStart || !item.flightEnd) return 0
        const s = new Date(item.flightStart).getTime(), e = new Date(item.flightEnd).getTime(), n = Date.now()
        return Math.max(0, Math.min(100, ((n - s) / (e - s)) * 100))
    }, [item.flightStart, item.flightEnd])

    if (isCompact) {
        return (
            <motion.div layout
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 8, minWidth: 260, cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onClick={() => item.links?.[0]?.url && window.open(item.links[0].url, '_blank')}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
            >
                <div style={{ width: 32, height: 32, borderRadius: 6, background: C.surface, border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, flexShrink: 0 }}>
                    {getMediaIcon(item.mediaType)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.client}</p>
                    <h4 style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.campaignName}</h4>
                </div>
                <div style={{ padding: '2px 8px', background: badge.bg, borderRadius: 4, fontSize: 9, fontWeight: 700, color: badge.color, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{badge.label}</div>
            </motion.div>
        )
    }

    return (
        <motion.div layout
            style={{ background: '#faf9f7', border: `0.5px solid ${item.adOpsStatus === 'CONCLUIDA' ? C.dim : C.border}`, borderRadius: 8, padding: 20, transition: 'box-shadow 0.2s', opacity: item.adOpsStatus === 'CONCLUIDA' ? 0.65 : 1 }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: C.surface, border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, flexShrink: 0 }}>
                        {getMediaIcon(item.mediaType)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <p style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.client}</p>
                            <span style={{ padding: '1px 6px', background: badge.bg, color: badge.color, fontSize: 9, fontWeight: 700, borderRadius: 3, textTransform: 'uppercase' }}>{badge.label}</span>
                        </div>
                        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.campaignName}</h3>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <button onClick={() => onEdit(item)} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                        <Pencil size={13} />
                    </button>
                    <button onClick={() => onDelete(item.id)} style={{ padding: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.muted, borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, color: C.muted, background: C.surface, border: `0.5px solid ${C.border}`, padding: '3px 8px', borderRadius: 4 }}>
                    <FileText size={10} /> PI {item.pi}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: C.muted }}>
                    <span>{item.flightStart ? format(new Date(item.flightStart), 'dd/MM/yy') : '--'}</span>
                    <ArrowRight size={10} style={{ color: C.dim }} />
                    <span>{item.flightEnd ? format(new Date(item.flightEnd), 'dd/MM/yy') : '--'}</span>
                </div>
            </div>
            <div style={{ height: 4, background: C.surface, borderRadius: 2, overflow: 'hidden', marginBottom: 16 }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }}
                    style={{ height: '100%', background: item.adOpsStatus === 'CONCLUIDA' ? C.dim : C.text, borderRadius: 2 }} />
            </div>
            {item.links && item.links.length > 0 ? (
                <a href={item.links[0].url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '9px 0', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: C.muted, textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.text; (e.currentTarget as HTMLElement).style.color = '#faf9f7' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = C.surface; (e.currentTarget as HTMLElement).style.color = C.muted }}>
                    <ExternalLink size={13} /> Abrir Dashboard
                </a>
            ) : (
                <div style={{ padding: '9px 0', border: `0.5px dashed ${C.border}`, borderRadius: 6, textAlign: 'center', fontSize: 11, color: C.dim }}>Sem Links</div>
            )}
        </motion.div>
    )
}

/* ─── Main View ─────────────────────────────────────────── */
export default function AdOpsDashboardView({ stats: initialStats }: { stats: { total: number; campaigns: DashboardType[] } }) {
    const [dashboards, setDashboards] = useState<DashboardType[]>(initialStats.campaigns || [])
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [editingDashboard, setEditingDashboard] = useState<DashboardType | null>(null)
    const [search, setSearch] = useState('')
    const [activeTab, setActiveTab] = useState<'TUDO' | 'PORTAL' | 'RADIO' | 'PAINEL'>('TUDO')
    const PERIODS = useMemo(() => ['07/25', '08/25', '09/25', '10/25', '11/25', '12/25', '01/26', '02/26', '03/26'], [])
    const [activePeriod, setActivePeriod] = useState<string>(() => { const cur = format(new Date(), 'MM/yy'); return PERIODS.includes(cur) ? cur : '07/25' })
    const [isSyncing, setIsSyncing] = useState(false)
    const [lastSync, setLastSync] = useState<Date | null>(null)

    const refresh = useCallback(async () => { setDashboards(await getAdOpsDashboards()) }, [])
    const handleDelete = useCallback(async (id: string) => { if (confirm('Deletar este dashboard?')) { const res = await deleteAdOpsDashboard(id); if (res.success) refresh() } }, [refresh])
    const handleSync = useCallback(async () => {
        setIsSyncing(true)
        const res = await syncIncrementalFromSheet(activePeriod)
        if (res.success) { await refresh(); setLastSync(new Date()); alert(`Sincronia concluída para ${activePeriod}:\n+${res.inserted} novos\n~${res.updated} atualizados\n=${res.unchanged} sem mudança`) }
        else { alert('Erro na sincronia: ' + res.error) }
        setIsSyncing(false)
    }, [refresh, activePeriod])

    const priorityItems = useMemo(() => dashboards.filter(d => { const days = getDays(d.flightEnd); return days !== null && days >= 0 && days <= 10 && d.adOpsStatus !== 'CONCLUIDA' }).sort((a, b) => (getDays(a.flightEnd) || 0) - (getDays(b.flightEnd) || 0)), [dashboards])
    const filtered = useMemo(() => dashboards.filter(d => {
        const matchesSearch = !search || d.client.toLowerCase().includes(search.toLowerCase()) || d.campaignName.toLowerCase().includes(search.toLowerCase()) || d.pi.includes(search)
        const matchesTab = activeTab === 'TUDO' || d.mediaType === activeTab
        const matchesPeriod = !d.flightStart || format(new Date(d.flightStart), 'MM/yy') === activePeriod
        const isFinished = d.adOpsStatus === 'CONCLUIDA' || (d.flightEnd && isPast(new Date(d.flightEnd)) && differenceInDays(new Date(), new Date(d.flightEnd)) > 1)
        return matchesSearch && matchesTab && matchesPeriod && !isFinished
    }), [dashboards, search, activeTab, activePeriod])

    const stats = useMemo(() => ({
        totalInPeriod: filtered.length,
        total: dashboards.length,
        ativas: dashboards.filter(d => ['ATIVA', 'PROGRAMADA'].includes(d.adOpsStatus || '')).length,
        atrasadas: dashboards.filter(d => {
            const days = getDays(d.flightEnd)
            return d.adOpsStatus !== 'CONCLUIDA' && days !== null && days < 0
        }).length,
        hoje: dashboards.filter(d => {
            const days = getDays(d.flightEnd)
            return days === 0
        }).length,
        portal: dashboards.filter(d => d.mediaType === 'PORTAL').length,
        radio: dashboards.filter(d => d.mediaType === 'RADIO').length,
        painel: dashboards.filter(d => d.mediaType === 'PAINEL').length,
    }), [dashboards, filtered])

    return (
        <div style={{ paddingBottom: 80 }}>
            {/* Header */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 32 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, marginBottom: 6 }}>
                        <Activity size={13} /> ADOPS HUB COMMAND
                    </div>
                    <h1 style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', fontFamily: 'var(--font-display)' }}>Visão de Comando</h1>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                        <MiniKpi label="Ativas" value={stats.ativas} color="#16a34a" />
                        <MiniKpi label="Atrasadas" value={stats.atrasadas} color="#ef4444" />
                        <MiniKpi label="Encerram Hoje" value={stats.hoje} color="#f59e0b" />
                        <MiniKpi label="Total" value={stats.total} color={C.text} />
                    </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
                        <input type="text" placeholder="Buscar PI ou Cliente..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ ...inputSt, paddingLeft: 30, height: 38, width: 220, fontSize: 12 }} />
                    </div>
                    <button onClick={handleSync} disabled={isSyncing}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 38, background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, color: C.muted, cursor: 'pointer' }}>
                        {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sincronizar
                    </button>
                    <button onClick={() => { setEditingDashboard(null); setIsAddModalOpen(true) }} className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 38, fontSize: 12 }}>
                        <Plus size={14} /> Novo
                    </button>
                </div>
            </div>

            {/* Priority row */}
            {priorityItems.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#ef4444', marginBottom: 12 }}>
                        <AlertCircle size={12} /> Prioridade Máxima — Encerram em breve
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                        <AnimatePresence>
                            {priorityItems.map(item => (
                                <CampaignCard key={item.id} item={item} onDelete={handleDelete} onEdit={i => { setEditingDashboard(i); setIsAddModalOpen(true) }} isCompact />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            {/* Period selector */}
            <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.muted, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <CalendarDays size={12} /> Período Ativo
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {PERIODS.map(p => (
                        <button key={p} onClick={() => setActivePeriod(p)}
                            style={{ padding: '5px 12px', borderRadius: 5, border: `0.5px solid ${activePeriod === p ? C.text : C.border}`, background: activePeriod === p ? C.text : '#faf9f7', color: activePeriod === p ? '#faf9f7' : C.muted, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab filters */}
            <div style={{ display: 'flex', gap: 4, background: C.surface, padding: 4, borderRadius: 6, border: `0.5px solid ${C.border}`, width: 'fit-content', marginBottom: 24 }}>
                {(['TUDO', 'PORTAL', 'RADIO', 'PAINEL'] as const).map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        style={{ padding: '6px 16px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s', background: activeTab === t ? '#faf9f7' : 'transparent', color: activeTab === t ? C.text : C.muted, boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.06)' : 'none' }}>
                        {t}
                    </button>
                ))}
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <AnimatePresence mode="popLayout">
                    {filtered.length > 0 ? filtered.map(item => (
                        <CampaignCard key={item.id} item={item} onDelete={handleDelete} onEdit={i => { setEditingDashboard(i); setIsAddModalOpen(true) }} />
                    )) : (
                        <div className="col-span-full" style={{ padding: '80px 20px', textAlign: 'center', border: `0.5px dashed ${C.border}`, borderRadius: 8, color: C.muted }}>
                            <Zap size={36} style={{ margin: '0 auto 12px', opacity: 0.25 }} />
                            <p style={{ fontSize: 13, fontWeight: 500 }}>Aguardando novas campanhas para {activePeriod}</p>
                        </div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, paddingTop: 32, marginTop: 32, borderTop: `0.5px solid ${C.border}` }}>
                {[
                    { label: 'Status Hub', value: isSyncing ? 'Sincronizando...' : 'Conectado', icon: Zap },
                    { label: 'Em Veiculação', value: filtered.length, icon: Activity },
                    { label: 'Base de Dados', value: stats.total, icon: CheckCircle2 },
                    { label: 'Última Sincronia', value: lastSync ? format(lastSync, 'HH:mm:ss') : '—', icon: Clock },
                ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: '#faf9f7', border: `0.5px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
                            <s.icon size={15} />
                        </div>
                        <div>
                            <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: C.dim }}>{s.label}</p>
                            <p style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            <AddDashboardModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onRefresh={refresh} initialData={editingDashboard} />
            <ImportSpreadsheetModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onRefresh={refresh} />
        </div>
    )
}

function MiniKpi({ label, value, color }: { label: string, value: number, color: string }) {
    return (
        <div style={{ padding: '12px 16px', background: '#faf9f7', border: `0.5px solid ${C.border}`, borderRadius: 8 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 20, fontWeight: 800, color }}>{value}</p>
        </div>
    )
}
