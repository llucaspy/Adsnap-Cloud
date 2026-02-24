'use client'

import React, { useState, useEffect, useTransition } from 'react'
import { Sparkles, Calendar, Clock, Camera, CheckCircle2, AlertCircle, Loader2, Search, ChevronRight } from 'lucide-react'
import { getAvailableCampaigns, runManualCaptureAction } from '@/app/actions/assemblyActions'

export function AssemblyView() {
    const [campaigns, setCampaigns] = useState<any[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCampaignId, setSelectedCampaignId] = useState('')
    const [customDate, setCustomDate] = useState(new Date().toLocaleDateString('pt-BR'))
    const [customTime, setCustomTime] = useState(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
    const [errorMessage, setErrorMessage] = useState('')
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        getAvailableCampaigns().then(setCampaigns)
    }, [])

    const handleCapture = () => {
        if (!selectedCampaignId) {
            alert('Por favor, selecione uma campanha.')
            return
        }

        setStatus('loading')
        startTransition(async () => {
            try {
                const result = await runManualCaptureAction(selectedCampaignId, customDate, customTime)
                if (result.success) {
                    setStatus('success')
                    setTimeout(() => setStatus('idle'), 5000)
                } else {
                    setStatus('error')
                    setErrorMessage(result.error || 'Erro desconhecido')
                }
            } catch (err) {
                setStatus('error')
                setErrorMessage(String(err))
            }
        })
    }

    const filteredCampaigns = campaigns.filter(c =>
        c.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.pi.includes(searchTerm) ||
        c.campaignName?.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId)

    return (
        <div className="max-w-6xl mx-auto space-y-10 pb-20">
            {/* Header Section */}
            <div className="relative p-10 rounded-[2.5rem] overflow-hidden border border-white/10 bg-gradient-to-br from-bg-secondary/80 to-bg-primary/90 shadow-2xl backdrop-blur-md">
                <div className="absolute top-0 right-0 w-64 h-64 bg-accent/20 blur-[100px] -z-10" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-secondary/10 blur-[100px] -z-10" />

                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-4 text-center md:text-left">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-accent text-[10px] font-black uppercase tracking-[0.2em]">
                            <Sparkles size={14} /> Admin Tools
                        </div>
                        <h1 className="text-4xl md:text-5xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                            MONTAGEM DE <span className="text-gradient">PRINTS</span>
                        </h1>
                        <p className="text-white/40 text-sm font-medium max-w-md">
                            Gere evidências personalizadas com data e hora específicas na barra de tarefas do Windows 11.
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 w-full md:w-auto">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center gap-6 backdrop-blur-sm">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Data do Print</p>
                                <input
                                    type="text"
                                    value={customDate}
                                    onChange={(e) => setCustomDate(e.target.value)}
                                    className="bg-transparent border-none text-white font-bold text-xl focus:ring-0 w-32"
                                    placeholder="DD/MM/AAAA"
                                />
                            </div>
                            <div className="w-px h-10 bg-white/10" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Hora do Print</p>
                                <input
                                    type="text"
                                    value={customTime}
                                    onChange={(e) => setCustomTime(e.target.value)}
                                    className="bg-transparent border-none text-white font-bold text-xl focus:ring-0 w-24"
                                    placeholder="HH:MM"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Campaign Selection Column */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-bg-secondary/50 border border-white/5 rounded-3xl p-6 space-y-6">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                            <input
                                type="text"
                                placeholder="Buscar por PI, Cliente ou Campanha..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-sm font-medium focus:border-accent/50 focus:ring-0 transition-all"
                            />
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                            {filteredCampaigns.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => setSelectedCampaignId(c.id)}
                                    className={`w-full text-left p-4 rounded-2xl transition-all border ${selectedCampaignId === c.id
                                            ? 'bg-accent/10 border-accent/30 text-white'
                                            : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">PI {c.pi}</span>
                                        <span className="text-[9px] font-bold text-white/20 uppercase">{c.device}</span>
                                    </div>
                                    <p className="font-bold truncate">{c.client}</p>
                                    <p className="text-[10px] opacity-40 truncate">{c.format} • {c.campaignName}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preview / Action Column */}
                <div className="lg:col-span-2">
                    <div className="bg-bg-secondary/50 border border-white/5 rounded-3xl p-10 h-full flex flex-col items-center justify-center text-center space-y-8 relative overflow-hidden">
                        {selectedCampaign ? (
                            <div className="w-full space-y-10 animate-fade-in">
                                <div className="space-y-4">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent to-secondary mx-auto flex items-center justify-center shadow-2xl">
                                        <Camera size={32} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                                            PRONTO PARA CAPTURAR
                                        </h3>
                                        <p className="text-white/40 text-sm font-medium">
                                            A captura será realizada em tempo real e processada com o timestamp:<br />
                                            <span className="text-white font-bold"> {customDate} às {customTime}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Cliente</p>
                                        <p className="font-bold truncate">{selectedCampaign.client}</p>
                                    </div>
                                    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                                        <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Formato</p>
                                        <p className="font-bold truncate">{selectedCampaign.format}</p>
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button
                                        onClick={handleCapture}
                                        disabled={status === 'loading'}
                                        className="relative group px-12 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-r from-accent to-secondary" />
                                        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20" />

                                        <span className="relative z-10 flex items-center gap-3 text-white">
                                            {status === 'loading' ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    Processando...
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles size={18} />
                                                    Gerar Print Agora
                                                </>
                                            )}
                                        </span>
                                    </button>
                                </div>

                                {/* Status Feedback */}
                                {status === 'success' && (
                                    <div className="flex items-center gap-2 text-emerald-400 font-bold justify-center animate-bounce">
                                        <CheckCircle2 size={18} /> Print gerado com sucesso! Verifique no Book.
                                    </div>
                                )}
                                {status === 'error' && (
                                    <div className="flex items-center gap-2 text-red-400 font-bold justify-center">
                                        <AlertCircle size={18} /> {errorMessage}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6 opacity-30">
                                <Camera size={64} className="mx-auto" />
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold uppercase tracking-widest">Nenhuma Seleção</h3>
                                    <p className="text-xs font-medium uppercase tracking-[0.2em]">Escolha uma campanha na lista ao lado</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
