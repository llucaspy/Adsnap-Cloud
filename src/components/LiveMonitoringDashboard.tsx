'use client'

import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
    Target, 
    Gamepad2, 
    BarChart3, 
    AlertCircle,
    RefreshCw,
    ExternalLink
} from 'lucide-react'
import { getLiveMetrics } from '@/app/monitoring/actions'
import { useCallback } from 'react'

interface LiveMetricsProps {
    campaignId: string
    campaignName: string
}

interface SiteData {
    site_id: number
    site_name: string
    purchases?: {
        cpm?: {
            quantity?: number
            total_data?: {
                valids?: number
                viewability?: number
                impressions?: number
            }
        }
    }
}

interface MonitoringData {
    campaign_id: number
    sites: SiteData[]
}

export function LiveMonitoringDashboard({ campaignId, campaignName }: LiveMetricsProps) {
    const [data, setData] = useState<MonitoringData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

    const fetchData = useCallback(async (isInitial = false) => {
        if (!isInitial) setLoading(true)
        const result = await getLiveMetrics(campaignId)
        if (result.success) {
            setData(result.data)
            setError(null)
            setLastUpdate(new Date())
        } else {
            setError(result.error || 'Erro ao carregar dados')
        }
        setLoading(false)
    }, [campaignId])

    useEffect(() => {
        let isMounted = true
        
        async function runInitial() {
            await fetchData(true)
        }

        runInitial()
        
        const interval = setInterval(() => {
            if (isMounted) fetchData(false)
        }, 60000)

        return () => {
            isMounted = false
            clearInterval(interval)
        }
    }, [fetchData])

    if (error) {
        return (
            <div className="p-8 rounded-[32px] bg-rose-500/10 border border-rose-500/20 text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
                <h3 className="text-xl font-bold text-white">Falha no Monitoramento</h3>
                <p className="text-rose-400/60 max-w-md mx-auto">{error}</p>
                <button 
                    onClick={() => fetchData(false)}
                    className="px-6 py-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors"
                >
                    Tentar Novamente
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">LIVE MONITORING</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tighter">{campaignName}</h1>
                </div>
                
                <div className="text-right">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">Última Atualização</p>
                    <div className="flex items-center gap-2 text-white/60 font-mono">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                        {lastUpdate.toLocaleTimeString()}
                    </div>
                </div>
            </div>

            {loading && !data ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-64 bg-white/5 rounded-[40px]" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {data?.sites.map((site, idx) => (
                        <SiteCard key={idx} site={site} />
                    ))}
                </div>
            )}
        </div>
    )
}

function SiteCard({ site }: { site: SiteData }) {
    const cpm = site.purchases?.cpm || {}
    const total = cpm.total_data || {}
    const contratado = cpm.quantity || 0
    const entregue = total.valids || 0
    const viewability = total.viewability || 0
    
    const ritmo = contratado > 0 ? (entregue / contratado) * 100 : 0
    const faltam = Math.max(0, contratado - entregue)

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 rounded-[40px] border border-white/5 hover:border-white/10 transition-all group overflow-hidden relative"
        >
            <div className="absolute top-0 right-0 p-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <ExternalLink size={20} className="text-white/20" />
            </div>

            <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-accent/20 border border-accent/20 flex items-center justify-center">
                    <Gamepad2 className="text-accent w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{site.site_name}</h3>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Veiculação Ativa</p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                    <MiniStat label="CONTRATADO" value={contratado.toLocaleString('pt-BR')} icon={<Target size={12}/>} />
                    <MiniStat label="ENTREGUE" value={entregue.toLocaleString('pt-BR')} color="text-accent" icon={<BarChart3 size={12}/>} />
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-white/20 uppercase">Ritmo de Entrega</span>
                        <span className="text-2xl font-black text-white">{ritmo.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-[2px] border border-white/5 bg-linear-to-r from-accent/20 to-transparent">
                        <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(ritmo, 100)}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className="h-full bg-linear-to-r from-accent to-purple-500 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                        />
                    </div>
                </div>

                <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-8">
                    <div>
                        <p className="text-[10px] font-bold text-white/30 uppercase mb-1">Viewability</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{(viewability * 100).toFixed(1)}</span>
                            <span className="text-sm font-bold text-white/20">%</span>
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-white/30 uppercase mb-1">A entregar</p>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{faltam.toLocaleString('pt-BR')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

function MiniStat({ label, value, color = "text-white", icon }: { label: string, value: string, color?: string, icon: React.ReactNode }) {
    return (
        <div className="p-4 rounded-3xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-1.5 mb-1 opacity-40">
                {icon}
                <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-lg font-black tracking-tighter ${color}`}>{value}</div>
        </div>
    )
}
