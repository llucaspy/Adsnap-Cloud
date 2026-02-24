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
                color="var(--accent-light)"
            />
            <MetricCard
                icon={Activity}
                label="Fluxo Operacional"
                value={stats.activeCampaigns}
                unit="CAMPANHAS"
                color="var(--success)"
            />
            <MetricCard
                icon={Zap}
                label="Matriz Técnica"
                value={stats.totalFormats}
                unit="FORMATOS"
                color="var(--secondary)"
            />
        </div>
    )
}

function MetricCard({ icon: Icon, label, value, unit, color }: any) {
    return (
        <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/[0.03] to-transparent rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />

            <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-white/5" style={{ color }}>
                    <Icon size={20} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">{label}</span>
            </div>

            <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                    {value}
                </span>
                <span className="text-[10px] font-bold opacity-30">{unit}</span>
            </div>

            <div className="mt-4 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                    className="h-full animate-progress-glow"
                    style={{
                        width: '70%',
                        background: color,
                        boxShadow: `0 0 10px ${color}`
                    }}
                />
            </div>
        </div>
    )
}
