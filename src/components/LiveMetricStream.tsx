'use client'

import React from 'react'
import { Activity, ShieldCheck, Zap } from 'lucide-react'

export function LiveMetricStream({ stats }: { stats: any }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl mx-auto px-4">
            <MetricCard
                icon={ShieldCheck}
                label="PIs Ativos"
                value={stats.activePis}
                unit="CONTRATOS"
            />
            <MetricCard
                icon={Activity}
                label="Fluxo Operacional"
                value={stats.activeCampaigns}
                unit="CAMPANHAS"
                dimmed
            />
            <MetricCard
                icon={Zap}
                label="Matriz Técnica"
                value={stats.totalFormats}
                unit="FORMATOS"
                dimmed
            />
        </div>
    )
}

function MetricCard({ icon: Icon, label, value, unit, dimmed = false }: any) {
    const iconColor = dimmed ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.70)'
    const barColor = dimmed ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.55)'

    return (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group hover:border-white/15 transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/[0.02] to-transparent rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />

            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white/5 border border-white/8" style={{ color: iconColor }}>
                    <Icon size={20} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{label}</span>
            </div>

            <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter text-white" style={{ fontFamily: 'var(--font-display)' }}>
                    {value}
                </span>
                <span className="text-[10px] font-bold text-white/25">{unit}</span>
            </div>

            <div className="mt-4 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full animate-progress-glow rounded-full"
                    style={{
                        width: '70%',
                        background: barColor,
                        boxShadow: `0 0 8px ${barColor}`
                    }}
                />
            </div>
        </div>
    )
}
