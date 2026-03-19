'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react'

interface DeliveryReportCardProps {
    campaign: {
        id: string
        client: string
        campaignName: string
        score: number
        reason?: string
        status?: string
        pacing?: number
        pacingPercent?: number
        isDelayedButHealthy?: boolean
        pressure?: number
        projection?: {
            completion?: number
            completionPercent?: number
        }
    }
    type: 'over' | 'under'
}

export function DeliveryReportCard({ campaign, type }: DeliveryReportCardProps) {
    const pacingPercent = campaign.pacingPercent ?? (campaign.pacing ? campaign.pacing * 100 : 0)

    const isDelayedButHealthy = campaign.isDelayedButHealthy ?? (
        campaign.status === 'on-track' &&
        (campaign.projection?.completionPercent ?? campaign.projection?.completion ?? 100) < 95
    )

    const isCritical =
        campaign.score < 60 || pacingPercent < 80

    const isOverValue = type === 'over' && !isDelayedButHealthy

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-3xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/20 transition-all group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${isOverValue ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {isOverValue ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="text-right">
                    <span className={`text-xs font-black uppercase tracking-widest ${isOverValue ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
                        {isDelayedButHealthy
                            ? 'RISCO OCULTO'
                            : isOverValue
                            ? 'ALTA PERFORMANCE'
                            : isCritical
                            ? 'CRÍTICO'
                            : 'ATENÇÃO'}
                    </span>
                    <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xl font-black text-white">{campaign.score}%</span>
                        <Activity size={12} className="text-white/20" />
                    </div>
                    {/* REAL PACING DISPLAY */}
                    <div className="text-[10px] text-white/40 font-mono mt-0.5">
                        pacing real: {pacingPercent.toFixed(1)}%
                    </div>
                </div>
            </div>

            <div className="space-y-1">
                <h4 className="text-sm font-bold text-white/90 truncate">{campaign.client}</h4>
                <p className="text-[11px] text-white/40 truncate font-mono uppercase tracking-tighter">
                    {campaign.campaignName}
                </p>
                
                {/* DELAYED BUT HEALTHY ALERT (CRITICAL FIX) */}
                {isDelayedButHealthy && (
                    <div className="mt-3 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <span className="text-[10px] font-black text-amber-600 uppercase">
                            ⚠️ campanha parece saudável mas está atrasada
                        </span>
                    </div>
                )}
            </div>

            {(isCritical || isDelayedButHealthy || campaign.reason) && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <AlertCircle size={10} className={isDelayedButHealthy ? 'text-amber-400' : 'text-rose-400'} />
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isDelayedButHealthy ? 'text-amber-400/80' : 'text-rose-400/80'}`}>
                        {isDelayedButHealthy
                            ? 'Projeção abaixo do esperado mesmo com pacing aparente'
                            : campaign.reason || 'Necessário revisão de entrega'}
                    </span>
                </div>
            )}
            
            {isOverValue && !isDelayedButHealthy && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-white/10" />
                        <div className="w-4 h-4 rounded-full bg-emerald-500/40 border border-white/10" />
                    </div>
                    <span className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-wider">Fluxo Estável</span>
                </div>
            )}
        </motion.div>
    )
}
