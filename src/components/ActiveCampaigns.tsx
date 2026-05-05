'use client'

import React, { useState, useEffect } from 'react'
import { getMonthlyCampaigns } from '@/app/books/actions'
import { Download, Rocket, Flag, Loader2, ChevronRight, Hash, Calendar, Layers } from 'lucide-react'
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
                    <h2 className="text-sm font-black text-white/80 uppercase tracking-[0.2em] mb-1">
                        Campanhas do M\u00eas
                    </h2>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest">
                        Acesso r\u00e1pido aos prints das campanhas em destaque
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
                            key={campaign.id}
                            className="group relative bg-[#0d0d12] border border-white/8 rounded-2xl p-5 hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="min-w-0 flex-1 pr-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/8 text-[8px] font-black text-white/40 uppercase tracking-tighter">
                                            PI {campaign.pi}
                                        </span>
                                        <span className="text-[9px] font-bold text-white/20 truncate">
                                            {campaign.agency}
                                        </span>
                                    </div>
                                    <h3 className="text-sm font-black text-white truncate group-hover:text-[#00ff88] transition-colors">
                                        {campaign.client}
                                    </h3>
                                    <p className="text-[10px] text-white/40 truncate">
                                        {campaign.campaignName || 'Sem nome'}
                                    </p>
                                </div>
                                <a
                                    href={`/api/books/download?pi=${campaign.pi}`}
                                    className="h-10 w-10 flex items-center justify-center rounded-xl bg-white text-black hover:scale-110 active:scale-95 transition-all shadow-lg"
                                    title="Download ZIP Completo"
                                >
                                    <Download size={16} />
                                </a>
                            </div>

                            <div className="space-y-3">
                                {/* Details Row */}
                                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-white/20">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar size={10} strokeWidth={3} />
                                        <span>
                                            {campaign.flightStart ? format(new Date(campaign.flightStart), "dd/MM") : '?'} \u2014 {campaign.flightEnd ? format(new Date(campaign.flightEnd), "dd/MM") : 'Ongoing'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Layers size={10} strokeWidth={3} />
                                        <span>{campaign._count.captures} prints</span>
                                    </div>
                                </div>

                                {/* Progress Mock/Bar if active */}
                                {activeTab === 'active' && campaign.flightStart && campaign.flightEnd && (
                                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full"
                                            style={{ 
                                                width: `${Math.min(100, Math.max(0, 
                                                    ((new Date().getTime() - new Date(campaign.flightStart).getTime()) / 
                                                    (new Date(campaign.flightEnd).getTime() - new Date(campaign.flightStart).getTime())) * 100
                                                ))}%` 
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Hover info decoration */}
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <ChevronRight size={14} className="text-white/20" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-12 text-center rounded-2xl bg-white/[0.015] border border-dashed border-white/8">
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        Nenhuma campanha {activeTab === 'active' ? 'ativa' : 'encerrada'} neste m\u00eas
                    </p>
                </div>
            )}
        </div>
    )
}
