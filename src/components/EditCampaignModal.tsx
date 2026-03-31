'use client'

import React, { useState, useTransition } from 'react'
import { X, Globe, Monitor, Smartphone, Layers, ChevronDown, ChevronUp, Save, Calendar, Building2, User2, Hash, Loader2, Plus, Trash2, Activity } from 'lucide-react'
import { updateCampaign, addFormatToCampaign, deleteCampaign } from '@/app/actions'

interface EditCampaignModalProps {
    campaigns: any[] // These are joined with PI, complex to type here without shared types
    formats: Array<{id: string, label: string, width: number, height: number}>
    onClose: () => void
    onSaved: () => void
}

interface FormatEntry {
    _id: string           // internal tracking id
    _isNew: boolean       // true if this is a new format to be created
    _isDeleted: boolean   // true if marked for deletion
    id: string            // campaign id (empty for new)
    url: string
    device: string
    format: string
    flightStart: string
    flightEnd: string
    externalAuthUrl: string
    externalCampaignId: string
    isMonitoringActive: boolean
    dailyGoalThreshold: number | null
    externalChannelId: string
    isMultiChannel: boolean
    allowedChannels: string
}

export function EditCampaignModal({ campaigns, formats, onClose, onSaved }: EditCampaignModalProps) {
    const [isPending, startTransition] = useTransition()
    const firstCampaign = campaigns[0] || {}

    // Shared fields (same for all formats in the PI)
    const allChannels = campaigns.map(c => c.externalChannelId || '').filter(Boolean)
    const uniqueChannels = Array.from(new Set(allChannels))
    const isInitiallyGlobal = uniqueChannels.length === 1 && allChannels.length > 0
    
    const [shared, setShared] = useState({
        agency: firstCampaign.agency || '',
        client: firstCampaign.client || '',
        campaignName: firstCampaign.campaignName || '',
        pi: firstCampaign.pi || '',
        segmentation: firstCampaign.segmentation || 'PRIVADO',
        isScheduled: firstCampaign.isScheduled || false,
        scheduledTimes: firstCampaign.scheduledTimes || '[]',
        manualDashboardUrl: firstCampaign.manualDashboardUrl || '',
        showOnDashboard: firstCampaign.showOnDashboard !== false, // default to true
        useGlobalChannel: isInitiallyGlobal,
        globalChannelId: isInitiallyGlobal ? uniqueChannels[0] : (firstCampaign.externalChannelId || ''),
    })


    // Format entries - one per campaign
    const [entries, setEntries] = useState<FormatEntry[]>(
        campaigns.map(c => ({
            _id: c.id,
            _isNew: false,
            _isDeleted: false,
            id: c.id,
            url: c.url || '',
            device: c.device || 'desktop',
            format: c.format || '',
            flightStart: c.flightStart ? new Date(c.flightStart).toISOString().slice(0, 10) : '',
            flightEnd: c.flightEnd ? new Date(c.flightEnd).toISOString().slice(0, 10) : '',
            externalAuthUrl: c.externalAuthUrl || '',
            externalCampaignId: c.externalCampaignId || '',
            isMonitoringActive: c.isMonitoringActive || false,
            dailyGoalThreshold: c.dailyGoalThreshold || null,
            externalChannelId: c.externalChannelId || '',
            isMultiChannel: c.isMultiChannel || false,
            allowedChannels: c.allowedChannels || '[]',
        }))
    )

    const [expandedIndex, setExpandedIndex] = useState<number | null>(0)

    const updateShared = (fields: Partial<typeof shared>) => setShared(prev => ({ ...prev, ...fields }))

    const updateEntry = (index: number, fields: Partial<FormatEntry>) => {
        setEntries(prev => prev.map((e, i) => i === index ? { ...e, ...fields } : e))
    }

    const addNewFormat = () => {
        const newEntry: FormatEntry = {
            _id: `new-${Date.now()}`,
            _isNew: true,
            _isDeleted: false,
            id: '',
            url: entries[0]?.url || '',
            device: entries[0]?.device || 'desktop',
            format: '',
            flightStart: entries[0]?.flightStart || '',
            flightEnd: entries[0]?.flightEnd || '',
            externalAuthUrl: entries[0]?.externalAuthUrl || '',
            externalCampaignId: entries[0]?.externalCampaignId || '',
            isMonitoringActive: entries[0]?.isMonitoringActive || false,
            dailyGoalThreshold: entries[0]?.dailyGoalThreshold || null,
            externalChannelId: entries[0]?.externalChannelId || '',
            isMultiChannel: entries[0]?.isMultiChannel || false,
            allowedChannels: entries[0]?.allowedChannels || '[]',
        }
        setEntries(prev => [...prev, newEntry])
        setExpandedIndex(entries.length)
    }

    const markForDeletion = (index: number) => {
        const entry = entries[index]
        if (entry._isNew) {
            // Just remove it from the list
            setEntries(prev => prev.filter((_, i) => i !== index))
        } else {
            if (!confirm('Tem certeza que deseja excluir este formato?')) return
            setEntries(prev => prev.map((e, i) => i === index ? { ...e, _isDeleted: true } : e))
        }
    }

    const getFormatLabel = (formatId: string) => {
        const fmt = formats.find(f => f.id === formatId)
        return fmt ? `${fmt.label} (${fmt.width}x${fmt.height})` : formatId || 'Novo formato'
    }

    const handleSaveAll = () => {
        startTransition(async () => {
            try {
                // 1. Delete removed formats
                for (const entry of entries.filter(e => e._isDeleted && !e._isNew)) {
                    await deleteCampaign(entry.id)
                }

                // 2. Update existing formats
                for (const entry of entries.filter(e => !e._isNew && !e._isDeleted)) {
                    const data = new FormData()
                    data.append('agency', shared.agency)
                    data.append('client', shared.client)
                    data.append('campaignName', shared.campaignName)
                    data.append('pi', shared.pi)
                    data.append('segmentation', shared.segmentation)
                    data.append('url', entry.url)
                    data.append('device', entry.device)
                    data.append('format', entry.format)
                    data.append('flightStart', entry.flightStart)
                    data.append('flightEnd', entry.flightEnd)
                    data.append('externalAuthUrl', entry.externalAuthUrl)
                    data.append('externalCampaignId', entry.externalCampaignId)
                    
                    // Channel logic: Global vs Individual
                    const finalChannel = shared.useGlobalChannel ? shared.globalChannelId : entry.externalChannelId
                    data.append('externalChannelId', finalChannel)
                    
                    data.append('isMonitoringActive', entry.isMonitoringActive.toString())
                    data.append('manualDashboardUrl', shared.manualDashboardUrl || '')
                    data.append('isScheduled', shared.isScheduled.toString())
                    data.append('scheduledTimes', shared.scheduledTimes)
                    data.append('showOnDashboard', shared.showOnDashboard.toString())
                    data.append('isMultiChannel', entry.isMultiChannel.toString())
                    data.append('allowedChannels', entry.allowedChannels)
                    if (entry.dailyGoalThreshold) data.append('dailyGoalThreshold', entry.dailyGoalThreshold.toString())
                    await updateCampaign(entry.id, data)
                }

                // 3. Create new formats
                for (const entry of entries.filter(e => e._isNew && !e._isDeleted)) {
                    const finalChannel = shared.useGlobalChannel ? shared.globalChannelId : entry.externalChannelId
                    await addFormatToCampaign({
                        agency: shared.agency,
                        client: shared.client,
                        campaignName: shared.campaignName,
                        pi: shared.pi,
                        segmentation: shared.segmentation,
                        url: entry.url,
                        device: entry.device,
                        format: entry.format,
                        flightStart: entry.flightStart || null,
                        flightEnd: entry.flightEnd || null,
                        isScheduled: shared.isScheduled,
                        scheduledTimes: shared.scheduledTimes,
                        externalAuthUrl: entry.externalAuthUrl,
                        externalCampaignId: entry.externalCampaignId,
                        externalChannelId: finalChannel,
                        isMonitoringActive: entry.isMonitoringActive,
                        manualDashboardUrl: shared.manualDashboardUrl || null,
                        dailyGoalThreshold: entry.dailyGoalThreshold,
                        showOnDashboard: shared.showOnDashboard,
                        isMultiChannel: entry.isMultiChannel,
                        allowedChannels: entry.allowedChannels,
                    } as any)
                }


                onSaved()
            } catch (err) {
                alert('Erro ao salvar: ' + (err as Error).message)
            }
        })
    }

    const activeEntries = entries.filter(e => !e._isDeleted)
    const deletedCount = entries.filter(e => e._isDeleted).length

    return (
        <div
            className="fixed inset-0 z-9999 flex items-center justify-center p-4 animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 shadow-2xl animate-slide-up"
                style={{ background: 'var(--bg-secondary, #0f0f14)' }}
            >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 border-b border-white/5"
                    style={{ background: 'var(--bg-secondary, #0f0f14)' }}
                >
                    <div>
                        <h2 className="text-xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                            Editar <span className="text-gradient">PI {shared.pi}</span>
                        </h2>
                        <p className="text-xs text-white/30 mt-0.5">
                            {activeEntries.length} formato{activeEntries.length !== 1 ? 's' : ''} • {shared.client}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-8 space-y-6">
                    {/* Shared Fields */}
                    <div className="grid grid-cols-2 gap-4">
                        <FieldBlock label="Agência" icon={Building2}>
                            <input
                                type="text"
                                value={shared.agency}
                                onChange={e => updateShared({ agency: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                        <FieldBlock label="Cliente" icon={User2}>
                            <input
                                type="text"
                                value={shared.client}
                                onChange={e => updateShared({ client: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FieldBlock label="Nome da Campanha" icon={Hash}>
                            <input
                                type="text"
                                value={shared.campaignName}
                                onChange={e => updateShared({ campaignName: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                        <FieldBlock label="PI" icon={Hash}>
                            <input
                                type="text"
                                value={shared.pi}
                                onChange={e => updateShared({ pi: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                    </div>

                    <FieldBlock label="Link do Dashboard Manual (Global)" icon={Globe}>
                        <input
                            type="url"
                            value={shared.manualDashboardUrl}
                            onChange={e => updateShared({ manualDashboardUrl: e.target.value })}
                            className="modal-input"
                            placeholder="https://exemplo.com/dash"
                        />
                    </FieldBlock>
                    
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                                <Activity className="text-indigo-400" size={20} />
                            </div>
                            <div>
                                <p className="text-xs font-black text-white uppercase tracking-widest">Exibir no Dashboard de AdOps</p>
                                <p className="text-[10px] text-white/30 font-medium">Define se esta PI aparecerá na visão geral de performance.</p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                checked={shared.showOnDashboard}
                                onChange={e => updateShared({ showOnDashboard: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                        </label>
                    </div>

                    {/* Channel Selection Toggle */}
                    <div className="border-t border-white/5 pt-4 space-y-4">
                         <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-black text-white uppercase tracking-widest">Configuração de Canais</p>
                                <p className="text-[10px] text-white/30 font-medium">Usar um único canal para todos os formatos ou individual?</p>
                            </div>
                            <div className="flex p-1 rounded-xl bg-white/5 border border-white/10">
                                <button
                                    onClick={() => updateShared({ useGlobalChannel: true })}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${shared.useGlobalChannel ? 'bg-accent text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
                                >
                                    Global
                                </button>
                                <button
                                    onClick={() => updateShared({ useGlobalChannel: false })}
                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-tighter transition-all ${!shared.useGlobalChannel ? 'bg-accent text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
                                >
                                    Por Formato
                                </button>
                            </div>
                        </div>

                        {shared.useGlobalChannel && (
                             <FieldBlock label="ID Canal 00px (Global)" icon={Layers}>
                                <input
                                    type="text"
                                    value={shared.globalChannelId}
                                    onChange={e => updateShared({ globalChannelId: e.target.value })}
                                    className="modal-input"
                                    placeholder="Ex: 81848"
                                />
                                <p className="text-[9px] text-accent/50 mt-1 uppercase font-bold tracking-tight">Este ID será aplicado a todos os formatos desta PI.</p>
                             </FieldBlock>
                        )}
                    </div>


                    {/* Formats Section */}
                    <div className="border-t border-white/5 pt-4">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                                Formatos ({activeEntries.length})
                            </span>
                            <button
                                onClick={addNewFormat}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition-all"
                            >
                                <Plus size={12} /> Adicionar Formato
                            </button>
                        </div>

                        <div className="space-y-2">
                            {entries.map((entry, index) => {
                                if (entry._isDeleted) return null
                                const isExpanded = expandedIndex === index

                                return (
                                    <div
                                        key={entry._id}
                                        className={`rounded-xl border transition-all ${entry._isNew
                                            ? 'border-accent/30 bg-accent/3'
                                            : 'border-white/6 bg-white/2'
                                            } ${isExpanded ? 'shadow-lg' : ''}`}
                                    >
                                        {/* Format Header (always visible) */}
                                         <div
                                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors rounded-xl"
                                            onClick={() => setExpandedIndex(isExpanded ? null : index)}
                                        >
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-accent/10">
                                                {entry.device === 'mobile'
                                                    ? <Smartphone size={12} className="text-accent/70" />
                                                    : <Monitor size={12} className="text-accent/70" />
                                                }
                                            </div>
                                            <span className="text-sm font-medium text-white/70 flex-1 truncate">
                                                {getFormatLabel(entry.format)}
                                            </span>
                                            {entry._isNew && (
                                                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-accent/15 text-accent border border-accent/20">
                                                    Novo
                                                </span>
                                            )}
                                            <button
                                                onClick={(e) => { e.stopPropagation(); markForDeletion(index) }}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white/15 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                                title="Remover formato"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                             {isExpanded
                                                ? <ChevronUp size={14} className="text-white/20 shrink-0" />
                                                : <ChevronDown size={14} className="text-white/20 shrink-0" />
                                            }
                                        </div>

                                        {/* Expanded Fields */}
                                        {isExpanded && (
                                            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/[0.04]">
                                                {/* URL */}
                                                <FieldBlock label="URL Alvo" icon={Globe}>
                                                    <input
                                                        type="text"
                                                        value={entry.url}
                                                        onChange={e => updateEntry(index, { url: e.target.value })}
                                                        className="modal-input"
                                                        placeholder="https://..."
                                                    />
                                                </FieldBlock>

                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* Device */}
                                                    <FieldBlock label="Dispositivo" icon={Monitor}>
                                                        <div className="flex gap-2 p-1.5 rounded-xl" style={{ background: 'var(--bg-tertiary, #1a1a24)' }}>
                                                            <button
                                                                onClick={() => updateEntry(index, { device: 'desktop' })}
                                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${entry.device === 'desktop' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                                            >
                                                                <Monitor size={14} /> Desktop
                                                            </button>
                                                            <button
                                                                onClick={() => updateEntry(index, { device: 'mobile' })}
                                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${entry.device === 'mobile' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                                            >
                                                                <Smartphone size={14} /> Mobile
                                                            </button>
                                                        </div>
                                                    </FieldBlock>

                                                    {/* Format */}
                                                    <FieldBlock label="Formato" icon={Layers}>
                                                        <div className="relative">
                                                            <select
                                                                value={entry.format}
                                                                onChange={e => updateEntry(index, { format: e.target.value })}
                                                                className="modal-input appearance-none pr-10"
                                                            >
                                                                <option value="">Selecione...</option>
                                                                 {formats.map(fmt => (
                                                                    <option key={fmt.id} value={fmt.id}>
                                                                        {fmt.label} ({fmt.width}x{fmt.height})
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={16} />
                                                        </div>
                                                    </FieldBlock>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <FieldBlock label="Data Início" icon={Calendar}>
                                                        <input
                                                            type="date"
                                                            value={entry.flightStart}
                                                            onChange={e => updateEntry(index, { flightStart: e.target.value })}
                                                            className="modal-input"
                                                        />
                                                    </FieldBlock>
                                                    <FieldBlock label="Data Fim" icon={Calendar}>
                                                        <input
                                                            type="date"
                                                            value={entry.flightEnd}
                                                            onChange={e => updateEntry(index, { flightEnd: e.target.value })}
                                                            className="modal-input"
                                                        />
                                                    </FieldBlock>
                                                </div>

                                                <div className="border-t border-white/5 pt-4 space-y-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black uppercase tracking-wider text-accent">Monitoramento Live (00px)</span>
                                                        <label className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={entry.isMonitoringActive}
                                                                onChange={e => updateEntry(index, { isMonitoringActive: e.target.checked })}
                                                                className="sr-only peer"
                                                            />
                                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white/40 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
                                                        </label>
                                                    </div>

                                                    {entry.isMonitoringActive && (
                                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                                            <FieldBlock label="Link Auth 00px" icon={Globe}>
                                                                <input
                                                                    type="text"
                                                                    value={entry.externalAuthUrl}
                                                                    onChange={e => updateEntry(index, { externalAuthUrl: e.target.value })}
                                                                    className="modal-input"
                                                                    placeholder="https://graphql.00px.com.br/auth/..."
                                                                />
                                                            </FieldBlock>
                                                            <FieldBlock label="ID Campanha 00px" icon={Hash}>
                                                                <input
                                                                    type="text"
                                                                    value={entry.externalCampaignId}
                                                                    onChange={e => updateEntry(index, { externalCampaignId: e.target.value })}
                                                                    className="modal-input"
                                                                    placeholder="Ex: 6988"
                                                                />
                                                            </FieldBlock>
                                                            {!shared.useGlobalChannel && (
                                                                <FieldBlock label="ID Canal 00px (Individual)" icon={Layers}>
                                                                    <input
                                                                        type="text"
                                                                        value={entry.externalChannelId}
                                                                        onChange={e => updateEntry(index, { externalChannelId: e.target.value })}
                                                                        className="modal-input"
                                                                        placeholder="Ex: 81848"
                                                                    />
                                                                </FieldBlock>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                
                                            <div className="border-t border-white/5 pt-4">
                                                <FieldBlock label="Meta Diária de Impressões (Alerta)" icon={Hash}>
                                                    <input
                                                        type="number"
                                                        value={entry.dailyGoalThreshold || ''}
                                                        onChange={e => updateEntry(index, { dailyGoalThreshold: e.target.value ? Number(e.target.value) : null })}
                                                        className="modal-input"
                                                        placeholder="Ex: 30000"
                                                    />
                                                    <p className="text-[9px] text-white/20 mt-1 uppercase tracking-tight">O Nexus avisará no Telegram ao atingir 90% e 100% dessa entrega.</p>
                                                </FieldBlock>
                                            </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>

                    {/* Deleted items notice */}
                    {deletedCount > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/15">
                            <Trash2 size={14} className="text-red-400/60" />
                            <span className="text-xs text-red-400/70 font-medium">
                                {deletedCount} formato{deletedCount !== 1 ? 's' : ''} será{deletedCount !== 1 ? 'ão' : ''} excluído{deletedCount !== 1 ? 's' : ''} ao salvar
                            </span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={onClose}
                            disabled={isPending}
                            className="flex-1 py-4 rounded-xl border border-white/10 bg-white/5 text-white/50 font-bold text-sm hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={isPending}
                            className="flex-1 py-4 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: 'var(--gradient-primary)' }}
                        >
                            {isPending ? (
                                <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                            ) : (
                                <><Save size={18} /> Salvar Tudo</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .modal-input {
                    width: 100%;
                    padding: 0.75rem 1rem;
                    border-radius: 0.75rem;
                    background: var(--bg-tertiary, #1a1a24);
                    border: 1px solid rgba(255,255,255,0.08);
                    color: var(--text-primary, white);
                    font-size: 0.875rem;
                    font-weight: 500;
                    outline: none;
                    transition: all 0.2s;
                }
                .modal-input:focus {
                    border-color: var(--accent, #a855f7);
                    box-shadow: 0 0 0 3px rgba(255,255,255,0.08);
                }
                .modal-input::placeholder {
                    color: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    )
}

function FieldBlock({ label, icon: Icon, children }: { label: string, icon: React.ElementType, children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">
                <Icon size={12} />
                {label}
            </label>
            {children}
        </div>
    )
}
