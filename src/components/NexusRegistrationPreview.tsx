'use client'

import { useState } from 'react'
import { X, Check, AlertCircle, Plus, Trash2, Edit2, Save, Sparkles, Building2, User2, Hash, Globe, Calendar, Layout, Shield } from 'lucide-react'
import { bulkCreateCampaigns } from '@/app/actions'

interface ParsedCampaign {
    id: string
    agency: string
    client: string
    pi: string
    url: string
    format: string
    campaignName: string
    segmentation: string
    flightStart?: string
    flightEnd?: string
}

interface NexusRegistrationPreviewProps {
    campaigns: Partial<ParsedCampaign>[]
    onClose: () => void
    onConfirm: (count: number) => void
}

export function NexusRegistrationPreview({ campaigns: initialCampaigns, onClose, onConfirm }: NexusRegistrationPreviewProps) {
    const [data, setData] = useState<Partial<ParsedCampaign>[]>(
        initialCampaigns.map((c, i) => ({
            ...c,
            id: `temp-${i}`,
            agency: c.agency || 'Adsnap',
            format: c.format || 'Display',
            segmentation: c.segmentation || 'PRIVADO'
        }))
    )
    const [editingId, setEditingId] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleUpdate = (id: string, field: keyof ParsedCampaign, value: string) => {
        setData(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
    }

    const removeCampaign = (id: string) => {
        setData(prev => prev.filter(c => c.id !== id))
    }

    const addCampaign = () => {
        const newId = `temp-${Date.now()}`
        setData(prev => [...prev, {
            id: newId,
            agency: 'Adsnap',
            client: '',
            pi: '',
            url: '',
            format: 'Display',
            campaignName: '',
            segmentation: 'PRIVADO'
        }])
        setEditingId(newId)
    }

    const confirmAll = async () => {
        if (data.length === 0) return

        setIsSubmitting(true)
        try {
            const result = await bulkCreateCampaigns(data)
            if (result.success) {
                onConfirm(result.createdCount)
            }
        } catch (error) {
            console.error('Bulk registration error:', error)
            alert('Erro ao processar o cadastro em massa.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Modal */}
            <div
                className="relative w-full max-w-6xl h-[85vh] flex flex-col rounded-[2rem] overflow-hidden transition-all duration-500 shadow-2xl border border-white/10 animate-slide-up"
                style={{
                    background: 'rgba(15, 15, 25, 0.95)',
                    boxShadow: '0 0 80px rgba(168, 85, 247, 0.15)'
                }}
            >
                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-white/2 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg">
                            <Sparkles size={24} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                                Revisão de Cadastro <span className="text-accent">Nexus</span>
                            </h2>
                            <p className="text-sm text-white/50">O Nexus identificou {data.length} campanhas do seu pedido.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/5 text-white/30 hover:text-white transition-all"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    {data.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                            <AlertCircle size={48} className="text-white/10" />
                            <p className="text-white/30 font-medium">Nenhuma campanha encontrada no processamento.</p>
                            <button
                                onClick={addCampaign}
                                className="px-6 py-2 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-all text-sm font-bold"
                            >
                                Adicionar Manualmente
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {data.map((campaign) => (
                                <div
                                    key={campaign.id}
                                    className={`group relative p-6 rounded-2xl border transition-all duration-300 ${editingId === campaign.id ? 'bg-accent/5 border-accent/30 shadow-[0_0_30px_rgba(168,85,247,0.1)]' : 'bg-white/2 border-white/5 hover:border-white/10'}`}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6">
                                        {/* Client & PI */}
                                        <div className="space-y-4 lg:col-span-2">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        <User2 size={12} /> Cliente
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <input
                                                            value={campaign.client}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'client', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent"
                                                            placeholder="Cliente"
                                                        />
                                                    ) : (
                                                        <p className="text-sm font-bold text-white truncate">{campaign.client || '-'}</p>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        <Hash size={12} /> PI
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <input
                                                            value={campaign.pi}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'pi', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent"
                                                            placeholder="PI"
                                                        />
                                                    ) : (
                                                        <p className="text-sm font-bold text-accent">{campaign.pi || '-'}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                    <Layout size={12} /> Nome da Campanha
                                                </label>
                                                {editingId === campaign.id ? (
                                                    <input
                                                        value={campaign.campaignName || ''}
                                                        onChange={(e) => handleUpdate(campaign.id!, 'campaignName', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent"
                                                        placeholder="Ex: Black Friday 2024"
                                                    />
                                                ) : (
                                                    <p className="text-xs text-white/60 truncate">{campaign.campaignName || '-'}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* URL Targeting */}
                                        <div className="space-y-4 lg:col-span-2">
                                            <div className="space-y-2">
                                                <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                    <Globe size={12} /> URL Alvo
                                                </label>
                                                {editingId === campaign.id ? (
                                                    <input
                                                        value={campaign.url}
                                                        onChange={(e) => handleUpdate(campaign.id!, 'url', e.target.value)}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent"
                                                        placeholder="https://..."
                                                    />
                                                ) : (
                                                    <p className="text-xs font-medium text-white/40 truncate break-all">{campaign.url || '-'}</p>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        <Shield size={12} /> Segmento
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <select
                                                            value={campaign.segmentation}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'segmentation', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent appearance-none"
                                                        >
                                                            <option value="PRIVADO">Privado</option>
                                                            <option value="GOV_FEDERAL">Governo Federal</option>
                                                            <option value="GOV_ESTADUAL">Governo Estadual</option>
                                                            <option value="INTERNO">Treinamento/Interno</option>
                                                        </select>
                                                    ) : (
                                                        <span className="inline-flex px-2 py-0.5 rounded-md bg-white/5 text-[10px] font-bold text-white/40 border border-white/5">
                                                            {campaign.segmentation}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        Formato
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <input
                                                            value={campaign.format}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'format', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent"
                                                        />
                                                    ) : (
                                                        <p className="text-xs text-white/60">{campaign.format || '-'}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Dates */}
                                        <div className="space-y-4 lg:col-span-2">
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        <Calendar size={12} /> Início
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <input
                                                            type="date"
                                                            value={campaign.flightStart || ''}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'flightStart', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent [color-scheme:dark]"
                                                        />
                                                    ) : (
                                                        <p className="text-sm font-medium text-white/80">{campaign.flightStart || '-'}</p>
                                                    )}
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                                                        <Calendar size={12} /> Fim
                                                    </label>
                                                    {editingId === campaign.id ? (
                                                        <input
                                                            type="date"
                                                            value={campaign.flightEnd || ''}
                                                            onChange={(e) => handleUpdate(campaign.id!, 'flightEnd', e.target.value)}
                                                            className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white outline-none focus:border-accent [color-scheme:dark]"
                                                        />
                                                    ) : (
                                                        <p className="text-sm font-medium text-white/80">{campaign.flightEnd || '-'}</p>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="mt-2 p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                                                    <Building2 size={16} />
                                                </div>
                                                <div className="text-[10px] font-bold text-white/20 uppercase tracking-tighter">
                                                    Agência: <span className="text-white/60">{campaign.agency}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {editingId === campaign.id ? (
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="w-8 h-8 rounded-lg bg-green-500 text-white flex items-center justify-center hover:scale-110 transition-all shadow-lg shadow-green-500/20"
                                            >
                                                <Check size={16} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => setEditingId(campaign.id!)}
                                                className="w-8 h-8 rounded-lg bg-white/10 text-white/70 flex items-center justify-center hover:bg-white/20 transition-all"
                                            >
                                                <Edit2 size={16} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => removeCampaign(campaign.id!)}
                                            className="w-8 h-8 rounded-lg bg-white/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-all"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-white/5 bg-black/40 flex flex-col md:flex-row items-center justify-between gap-6">
                    <button
                        onClick={addCampaign}
                        className="flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-all group"
                    >
                        <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
                        Adicionar Manualmente
                    </button>

                    <div className="flex gap-4 w-full md:w-auto">
                        <button
                            onClick={onClose}
                            className="flex-1 md:px-8 py-4 rounded-xl font-bold text-white/50 hover:text-white hover:bg-white/5 transition-all text-sm"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={confirmAll}
                            disabled={isSubmitting || data.length === 0}
                            className="flex-1 md:px-12 py-4 rounded-xl bg-gradient-to-r from-accent to-purple-600 font-bold text-white shadow-lg shadow-accent/25 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 min-w-[200px]"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <Check size={20} />
                                    Confirmar e Ativar {data.length} {data.length === 1 ? 'Campanha' : 'Campanhas'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
