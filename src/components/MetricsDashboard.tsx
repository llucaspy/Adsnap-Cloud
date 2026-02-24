'use client'

import React, { useState, useEffect } from 'react'
import {
    Database,
    HardDrive,
    Mail,
    Activity,
    AlertTriangle,
    CheckCircle2,
    RefreshCw,
    TrendingUp,
    Clock
} from 'lucide-react'
import { getAdminMetrics } from '@/app/actions'

export function MetricsDashboard() {
    const [metrics, setMetrics] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const fetchMetrics = async () => {
        setRefreshing(true)
        try {
            const data = await getAdminMetrics()
            setMetrics(data)
        } catch (error) {
            console.error('Failed to fetch metrics:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchMetrics()
        const interval = setInterval(fetchMetrics, 300000) // 5 min
        return () => clearInterval(interval)
    }, [])

    if (loading) return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-white/5 rounded-[32px] border border-white/5" />
            ))}
        </div>
    )

    const formatTime = (date: Date) => {
        if (!date) return 'Nunca executado'
        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(date))
    }

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header with Refresh */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Activity className="text-accent w-6 h-6" />
                    <h2 className="text-xl font-bold text-white tracking-tight">Status da Infraestrutura</h2>
                </div>
                <button
                    onClick={fetchMetrics}
                    disabled={refreshing}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 transition-all active:scale-95 disabled:opacity-50"
                >
                    <RefreshCw size={18} className={`text-white/40 ${refreshing ? 'animate-spin text-accent' : ''}`} />
                </button>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                {/* Supabase Storage */}
                <MetricCard
                    title="Armazenamento (Storage)"
                    value={metrics.storage.formatted}
                    limit="1.0 GB"
                    percentage={metrics.storage.percentage}
                    icon={<HardDrive className="w-5 h-5 text-blue-400" />}
                    color="blue"
                    description="Prints e arquivos estáticos"
                />

                {/* Supabase Database */}
                <MetricCard
                    title="Banco de Dados (Postgres)"
                    value={metrics.database.formatted}
                    limit="500 MB"
                    percentage={metrics.database.percentage}
                    icon={<Database className="w-5 h-5 text-emerald-400" />}
                    color="emerald"
                    description="Tabelas e metadados"
                />

                {/* Resend Daily */}
                <MetricCard
                    title="Emails (Quota Diária)"
                    value={`${metrics.resend.dailyUsed} / ${metrics.resend.dailyLimit}`}
                    limit="100 Emails"
                    percentage={metrics.resend.percentage}
                    icon={<Mail className="w-5 h-5 text-purple-400" />}
                    color="purple"
                    description="Reset à meia-noite"
                />

                {/* Nexus Engine Health */}
                <div className="glass group rounded-[32px] p-6 border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between">
                    <div className="flex items-start justify-between">
                        <div className="p-3 rounded-2xl bg-orange-400/10 border border-orange-400/20">
                            <TrendingUp className="w-5 h-5 text-orange-400" />
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase ${metrics.health.isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                            {metrics.health.isHealthy ? <CheckCircle2 size={10} /> : <AlertTriangle size={10} />}
                            {metrics.health.isHealthy ? 'Operacional' : 'Sem Atividade'}
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">Último Ciclo Nexus</p>
                        <h3 className="text-lg font-black text-white flex items-center gap-2">
                            <Clock size={16} className="text-white/20" />
                            {formatTime(metrics.health.lastRun)}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Alert Banner if close to limits */}
            {(metrics.storage.percentage > 80 || metrics.database.percentage > 80 || metrics.resend.percentage > 80) && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-4 animate-bounce">
                    <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-500">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-rose-400">Limites Próximos do Esgotamento</h4>
                        <p className="text-xs text-rose-400/60">Algumas métricas do plano gratuito estão acima de 80%. Considere limpeza ou upgrade.</p>
                    </div>
                </div>
            )}
        </div>
    )
}

function MetricCard({ title, value, limit, percentage, icon, color, description }: any) {
    const colors: any = {
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20 text-blue-400',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
        purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/20 text-purple-400'
    }

    return (
        <div className="glass group rounded-[32px] p-6 border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between">
            <div className="flex items-start justify-between">
                <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 group-hover:scale-110 transition-transform`}>
                    {icon}
                </div>
                <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Limite: {limit}</span>
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">{title}</p>
                    <h3 className="text-2xl font-black text-white tracking-tighter">{value}</h3>
                    <p className="text-[10px] text-white/20 italic">{description}</p>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-white/40">USO ATUAL</span>
                        <span className={`text-${color}-400`}>{percentage.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={`h-full bg-gradient-to-r ${color === 'blue' ? 'from-blue-500 to-cyan-400' : color === 'emerald' ? 'from-emerald-500 to-teal-400' : 'from-purple-500 to-accent'} transition-all duration-1000`}
                            style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
