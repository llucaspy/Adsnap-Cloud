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
    }
    type: 'over' | 'under'
}

export function DeliveryReportCard({ campaign, type }: DeliveryReportCardProps) {
    const isOver = type === 'over'

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-3xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/20 transition-all group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${isOver ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {isOver ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                </div>
                <div className="text-right">
                    <span className={`text-xs font-black uppercase tracking-widest ${isOver ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>
                        {isOver ? 'ALTA PERFORMANCE' : 'ATENÇÃO REQUERIDA'}
                    </span>
                    <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xl font-black text-white">{campaign.score}%</span>
                        <Activity size={12} className="text-white/20" />
                    </div>
                </div>
            </div>

            <div className="space-y-1">
                <h4 className="text-sm font-bold text-white/90 truncate">{campaign.client}</h4>
                <p className="text-[11px] text-white/40 truncate font-mono uppercase tracking-tighter">
                    {campaign.campaignName}
                </p>
            </div>

            {!isOver && campaign.reason && (
                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <AlertCircle size={10} className="text-rose-400" />
                    <span className="text-[10px] font-bold text-rose-400/80 uppercase tracking-wider">{campaign.reason}</span>
                </div>
            )}
            
            {isOver && (
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
