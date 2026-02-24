'use client'

import React, { useState, useTransition } from 'react'
import { X, Globe, Monitor, Smartphone, Layers, ChevronDown, Save, Calendar, Building2, User2, Hash, Loader2 } from 'lucide-react'
import { updateCampaign } from '@/app/actions'

interface EditCampaignModalProps {
    campaign: any
    formats: any[]
    onClose: () => void
    onSaved: () => void
}

export function EditCampaignModal({ campaign, formats, onClose, onSaved }: EditCampaignModalProps) {
    const [isPending, startTransition] = useTransition()
    const [form, setForm] = useState({
        agency: campaign.agency || '',
        client: campaign.client || '',
        campaignName: campaign.campaignName || '',
        pi: campaign.pi || '',
        url: campaign.url || '',
        device: campaign.device || 'desktop',
        format: campaign.format || '',
        segmentation: campaign.segmentation || 'PRIVADO',
        flightStart: campaign.flightStart ? campaign.flightStart.slice(0, 10) : '',
        flightEnd: campaign.flightEnd ? campaign.flightEnd.slice(0, 10) : '',
        isScheduled: campaign.isScheduled || false,
        scheduledTimes: campaign.scheduledTimes || '[]',
    })

    const update = (fields: Partial<typeof form>) => setForm(prev => ({ ...prev, ...fields }))

    const handleSave = () => {
        const data = new FormData()
        Object.entries(form).forEach(([key, value]) => {
            data.append(key, value.toString())
        })

        startTransition(async () => {
            try {
                await updateCampaign(campaign.id, data)
                onSaved()
            } catch (err) {
                alert('Erro ao salvar: ' + (err as Error).message)
            }
        })
    }

    const getFormatLabel = (formatId: string) => {
        const fmt = formats.find((f: any) => f.id === formatId)
        return fmt ? `${fmt.label} (${fmt.width}x${fmt.height})` : formatId
    }

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in"
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
                            Editar <span className="text-gradient">Campanha</span>
                        </h2>
                        <p className="text-xs text-white/30 mt-0.5">
                            {getFormatLabel(campaign.format)} • PI {campaign.pi}
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
                    {/* Identification Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <FieldBlock label="Agência" icon={Building2}>
                            <input
                                type="text"
                                value={form.agency}
                                onChange={e => update({ agency: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                        <FieldBlock label="Cliente" icon={User2}>
                            <input
                                type="text"
                                value={form.client}
                                onChange={e => update({ client: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FieldBlock label="Nome da Campanha" icon={Hash}>
                            <input
                                type="text"
                                value={form.campaignName}
                                onChange={e => update({ campaignName: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                        <FieldBlock label="PI" icon={Hash}>
                            <input
                                type="text"
                                value={form.pi}
                                onChange={e => update({ pi: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-white/5 pt-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Veiculação</span>
                    </div>

                    {/* URL */}
                    <FieldBlock label="URL Alvo" icon={Globe}>
                        <input
                            type="text"
                            value={form.url}
                            onChange={e => update({ url: e.target.value })}
                            className="modal-input"
                            placeholder="https://..."
                        />
                    </FieldBlock>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Device */}
                        <FieldBlock label="Dispositivo" icon={Monitor}>
                            <div className="flex gap-2 p-1.5 rounded-xl" style={{ background: 'var(--bg-tertiary, #1a1a24)' }}>
                                <button
                                    onClick={() => update({ device: 'desktop' })}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${form.device === 'desktop' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                >
                                    <Monitor size={14} /> Desktop
                                </button>
                                <button
                                    onClick={() => update({ device: 'mobile' })}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${form.device === 'mobile' ? 'bg-accent text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                                >
                                    <Smartphone size={14} /> Mobile
                                </button>
                            </div>
                        </FieldBlock>

                        {/* Format */}
                        <FieldBlock label="Formato" icon={Layers}>
                            <div className="relative">
                                <select
                                    value={form.format}
                                    onChange={e => update({ format: e.target.value })}
                                    className="modal-input appearance-none pr-10"
                                >
                                    <option value="">Selecione...</option>
                                    {formats.map((fmt: any) => (
                                        <option key={fmt.id} value={fmt.id}>
                                            {fmt.label} ({fmt.width}x{fmt.height})
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={16} />
                            </div>
                        </FieldBlock>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-white/5 pt-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Período de Veiculação</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FieldBlock label="Data Início" icon={Calendar}>
                            <input
                                type="date"
                                value={form.flightStart}
                                onChange={e => update({ flightStart: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                        <FieldBlock label="Data Fim" icon={Calendar}>
                            <input
                                type="date"
                                value={form.flightEnd}
                                onChange={e => update({ flightEnd: e.target.value })}
                                className="modal-input"
                            />
                        </FieldBlock>
                    </div>

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
                            onClick={handleSave}
                            disabled={isPending}
                            className="flex-1 py-4 rounded-xl font-bold text-sm text-white transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                            style={{ background: 'var(--gradient-primary)' }}
                        >
                            {isPending ? (
                                <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                            ) : (
                                <><Save size={18} /> Salvar Alterações</>
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
                    box-shadow: 0 0 0 3px rgba(168,85,247,0.1);
                }
                .modal-input::placeholder {
                    color: rgba(255,255,255,0.2);
                }
            `}</style>
        </div>
    )
}

function FieldBlock({ label, icon: Icon, children }: { label: string, icon: any, children: React.ReactNode }) {
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
