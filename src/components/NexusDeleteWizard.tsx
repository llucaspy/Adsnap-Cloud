'use client'

import { useState } from 'react'
import { Trash2, Calendar, CheckSquare, Square, X, AlertTriangle, Loader2, ChevronRight, Hash } from 'lucide-react'
import { deleteCampaignsAction, deletePrintsAction } from '../app/actions'

interface CampaignData {
    id: string
    client: string
    pi: string
    format: string
    captureDates: string[]
    totalCaptures: number
}

interface NexusDeleteWizardProps {
    data: {
        campaigns: CampaignData[]
        globalDates: { date: string, count: number }[]
    }
    onClose: () => void
    onConfirm: (message: string) => void
}

export function NexusDeleteWizard({ data, onClose, onConfirm }: NexusDeleteWizardProps) {
    const [step, setStep] = useState<'MODE' | 'SELECT_CAMPAIGNS' | 'SELECT_DATES' | 'SELECT_GLOBAL_DATES' | 'CONFIRM'>('MODE')
    const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
    const [selectedDates, setSelectedDates] = useState<string[]>([])
    const [isDeleting, setIsDeleting] = useState(false)
    const [mode, setMode] = useState<'CAMPAIGN' | 'PRINTS' | 'GLOBAL_DATE'>('CAMPAIGN')

    // Derived: all possible dates for selected campaigns (for specific campaign mode)
    const availableDates = Array.from(new Set(
        data.campaigns
            .filter(c => selectedCampaignIds.includes(c.id))
            .flatMap(c => c.captureDates)
    )).sort().reverse()

    const toggleCampaign = (id: string) => {
        setSelectedCampaignIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    const toggleDate = (date: string) => {
        setSelectedDates(prev => 
            prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
        )
    }

    const handleConfirm = async () => {
        setIsDeleting(true)
        try {
            if (mode === 'CAMPAIGN') {
                const res = await deleteCampaignsAction(selectedCampaignIds)
                if (res.success) {
                    onConfirm(`🗑️ **Protocolo de Exclusão concluído.** ${selectedCampaignIds.length} campanhas e todos os seus registros foram removidos permanentemente.`)
                }
            } else if (mode === 'PRINTS') {
                const res = await deletePrintsAction(selectedCampaignIds, selectedDates)
                if (res.success) {
                    onConfirm(`🧹 **Limpeza de Prints concluída.** ${res.count} capturas foram removidas em ${selectedDates.length} datas selecionadas.`)
                }
            } else if (mode === 'GLOBAL_DATE') {
                // For global date, we pass ALL campaign IDs
                const allCampaignIds = data.campaigns.map(c => c.id)
                const res = await deletePrintsAction(allCampaignIds, selectedDates)
                if (res.success) {
                    onConfirm(`🗓️ **Exclusão por Data concluída.** ${res.count} prints do dia(s) ${selectedDates.join(', ')} foram removidos de todas as campanhas.`)
                }
            }
        } catch (err) {
            console.error('Wizard error:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose} />
            
            <div className="relative w-full max-w-2xl bg-[#0a0a0c] border border-white/10 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)] flex flex-col max-h-[85vh]">
                
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                            <Trash2 size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-white font-black text-xl tracking-tighter uppercase italic">Assistente de Exclusão</h2>
                            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em]">Cuidado: Esta ação é permanente</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6 nexus-scrollbar">
                    
                    {step === 'MODE' && (
                        <div className="grid grid-cols-2 gap-4 animate-in zoom-in-95 duration-500 p-2">
                            <button
                                onClick={() => { setMode('CAMPAIGN'); setStep('SELECT_CAMPAIGNS') }}
                                className="group relative flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-white group-hover:text-black transition-all">
                                    <Trash2 size={28} />
                                </div>
                                <div className="text-center">
                                    <div className="text-white font-black uppercase tracking-widest text-xs mb-1">Por Campanha</div>
                                    <div className="text-white/30 text-[10px] leading-tight max-w-[120px]">Excluir campanhas inteiras ou prints selecionados de campanhas específicas.</div>
                                </div>
                            </button>

                            <button
                                onClick={() => { setMode('GLOBAL_DATE'); setStep('SELECT_GLOBAL_DATES') }}
                                className="group relative flex flex-col items-center gap-6 p-8 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/20 transition-all duration-300"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 group-hover:bg-white group-hover:text-black transition-all">
                                    <Calendar size={28} />
                                </div>
                                <div className="text-center">
                                    <div className="text-white font-black uppercase tracking-widest text-xs mb-1">Por Dia (Global)</div>
                                    <div className="text-white/30 text-[10px] leading-tight max-w-[120px]">Remover TODOS os prints de datas específicas em todas as campanhas.</div>
                                </div>
                            </button>
                        </div>
                    )}

                    {step === 'SELECT_CAMPAIGNS' && (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div>
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-3 block">1. Escolha as Campanhas</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {data.campaigns.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => toggleCampaign(c.id)}
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${
                                                selectedCampaignIds.includes(c.id) 
                                                ? 'bg-white/10 border-white/20' 
                                                : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                                selectedCampaignIds.includes(c.id)
                                                ? 'bg-white border-white'
                                                : 'border-white/20 group-hover:border-white/40'
                                            }`}>
                                                {selectedCampaignIds.includes(c.id) && <Trash2 size={12} className="text-black" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold text-sm truncate">{c.client}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest flex items-center gap-1">
                                                        <Hash size={10} /> {c.pi}
                                                    </span>
                                                    <span className="w-1 h-1 rounded-full bg-white/10" />
                                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">
                                                        {c.totalCaptures} prints
                                                    </span>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => setStep('MODE')} className="px-6 py-4 rounded-xl bg-white/5 text-white/40 font-black uppercase tracking-widest text-[11px] hover:text-white transition-colors">Voltar</button>
                                <button
                                    onClick={() => { setMode('CAMPAIGN'); setStep('CONFIRM') }}
                                    disabled={selectedCampaignIds.length === 0}
                                    className="flex-1 bg-white text-black font-black uppercase tracking-widest text-[11px] py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20 disabled:grayscale"
                                >
                                    Apagar Campanhas
                                </button>
                                <button
                                    onClick={() => { setMode('PRINTS'); setStep('SELECT_DATES') }}
                                    disabled={selectedCampaignIds.length === 0}
                                    className="flex-1 bg-white/5 border border-white/10 text-white font-black uppercase tracking-widest text-[11px] py-4 rounded-xl hover:bg-white/10 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20"
                                >
                                    Apagar Prints Específicos
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'SELECT_DATES' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                            <div>
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-3 block">2. Selecione os Dias ({selectedCampaignIds.length} campanhas)</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {availableDates.map(date => (
                                        <button
                                            key={date}
                                            onClick={() => toggleDate(date)}
                                            className={`flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                                                selectedDates.includes(date)
                                                ? 'bg-white/10 border-white/20'
                                                : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                                selectedDates.includes(date)
                                                ? 'bg-white border-white'
                                                : 'border-white/20'
                                            }`}>
                                                {selectedDates.includes(date) && <Calendar size={12} className="text-black" />}
                                            </div>
                                            <div className="text-white font-bold text-xs">
                                                {new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button
                                    onClick={() => setStep('SELECT_CAMPAIGNS')}
                                    className="px-6 py-4 rounded-xl bg-white/5 text-white/40 font-black uppercase tracking-widest text-[11px] hover:text-white transition-colors"
                                >
                                    Voltar
                                </button>
                                <button
                                    onClick={() => setStep('CONFIRM')}
                                    disabled={selectedDates.length === 0}
                                    className="flex-1 bg-white text-black font-black uppercase tracking-widest text-[11px] py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20"
                                >
                                    Revisar Exclusão
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'SELECT_GLOBAL_DATES' && (
                        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
                            <div>
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-3 block">Escolha as Datas para Limpeza Global</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {data.globalDates.map(g => (
                                        <button
                                            key={g.date}
                                            onClick={() => toggleDate(g.date)}
                                            className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                                                selectedDates.includes(g.date)
                                                ? 'bg-white/10 border-white/20'
                                                : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                                            }`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                                selectedDates.includes(g.date)
                                                ? 'bg-white border-white'
                                                : 'border-white/20'
                                            }`}>
                                                {selectedDates.includes(g.date) && <Calendar size={12} className="text-black" />}
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-white font-bold text-sm">
                                                    {new Date(g.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
                                                </div>
                                                <div className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mt-0.5">
                                                    Total de {g.count} prints em todas as campanhas
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button onClick={() => setStep('MODE')} className="px-6 py-4 rounded-xl bg-white/5 text-white/40 font-black uppercase tracking-widest text-[11px] hover:text-white transition-colors">Voltar</button>
                                <button
                                    onClick={() => setStep('CONFIRM')}
                                    disabled={selectedDates.length === 0}
                                    className="flex-1 bg-white text-black font-black uppercase tracking-widest text-[11px] py-4 rounded-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20"
                                >
                                    Revisar Limpeza Global
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'CONFIRM' && (
                        <div className="space-y-8 py-4 animate-in zoom-in-95 duration-500 flex flex-col items-center text-center">
                            <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center relative">
                                <AlertTriangle size={32} className="text-red-500 animate-pulse" />
                                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" />
                            </div>
                            
                            <div className="space-y-3">
                                <h3 className="text-white font-black text-2xl tracking-tighter uppercase italic">Confirmar Exclusão Final</h3>
                                <p className="text-white/40 text-sm max-w-md mx-auto">
                                    {mode === 'CAMPAIGN' && `Você está prestes a remover ${selectedCampaignIds.length} campanhas e todos os seus arquivos permanentemente.`}
                                    {mode === 'PRINTS' && `Você removerá prints específicos das ${selectedCampaignIds.length} campanhas selecionadas.`}
                                    {mode === 'GLOBAL_DATE' && `Atenção: Você removerá TODOS os prints de ${selectedDates.length} dias específicos de TODO o sistema (${data.campaigns.length} campanhas afetadas).`}
                                </p>
                            </div>

                            <div className="w-full grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        if (mode === 'GLOBAL_DATE') setStep('SELECT_GLOBAL_DATES')
                                        else if (mode === 'PRINTS') setStep('SELECT_DATES')
                                        else setStep('SELECT_CAMPAIGNS')
                                    }}
                                    disabled={isDeleting}
                                    className="py-4 border border-white/10 rounded-xl text-white/40 font-black uppercase tracking-widest text-[11px] hover:bg-white/5 hover:text-white transition-all disabled:opacity-20"
                                >
                                    Abortar
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={isDeleting}
                                    className="py-4 bg-red-500 text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-[0_10px_40px_rgba(239,68,68,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isDeleting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            Processando...
                                        </>
                                    ) : (
                                        'Executar Exclusão'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    )
}
