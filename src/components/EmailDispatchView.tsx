'use client'

import { useState, useTransition } from 'react'
import { Mail, Plus, Trash2, Send, Clock, Users, CheckCircle, AlertCircle, XCircle, X, ToggleLeft, ToggleRight, CalendarDays, Search, Layers } from 'lucide-react'
import { createEmailDispatch, updateEmailDispatch, deleteEmailDispatch, sendTestEmail } from '@/app/actions'

interface FormatInfo {
    id: string
    format: string
    formatLabel: string
    device: string
}

interface CampaignGroup {
    pi: string
    client: string
    agency: string
    campaignName: string
    flightStart: string | null
    flightEnd: string | null
    status: string
    formats: FormatInfo[]
    formatCount: number
    hasDispatch: boolean
}

interface CampaignData {
    id: string
    client: string
    agency: string
    campaignName: string
    format: string
    formatLabel: string
    pi: string
    device: string
    flightStart: string | null
    flightEnd: string | null
    status: string
}

interface EmailDispatchData {
    id: string
    campaignId: string | null
    pi: string
    recipients: string
    dispatchTime: string
    isActive: boolean
    lastSentAt: string | null
    status: string
    createdAt: string
    updatedAt: string
    campaign: CampaignData | null
    campaigns: CampaignData[]
    formatCount: number
}

interface Props {
    initialDispatches: EmailDispatchData[]
    campaigns: CampaignGroup[]
}

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { icon: any; label: string; color: string; bg: string }> = {
        PENDING: { icon: Clock, label: 'Aguardando', color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20' },
        SENT: { icon: CheckCircle, label: 'Enviado', color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
        FAILED: { icon: XCircle, label: 'Falha', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' },
    }
    const c = config[status] || config.PENDING
    const Icon = c.icon

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${c.bg} ${c.color}`}>
            <Icon size={12} />
            {c.label}
        </span>
    )
}

function formatDate(dateStr: string | null) {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function EmailDispatchView({ initialDispatches, campaigns }: Props) {
    const [dispatches, setDispatches] = useState(initialDispatches)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [search, setSearch] = useState('')
    const [isPending, startTransition] = useTransition()
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message })
        setTimeout(() => setFeedback(null), 4000)
    }

    const filteredDispatches = dispatches.filter(d => {
        const q = search.toLowerCase()
        return (d.campaign?.client || '').toLowerCase().includes(q) ||
            (d.campaign?.campaignName || '').toLowerCase().includes(q) ||
            (d.pi || '').toLowerCase().includes(q)
    })

    const handleToggleActive = (dispatch: EmailDispatchData) => {
        startTransition(async () => {
            try {
                await updateEmailDispatch(dispatch.id, { isActive: !dispatch.isActive })
                setDispatches(prev => prev.map(d => d.id === dispatch.id ? { ...d, isActive: !d.isActive } : d))
                showFeedback('success', dispatch.isActive ? 'Disparo desativado' : 'Disparo ativado')
            } catch (err) {
                showFeedback('error', 'Erro ao atualizar')
            }
        })
    }

    const handleDelete = (dispatch: EmailDispatchData) => {
        if (!confirm('Remover esta configuração de disparo?')) return
        startTransition(async () => {
            try {
                await deleteEmailDispatch(dispatch.id)
                setDispatches(prev => prev.filter(d => d.id !== dispatch.id))
                showFeedback('success', 'Disparo removido')
            } catch (err) {
                showFeedback('error', 'Erro ao remover')
            }
        })
    }

    const handleSendTest = (dispatch: EmailDispatchData) => {
        const recipients = JSON.parse(dispatch.recipients) as string[]
        if (!confirm(`Enviar e-mail de teste para ${recipients[0]}?`)) return
        startTransition(async () => {
            try {
                const result = await sendTestEmail(dispatch.id)
                if (result.success) {
                    showFeedback('success', `E-mail de teste enviado para ${recipients[0]}`)
                } else {
                    showFeedback('error', result.error || 'Falha ao enviar')
                }
            } catch (err) {
                showFeedback('error', 'Erro ao enviar teste')
            }
        })
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-start justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                            <Mail size={20} className="text-white/80" />
                        </div>
                        <h1 className="text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                            Disparo de E-mails
                        </h1>
                    </div>
                    <p className="text-sm text-white/40 max-w-lg">
                        Configure o envio automático de prints ao fim da veiculação.
                        Todos os formatos da campanha serão organizados em um único e-mail com no máximo 3 prints por dia.
                    </p>
                </div>

                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-black bg-white hover:bg-white/90 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex-shrink-0"
                >
                    <Plus size={18} />
                    Novo Disparo
                </button>
            </div>

            {/* Feedback Toast */}
            {feedback && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-sm font-semibold animate-slide-up ${feedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                    {feedback.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                    {feedback.message}
                </div>
            )}

            {/* Search */}
            {dispatches.length > 0 && (
                <div className="relative max-w-md">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, campanha ou PI..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/20 transition-colors"
                    />
                </div>
            )}

            {/* Stats Bar */}
            {dispatches.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/8">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">Total</p>
                        <p className="text-2xl font-black text-white">{dispatches.length}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400/50 mb-1">Enviados</p>
                        <p className="text-2xl font-black text-emerald-400">{dispatches.filter(d => d.status === 'SENT').length}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400/50 mb-1">Aguardando</p>
                        <p className="text-2xl font-black text-amber-400">{dispatches.filter(d => d.status === 'PENDING').length}</p>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {dispatches.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center mb-6">
                        <Mail size={32} className="text-white/20" />
                    </div>
                    <h3 className="text-lg font-bold text-white/60 mb-2">Nenhum disparo configurado</h3>
                    <p className="text-sm text-white/30 max-w-sm mb-6">
                        Configure o primeiro disparo automático para receber os prints por e-mail ao final da veiculação.
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm text-black bg-white hover:bg-white/90 transition-all"
                    >
                        <Plus size={18} />
                        Criar Primeiro Disparo
                    </button>
                </div>
            )}

            {/* Dispatch List */}
            <div className="space-y-3">
                {filteredDispatches.map((dispatch) => {
                    const recipients = JSON.parse(dispatch.recipients) as string[]
                    const flightEndDate = dispatch.campaign?.flightEnd ? new Date(dispatch.campaign.flightEnd) : null
                    const isExpired = flightEndDate ? flightEndDate < new Date() : false

                    return (
                        <div
                            key={dispatch.id}
                            className={`group p-5 rounded-2xl border transition-all duration-300 hover:border-white/15 ${dispatch.isActive
                                ? 'bg-white/[0.02] border-white/8'
                                : 'bg-white/[0.01] border-white/5 opacity-60'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-4">
                                {/* Left: Campaign Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="text-base font-bold text-white truncate">
                                            {dispatch.campaign?.client || 'Campanha'}
                                        </h3>
                                        <StatusBadge status={dispatch.status} />
                                        {!dispatch.isActive && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/30 px-2 py-0.5 bg-white/5 rounded">Inativo</span>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
                                        <span>{dispatch.campaign?.campaignName || '—'}</span>
                                        <span>PI: {dispatch.pi}</span>
                                        <span className="flex items-center gap-1">
                                            <CalendarDays size={11} />
                                            {formatDate(dispatch.campaign?.flightStart || null)} → {formatDate(dispatch.campaign?.flightEnd || null)}
                                            {isExpired && <span className="text-red-400 ml-1">(encerrada)</span>}
                                        </span>
                                    </div>

                                    {/* Format Tags */}
                                    {dispatch.campaigns && dispatch.campaigns.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                            <Layers size={12} className="text-white/25" />
                                            {dispatch.campaigns.map((c, i) => (
                                                <span key={i} className="text-[10px] font-semibold text-white/50 bg-white/[0.06] px-2 py-0.5 rounded-md border border-white/8">
                                                    {c.formatLabel} ({c.device})
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3 mt-3">
                                        <div className="flex items-center gap-1.5 text-xs text-white/50 bg-white/[0.04] px-2.5 py-1.5 rounded-lg">
                                            <Users size={12} />
                                            <span className="font-semibold">{recipients.length}</span>
                                            <span className="hidden sm:inline">destinatário{recipients.length > 1 ? 's' : ''}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-white/50 bg-white/[0.04] px-2.5 py-1.5 rounded-lg">
                                            <Clock size={12} />
                                            <span className="font-semibold">{dispatch.dispatchTime}</span>
                                            <span className="hidden sm:inline">BRT</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-white/50 bg-white/[0.04] px-2.5 py-1.5 rounded-lg">
                                            <Layers size={12} />
                                            <span className="font-semibold">{dispatch.formatCount}</span>
                                            <span className="hidden sm:inline">formato{dispatch.formatCount > 1 ? 's' : ''}</span>
                                        </div>
                                        {dispatch.lastSentAt && (
                                            <div className="text-[11px] text-white/30">
                                                Último envio: {formatDate(dispatch.lastSentAt)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Recipients preview */}
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {recipients.slice(0, 3).map((email, i) => (
                                            <span key={i} className="text-[10px] text-white/30 bg-white/[0.03] px-2 py-0.5 rounded-md font-mono">
                                                {email}
                                            </span>
                                        ))}
                                        {recipients.length > 3 && (
                                            <span className="text-[10px] text-white/20 px-2 py-0.5">
                                                +{recipients.length - 3} mais
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Actions */}
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                    <button
                                        onClick={() => handleSendTest(dispatch)}
                                        disabled={isPending}
                                        className="p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white/50 hover:text-white transition-all"
                                        title="Enviar teste"
                                    >
                                        <Send size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(dispatch)}
                                        disabled={isPending}
                                        className={`p-2.5 rounded-lg border transition-all ${dispatch.isActive
                                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                            : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                                            }`}
                                        title={dispatch.isActive ? 'Desativar' : 'Ativar'}
                                    >
                                        {dispatch.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(dispatch)}
                                        disabled={isPending}
                                        className="p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/20 text-white/30 hover:text-red-400 transition-all"
                                        title="Remover"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <CreateDispatchModal
                    campaigns={campaigns.filter(c => !c.hasDispatch)}
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newDispatch) => {
                        setDispatches(prev => [newDispatch, ...prev])
                        setShowCreateModal(false)
                        showFeedback('success', 'Disparo criado com sucesso!')
                    }}
                />
            )}
        </div>
    )
}

// =============================================================================
// CREATE DISPATCH MODAL
// =============================================================================

function CreateDispatchModal({ campaigns, onClose, onCreated }: {
    campaigns: CampaignGroup[]
    onClose: () => void
    onCreated: (dispatch: any) => void
}) {
    const [selectedPi, setSelectedPi] = useState('')
    const [recipientsText, setRecipientsText] = useState('')
    const [dispatchTime, setDispatchTime] = useState('09:00')
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState('')

    const selectedCampaign = campaigns.find(c => c.pi === selectedPi)

    const handleSubmit = () => {
        setError('')

        if (!selectedPi) {
            setError('Selecione uma campanha')
            return
        }

        const recipients = recipientsText
            .split(/[,;\n]/)
            .map(e => e.trim())
            .filter(Boolean)

        if (recipients.length === 0) {
            setError('Adicione pelo menos um destinatário')
            return
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        const invalid = recipients.find(e => !emailRegex.test(e))
        if (invalid) {
            setError(`E-mail inválido: ${invalid}`)
            return
        }

        startTransition(async () => {
            try {
                const result = await createEmailDispatch({
                    pi: selectedPi,
                    recipients,
                    dispatchTime,
                })

                // Rebuild the dispatch object with campaign data for the list
                const fullDispatch = {
                    ...result,
                    createdAt: result.createdAt instanceof Date ? result.createdAt.toISOString() : result.createdAt,
                    updatedAt: result.updatedAt instanceof Date ? result.updatedAt.toISOString() : result.updatedAt,
                    lastSentAt: null,
                    pi: selectedPi,
                    campaign: selectedCampaign ? {
                        id: '',
                        client: selectedCampaign.client,
                        agency: selectedCampaign.agency,
                        campaignName: selectedCampaign.campaignName,
                        format: '',
                        formatLabel: '',
                        pi: selectedPi,
                        device: '',
                        flightStart: selectedCampaign.flightStart,
                        flightEnd: selectedCampaign.flightEnd,
                        status: selectedCampaign.status,
                    } : null,
                    campaigns: selectedCampaign?.formats.map(f => ({
                        id: f.id,
                        client: selectedCampaign.client,
                        agency: selectedCampaign.agency,
                        campaignName: selectedCampaign.campaignName,
                        format: f.format,
                        formatLabel: f.formatLabel,
                        pi: selectedPi,
                        device: f.device,
                        flightStart: selectedCampaign.flightStart,
                        flightEnd: selectedCampaign.flightEnd,
                        status: selectedCampaign.status,
                    })) || [],
                    formatCount: selectedCampaign?.formatCount || 0,
                }
                onCreated(fullDispatch)
            } catch (err: any) {
                setError(err.message || 'Erro ao criar disparo')
            }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg mx-4 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-5 border-b border-white/8">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                            <Mail size={16} className="text-white/60" />
                        </div>
                        <h2 className="text-lg font-bold text-white">Novo Disparo</h2>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 space-y-5">
                    {/* Campaign Select */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">Campanha</label>
                        {campaigns.length === 0 ? (
                            <p className="text-sm text-white/30 p-3 bg-white/[0.03] rounded-xl border border-white/5">
                                Nenhuma campanha disponível (todas já possuem disparo configurado ou não têm data de encerramento).
                            </p>
                        ) : (
                            <select
                                value={selectedPi}
                                onChange={e => setSelectedPi(e.target.value)}
                                className="w-full px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none"
                            >
                                <option value="" className="bg-[#111]">Selecione uma campanha...</option>
                                {campaigns.map(c => (
                                    <option key={c.pi} value={c.pi} className="bg-[#111]">
                                        {c.client} — {c.campaignName || c.pi} ({c.formatCount} formato{c.formatCount > 1 ? 's' : ''}) | até {formatDate(c.flightEnd)}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Selected Campaign Info */}
                    {selectedCampaign && (
                        <div className="p-3 bg-white/[0.03] border border-white/8 rounded-xl text-xs text-white/40 space-y-2">
                            <p><span className="text-white/60 font-semibold">Agência:</span> {selectedCampaign.agency}</p>
                            <p><span className="text-white/60 font-semibold">Veiculação:</span> {formatDate(selectedCampaign.flightStart)} → {formatDate(selectedCampaign.flightEnd)}</p>
                            <div>
                                <span className="text-white/60 font-semibold">Formatos ({selectedCampaign.formatCount}):</span>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                    {selectedCampaign.formats.map((f, i) => (
                                        <span key={i} className="text-[10px] font-semibold text-white/60 bg-white/[0.08] px-2 py-0.5 rounded-md border border-white/10">
                                            {f.formatLabel} ({f.device})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recipients */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                            Destinatários
                        </label>
                        <textarea
                            value={recipientsText}
                            onChange={e => setRecipientsText(e.target.value)}
                            placeholder={"email1@empresa.com\nemail2@empresa.com\nemail3@empresa.com"}
                            rows={4}
                            className="w-full px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 transition-colors resize-none font-mono"
                        />
                        <p className="mt-1 text-[10px] text-white/25">Separe múltiplos e-mails por vírgula, ponto-e-vírgula ou nova linha.</p>
                    </div>

                    {/* Dispatch Time */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/40 mb-2">
                            Horário de Disparo (BRT)
                        </label>
                        <input
                            type="time"
                            value={dispatchTime}
                            onChange={e => setDispatchTime(e.target.value)}
                            className="w-full px-4 py-3 bg-white/[0.03] border border-white/8 rounded-xl text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                        />
                        <p className="mt-1 text-[10px] text-white/25">O e-mail será enviado neste horário no dia em que a veiculação encerrar.</p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-white/8">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white/50 hover:text-white hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isPending || !selectedPi}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-black bg-white hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        {isPending ? (
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        ) : (
                            <Mail size={16} />
                        )}
                        Criar Disparo
                    </button>
                </div>
            </div>
        </div>
    )
}
