'use client'

import React, { useState, useEffect } from 'react'
import { getMonthlyCampaigns } from '@/app/books/actions'
import { Download, Rocket, Flag, Loader2, Hash, Calendar, Layers } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function ActiveCampaigns() {
    const [data, setData] = useState<{ active: any[], ended: any[] } | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'active' | 'ended'>('active')

    useEffect(() => {
        async function load() {
            const res = await getMonthlyCampaigns()
            setData(res)
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="flex items-center gap-3 px-6 py-10 rounded-3xl bg-white/[0.02] border border-dashed border-white/10 mb-12">
                <Loader2 size={18} className="animate-spin text-white/20" />
                <span className="text-xs font-bold text-white/20 uppercase tracking-widest">Sincronizando campanhas...</span>
            </div>
        )
    }

    const currentList = activeTab === 'active' ? data?.active : data?.ended

    return (
        <div className="mb-14">
            {/* Header com Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-6">
                <div>
                    <h2 className="text-sm font-black text-white/80 uppercase tracking-widest mb-1">
                        Campanhas do Mês
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest leading-loose">
                        Acesso rápido aos prints das campanhas em destaque
                    </p>
                </div>

                <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/8 shrink-0">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeTab === 'active' ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
                        }`}
                    >
                        <Rocket size={12} strokeWidth={activeTab === 'active' ? 3 : 2} />
                        Ativas ({data?.active.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('ended')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                            activeTab === 'ended' ? 'bg-white text-black' : 'text-white/40 hover:text-white/70'
                        }`}
                    >
                        <Flag size={12} strokeWidth={activeTab === 'ended' ? 3 : 2} />
                        Encerradas ({data?.ended.length})
                    </button>
                </div>
            </div>

            {/* List / Grid */}
            {currentList && currentList.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {currentList.map((campaign) => (
                        <div
                            key={campaign.pi}
                            className="group relative bg-[#13131a] border border-white/10 rounded-2xl p-6 hover:border-white/20 hover:bg-[#1a1a24] transition-all duration-300 hover:shadow-2xl"
                        >
                            <div className="flex items-start justify-between mb-5">
                                <div className="min-w-0 flex-1 pr-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[9px] font-black text-blue-400 uppercase tracking-wider">
                                            <Hash size={10} />
                                            {campaign.pi}
                                        </span>
                                        <span className="text-[10px] font-bold text-white/30 truncate">
                                            {campaign.agency}
                                        </span>
                                    </div>
                                    <h3 className="text-base font-black text-white leading-tight group-hover:text-blue-300 transition-colors">
                                        {campaign.client}
                                    </h3>
                                    <p className="text-xs text-white/40 truncate mt-1">
                                        {campaign.campaignName || 'Sem nome'}
                                    </p>
                                </div>
                                <a
                                    href={`/api/books/download?pi=${campaign.pi}`}
                                    className="h-11 w-11 flex items-center justify-center rounded-2xl bg-white text-black hover:bg-blue-50 hover:scale-105 active:scale-95 transition-all shadow-lg"
                                    title="Download ZIP Completo"
                                >
                                    <Download size={18} strokeWidth={2.5} />
                                </a>
                            </div>

                            <div className="space-y-4">
                                {/* Details Row */}
                                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.1em] text-white/30">
                                    <div className="flex items-center gap-2">
                                        <Calendar size={12} className="text-blue-500/40" />
                                        <span>
                                            {campaign.flightStart ? format(new Date(campaign.flightStart), "dd MMM", { locale: ptBR }) : '?'} 
                                            <span className="mx-1.5 opacity-30">—</span> 
                                            {campaign.flightEnd ? format(new Date(campaign.flightEnd), "dd MMM", { locale: ptBR }) : 'Ongoing'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Layers size={12} className="text-blue-500/40" />
                                        <span>{campaign.captureCount} prints</span>
                                    </div>
                                </div>

                                {/* Progress Bar */}
                                <div className="relative pt-2">
                                    <div className="flex items-center justify-between text-[8px] font-black text-white/20 uppercase tracking-wider mb-1.5">
                                        <span>{campaign.formats.length} formatos</span>
                                        {activeTab === 'active' && <span>Em veiculação</span>}
                                    </div>
                                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div 
                                            className={`h-full rounded-full transition-all duration-1000 ${
                                                activeTab === 'active' 
                                                ? 'bg-blue-500' 
                                                : 'bg-white/20'
                                            }`}
                                            style={{ 
                                                width: activeTab === 'active' && campaign.flightStart && campaign.flightEnd 
                                                    ? `${Math.min(100, Math.max(5, 
                                                        ((new Date().getTime() - new Date(campaign.flightStart).getTime()) / 
                                                        (new Date(campaign.flightEnd).getTime() - new Date(campaign.flightStart).getTime())) * 100
                                                    ))}%`
                                                    : '100%' 
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-12 text-center rounded-2xl bg-white/[0.01] border border-dashed border-white/5">
                    <p className="text-[10px] font-bold text-white/10 uppercase tracking-widest">
                        Nenhuma campanha {activeTab === 'active' ? 'ativa' : 'encerrada'} neste mês
                    </p>
                </div>
            )}
        </div>
    )
}
