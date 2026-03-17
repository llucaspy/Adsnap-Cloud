'use client'

import React, { useState, useEffect } from 'react'
import { 
    Activity, 
    Calendar, 
    Target, 
    Eye, 
    TrendingUp, 
    ChevronDown,
    AlertCircle,
    CheckCircle2,
    Clock,
    X,
    Bell
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// --- Notifications System ---
const ALERT_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'

type ToastType = 'critical' | 'warning' | 'info'

interface Toast {
    id: string
    title: string
    message: string
    type: ToastType
}

const ToastContext = React.createContext<{
    addToast: (title: string, message: string, type: ToastType) => void
} | null>(null)

function useToast() {
    const context = React.useContext(ToastContext)
    if (!context) throw new Error('useToast must be used within ToastProvider')
    return context
}

function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = (title: string, message: string, type: ToastType) => {
        const id = Math.random().toString(36).substring(2, 9)
        setToasts(prev => [...prev, { id, title, message, type }])
        
        // Play sound
        const audio = new Audio(ALERT_SOUND_URL)
        audio.volume = 0.4
        audio.play().catch(e => console.log('Audio play blocked:', e))

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 5000)
    }

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-80 pointer-events-none">
                <AnimatePresence mode="popLayout">
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            layout
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                            className={`pointer-events-auto p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex gap-4 ${
                                toast.type === 'critical' ? 'bg-rose-50/90 border-rose-200' : 
                                toast.type === 'warning' ? 'bg-orange-50/90 border-orange-200' : 
                                'bg-white/90 border-zinc-200'
                            }`}
                        >
                            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                toast.type === 'critical' ? 'bg-rose-500 text-white' : 
                                toast.type === 'warning' ? 'bg-orange-500 text-white' : 
                                'bg-zinc-900 text-white'
                            }`}>
                                {toast.type === 'critical' ? <AlertCircle size={20} /> : <Bell size={20} />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-black uppercase tracking-widest text-zinc-900 leading-none mb-1">{toast.title}</div>
                                <div className="text-xs text-zinc-500 font-medium leading-relaxed">{toast.message}</div>
                            </div>
                            <button 
                                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                                className="shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    )
}
// -----------------------------

interface Format {
    name: string
    goal: number
    delivered: number
    viewability: number
    pacing: number
}

interface Campaign {
    id: string
    name: string
    advertiser: string
    campaignName: string
    startDate: string
    endDate: string
    goalImpressions: number
    deliveredImpressions: number
    viewability: number
    status: 'on-track' | 'warning' | 'critical' | 'over'
    formats: Format[]
}

interface AdOpsStats {
    total: number
    onTrackCount: number
    healthScore: number
    atRiskCount: number
    campaigns: Campaign[]
}

// Helper functions (adapted from reference)
function formatNumber(n: number): string {
    return n.toLocaleString('pt-BR')
}

function getTimeElapsed(start: string, end: string): number {
    const s = new Date(start).getTime()
    const e = new Date(end).getTime()
    const now = Date.now()
    if (now >= e) return 100
    if (now <= s) return 0
    return ((now - s) / (e - s)) * 100
}

function getDaysRemaining(end: string): number {
    const diff = new Date(end).getTime() - Date.now()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

function getDailyNeeded(delivered: number, goal: number, end: string): number {
    const days = getDaysRemaining(end)
    if (days <= 0) return 0
    const remaining = goal - delivered
    return Math.max(0, Math.ceil(remaining / days))
}

export default function AdOpsDashboardView({ stats, campaigns }: { stats: AdOpsStats, campaigns: Campaign[] }) {
    return (
        <ToastProvider>
            <DashboardContent stats={stats} campaigns={campaigns} />
        </ToastProvider>
    )
}

function DashboardContent({ stats, campaigns }: { stats: AdOpsStats, campaigns: Campaign[] }) {
    const [activeTab, setActiveTab] = useState<'tudo' | 'critical' | 'warning' | 'on-track' | 'over'>('tudo')

    const filteredCampaigns = activeTab === 'tudo'
        ? campaigns
        : campaigns.filter(c => c.status === activeTab)

    return (
        <div className="space-y-8 animate-slide-up pb-20">
            {/* Header Area */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="h-5 w-5 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                            <Activity className="h-3 w-3 text-emerald-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Painel de Performance AdOps</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tighter">Visão Geral de Entrega</h1>
                    <p className="text-xs text-white/40 mt-1 font-medium">
                        {stats.atRiskCount} campanhas requerem atenção imediata.
                    </p>
                </div>
                <div className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 px-4 py-2 rounded-xl backdrop-blur-md">
                  <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Status Global:</span>
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Saudável</span>
                  </div>
                </div>
            </header>

            {/* Health Score Grid */}
            <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <HealthCard 
                    label="Saúde da Operação" 
                    value={`${stats.healthScore}%`} 
                    sub={`${stats.onTrackCount}/${stats.total} no prazo`} 
                    icon={TrendingUp}
                    index={0}
                />
                <HealthCard 
                    label="Em Risco" 
                    value={stats.atRiskCount} 
                    sub="campanhas críticas" 
                    icon={AlertCircle}
                    highlight={stats.atRiskCount > 0}
                    index={1}
                />
                <HealthCard 
                    label="Entrega Total (Real)" 
                    value={formatNumber(stats.campaigns.reduce((s: number, c: Campaign) => s + c.deliveredImpressions, 0))} 
                    sub={`meta: ${formatNumber(stats.campaigns.reduce((s: number, c: Campaign) => s + c.goalImpressions, 0))}`} 
                    icon={Target}
                    index={2}
                />
                <HealthCard 
                    label="Média Viewability" 
                    value={`${(stats.campaigns.reduce((s: number, c: Campaign) => s + c.viewability, 0) / (stats.total || 1)).toFixed(1)}%`} 
                    sub="métrica consolidada" 
                    icon={Eye}
                    index={3}
                />
            </section>

            {/* Filters Area */}
            <div className="flex gap-3 flex-wrap items-center">
                <FilterButton label="Tudo" active={activeTab === 'tudo'} count={stats.total} onClick={() => setActiveTab('tudo')} />
                <FilterButton label="Crítico" active={activeTab === 'critical'} count={stats.campaigns.filter((c: Campaign) => c.status === 'critical').length} onClick={() => setActiveTab('critical')} color="text-rose-500" />
                <FilterButton label="Under" active={activeTab === 'warning'} count={stats.campaigns.filter((c: Campaign) => c.status === 'warning').length} onClick={() => setActiveTab('warning')} color="text-orange-500" />
                <FilterButton label="No Prazo" active={activeTab === 'on-track'} count={stats.campaigns.filter((c: Campaign) => c.status === 'on-track').length} onClick={() => setActiveTab('on-track')} color="text-emerald-500" />
                <FilterButton label="Over" active={activeTab === 'over'} count={stats.campaigns.filter((c: Campaign) => c.status === 'over').length} onClick={() => setActiveTab('over')} color="text-blue-500" />
            </div>

            {/* Campaign Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                    {filteredCampaigns.map((campaign, i) => (
                        <CampaignRefCard key={campaign.id} campaign={campaign} index={i} />
                    ))}
                    {filteredCampaigns.length === 0 && (
                        <motion.div 
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            className="col-span-full py-20 flex flex-col items-center justify-center bg-zinc-900/30 border border-dashed border-white/5 rounded-3xl"
                        >
                            <CheckCircle2 size={40} className="text-white/10 mb-4" />
                            <p className="text-[11px] font-black text-white/20 uppercase tracking-[0.4em]">Nenhuma campanha neste status</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    )
}

function HealthCard({ label, value, sub, icon: Icon, highlight, index }: { label: string, value: string | number, sub: string, icon: React.ElementType, highlight?: boolean, index: number }) {

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`bg-white border rounded-2xl p-6 relative overflow-hidden group shadow-sm transition-all duration-500 hover:shadow-md border-zinc-200`}
        >
            <div className="absolute -right-4 -top-4 opacity-[0.05] group-hover:opacity-[0.1] transition-opacity text-black">
                <Icon size={120} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">{label}</p>
            <p className={`text-4xl font-black tracking-tighter ${highlight ? 'text-rose-600' : 'text-zinc-900'}`}>
                {value}
            </p>
            <p className="text-[11px] font-medium text-zinc-500 mt-1 uppercase tracking-wider">{sub}</p>
        </motion.div>
    )
}

function FilterButton({ label, active, count, onClick, color }: { label: string, active: boolean, count: number, onClick: () => void, color?: string }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 border ${
                active 
                    ? 'bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]' 
                    : 'bg-zinc-900/50 text-white/40 border-white/5 hover:border-white/20 hover:text-white backdrop-blur-md'
            }`}
        >
            <span className={active ? '' : color}>{label}</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${active ? 'bg-black/10' : 'bg-white/5'}`}>{count}</span>
        </button>
    )
}

const STATUS_STYLES: Record<string, { text: string, bg: string, border: string, label: string, ring: string, shadow: string, glow: string }> = {
    'critical': { text: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', label: 'CRÍTICO', ring: 'ring-rose-500/20', shadow: 'hover:shadow-rose-500/10', glow: 'bg-rose-500' },
    'warning': { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', label: 'UNDER', ring: 'ring-orange-500/20', shadow: 'hover:shadow-orange-500/10', glow: 'bg-orange-500' },
    'on-track': { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', label: 'NO PRAZO', ring: 'ring-emerald-500/20', shadow: 'hover:shadow-emerald-500/10', glow: 'bg-emerald-500' },
    'over': { text: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', label: 'OVER', ring: 'ring-blue-500/20', shadow: 'hover:shadow-blue-500/10', glow: 'bg-blue-500' }
}

function CampaignRefCard({ campaign, index }: { campaign: Campaign, index: number }) {
    const [expanded, setExpanded] = useState(false)
    const [mounted, setMounted] = useState(false)
    const { addToast } = useToast()
    const lastStatus = React.useRef(campaign.status)
    
    useEffect(() => {
        setMounted(true)
    }, [])

    // Monitor status changes for alerts
    useEffect(() => {
        if (!mounted) return

        if (lastStatus.current !== campaign.status) {
            if (campaign.status === 'critical') {
                addToast('Alerta Crítico!', `A campanha ${campaign.name} está em estado crítico de entrega.`, 'critical')
            } else if (campaign.status === 'warning') {
                addToast('Atenção!', `A campanha ${campaign.name} está abaixo do pacing esperado.`, 'warning')
            } else if (campaign.status === 'over') {
                addToast('Overdelivery!', `A campanha ${campaign.name} ultrapassou a meta.`, 'info')
            }
            lastStatus.current = campaign.status
        }
    }, [campaign.status, campaign.name, addToast, mounted])

    const timeElapsed = mounted ? getTimeElapsed(campaign.startDate, campaign.endDate) : 0
    const margin = campaign.deliveredImpressions - campaign.goalImpressions
    const dailyNeeded = mounted ? getDailyNeeded(campaign.deliveredImpressions, campaign.goalImpressions, campaign.endDate) : 0

    const { text, bg, border, label, ring, shadow, glow } = STATUS_STYLES[campaign.status]

    const [mousePos, setMousePos] = useState({ x: 50, y: 50 })
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePos({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        })
    }

    // Use any for variants to avoid complex TargetAndTransition / TargetResolver type conflicts in React 19 + Framer Motion
    const containerVariants: any = {
        hidden: { opacity: 0, y: 30, scale: 0.98 },
        visible: (i: number) => ({ 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { 
                delay: Math.min(i * 0.05, 0.5),
                duration: 0.8,
                ease: "circOut",
                staggerChildren: 0.1,
                delayChildren: Math.min(i * 0.05, 0.5) + 0.2
            }
        })
    }

    const itemVariants: any = {
        hidden: { opacity: 0, y: 15, scale: 0.95 },
        visible: { 
            opacity: 1, 
            y: 0, 
            scale: 1,
            transition: { 
                duration: 0.5, 
                ease: "circOut"
            } 
        }
    }

    return (
        <motion.div
            layout
            custom={index}
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            onMouseMove={handleMouseMove}
            style={{ 
                boxShadow: expanded 
                    ? `0 30px 60px -15px ${glow.replace('bg-', 'rgba(').replace('500', '500, 0.25')}, 0 0 0 1px ${ring.replace('ring-', 'rgba(').replace('20', '5')}` 
                    : undefined 
            }}
            className={`rounded-4xl bg-white border border-zinc-200 cursor-pointer group transition-all duration-700 shadow-sm hover:shadow-2xl ${shadow} ${expanded ? `col-span-full ring-4 ${ring}` : 'hover:-translate-y-3'} relative overflow-hidden`}
            onClick={() => setExpanded(!expanded)}
        >
            {/* Magnetic Hover Light */}
            <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-700 pointer-events-none z-0"
                style={{
                    background: `radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, ${glow.replace('bg-', 'rgba(')} 0%, transparent 60%)`
                }}
            />

            {/* Subtle Texture/Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay z-0 bg-[radial-gradient(#000_1px,transparent_1px)] bg-size-[16px_16px]" />

            <div className={`relative z-10 transition-all duration-700 ${expanded ? 'p-8 space-y-8 bg-linear-to-b from-white/90 to-zinc-50/90 backdrop-blur-xl' : 'p-6 space-y-6'}`}>
                {/* Decorative background glow */}
                <div className={`absolute -right-20 -top-20 w-40 h-40 rounded-full blur-[100px] opacity-0 group-hover:opacity-20 transition-opacity duration-1000 ${glow}`} />
                
                {/* Header row */}
                <div className="flex items-start justify-between gap-6 relative z-10">
                    <div className="min-w-0 flex-1">
                        <div className="text-3xl font-black text-zinc-900 tracking-tighter truncate uppercase leading-none mb-3 group-hover:text-zinc-950 transition-colors duration-500 group-hover:tracking-normal drop-shadow-sm">{campaign.name}</div>
                        <div className="flex items-center gap-3">
                             <div className={`h-2.5 w-2.5 rounded-full ${glow} shadow-[0_0_15px_rgba(0,0,0,0.1)] group-hover:animate-ping`} />
                             <div className="text-xs font-black text-zinc-400 truncate uppercase tracking-[0.35em] group-hover:text-zinc-500 transition-colors">{campaign.advertiser}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        <div className={`px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-[0.25em] border backdrop-blur-sm transition-all duration-500 shadow-sm group-hover:shadow-md ${bg} ${text} ${border}`}>
                            {label}
                        </div>
                        <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-all duration-500">
                            <ChevronDown className={`w-5 h-5 transition-transform duration-700 cubic-bezier(0.4, 0, 0.2, 1) ${expanded ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                </div>

                {/* Pacing Indicator */}
                <div className="space-y-4 bg-zinc-50/50 p-6 rounded-3xl border border-zinc-100/50 relative group/pacing overflow-hidden transition-all duration-500 hover:bg-zinc-50 hover:border-zinc-200">
                    <div className="flex justify-between items-center text-[10px] font-black tracking-[0.2em] uppercase mb-1 relative z-10">
                        <span className="text-zinc-400">Entrega vs. Pacing Esperado</span>
                        <div className="flex items-center gap-2">
                             <TrendingUp size={14} className={text} />
                            <span className={`${text} font-black text-xl tabular-nums`}>{((campaign.deliveredImpressions / campaign.goalImpressions) * 100).toFixed(1)}%</span>
                        </div>
                    </div>
                    <div className="h-4 w-full bg-zinc-200/50 rounded-full overflow-hidden flex items-center px-1 relative">
                        <div className="relative w-full h-full">
                            {/* Target/Pacing Marker */}
                            <div 
                                className="absolute top-0 h-full bg-white border-2 border-zinc-900 z-20 w-[6px] rounded-full shadow-lg transition-all duration-1000"
                                style={{ left: `${timeElapsed}%`, transform: 'translateX(-50%)' }}
                                title="Data Atual"
                            />
                            {/* Glassy track */}
                            <div 
                                className={`h-full rounded-full transition-all duration-2500 cubic-bezier(0.16, 1, 0.3, 1) relative z-10 shadow-[inner_0_2px_8px_rgba(0,0,0,0.1)] ${campaign.status === 'on-track' ? 'bg-linear-to-r from-emerald-400 via-emerald-500 to-emerald-600' : campaign.status === 'critical' ? 'bg-linear-to-r from-rose-400 via-rose-500 to-rose-600' : 'bg-linear-to-r from-orange-400 via-orange-500 to-orange-600'}`}
                                style={{ width: `${Math.min((campaign.deliveredImpressions / campaign.goalImpressions) * 100, 100)}%` }}
                            >
                                <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/50 to-transparent animate-progress-glow" />
                                {/* End shimmer live pulse */}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-[0_0_15px_white] animate-[pulse_1.5s_ease-in-out_infinite]" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Key Metrics */}
                <div className={`grid grid-cols-3 transition-all duration-500 ${expanded ? 'gap-6' : 'gap-3'}`}>
                    <motion.div variants={itemVariants} className={`rounded-4xl bg-zinc-50/40 border border-zinc-100/50 hover:bg-white hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 group/metric relative overflow-hidden ${expanded ? 'p-6 text-left' : 'p-4 text-center'}`}>
                        <div className="absolute inset-0 opacity-0 group-hover/metric:opacity-10 transition-opacity bg-linear-to-br from-emerald-500 to-transparent" />
                        <div className="relative z-10">
                            <div className={`font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2 ${expanded ? 'text-[10px] mb-4' : 'text-[8px] mb-2 justify-center'}`}>
                                <div className="h-2 w-2 rounded-full bg-zinc-300 group-hover/metric:bg-emerald-500 group-hover/metric:scale-125 transition-all duration-500" /> 
                                <span>Entregue</span>
                            </div>
                            <div className={`font-black text-zinc-900 tabular-nums leading-none tracking-tighter group-hover/metric:scale-105 transition-transform duration-500 ${expanded ? 'text-4xl origin-left' : 'text-xl'}`}>{formatNumber(campaign.deliveredImpressions)}</div>
                        </div>
                    </motion.div>
                    
                    <motion.div variants={itemVariants} className={`rounded-4xl bg-zinc-50/40 border border-zinc-100/50 hover:bg-white transition-all duration-500 group/metric relative overflow-hidden ${expanded ? 'p-6 text-left' : 'p-4 text-center'}`}>
                        <div className="relative z-10">
                            <div className={`font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2 ${expanded ? 'text-[10px] mb-4' : 'text-[8px] mb-2 justify-center'}`}>
                                <div className="h-2 w-2 rounded-full bg-zinc-200" /> 
                                <span>Meta</span>
                            </div>
                            <div className={`font-bold text-zinc-400 tabular-nums leading-none tracking-tighter group-hover/metric:text-zinc-600 transition-colors ${expanded ? 'text-4xl origin-left' : 'text-xl'}`}>{formatNumber(campaign.goalImpressions)}</div>
                        </div>
                    </motion.div>
                    
                    <motion.div variants={itemVariants} className={`rounded-4xl border transition-all duration-500 group/metric relative overflow-hidden ${margin < 0 ? 'bg-rose-50/30 border-rose-100 hover:bg-rose-50 hover:shadow-2xl hover:shadow-rose-500/10' : 'bg-emerald-50/30 border-emerald-100 hover:bg-emerald-50 hover:shadow-2xl hover:shadow-emerald-500/10'} ${expanded ? 'p-6 text-left' : 'p-4 text-center'}`}>
                        <div className="absolute inset-0 opacity-0 group-hover/metric:opacity-10 transition-opacity bg-linear-to-br from-current to-transparent" />
                        {/* Glass Reflection */}
                        <div className="absolute -inset-full bg-linear-to-br from-white/20 via-transparent to-transparent rotate-45 group-hover/metric:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />
                        
                        <div className="relative z-10">
                            <div className={`font-black text-zinc-400 uppercase tracking-[0.25em] flex items-center gap-2 ${expanded ? 'text-[10px] mb-4' : 'text-[8px] mb-2 justify-center'}`}>
                                <div className={`h-2 w-2 rounded-full ${margin < 0 ? 'bg-rose-400' : 'bg-emerald-400'} animate-pulse`} /> 
                                <span>Margem</span>
                            </div>
                            <div className={`font-black tabular-nums leading-none tracking-tighter group-hover/metric:scale-105 transition-transform duration-500 ${margin < 0 ? 'text-rose-600' : 'text-emerald-600'} ${expanded ? 'text-4xl origin-left' : 'text-xl'}`}>
                                {margin >= 0 ? '+' : ''}{formatNumber(margin)}
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Expandable Info */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-zinc-100 bg-zinc-50/50"
                    >
                        <div className="p-5 border-t border-zinc-100 bg-zinc-50/30">
                            {/* Detailed Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                        <Calendar size={14} />
                                        <span className="text-[10px] uppercase tracking-widest">Período</span>
                                    </div>
                                    <div className="text-xs font-semibold text-zinc-600">
                                        {format(new Date(campaign.startDate), 'dd/MM/yy', { locale: ptBR })} – {format(new Date(campaign.endDate), 'dd/MM/yy', { locale: ptBR })}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                        <Eye size={14} />
                                        <span className="text-[10px] uppercase tracking-widest">Viewability</span>
                                    </div>
                                    <div className={`text-sm font-black ${campaign.viewability >= 70 ? 'text-emerald-600' : 'text-orange-600'}`}>
                                        {campaign.viewability.toFixed(1)}%
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                        <Clock size={14} />
                                        <span className="text-[10px] uppercase tracking-widest">Tempo</span>
                                    </div>
                                    <div className="text-xs font-semibold text-zinc-600">{mounted ? getDaysRemaining(campaign.endDate) : '--'} dias restantes</div>
                                </div>
                                {margin < 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-rose-500/60 font-bold">
                                            <TrendingUp size={14} />
                                            <span className="text-[10px] uppercase tracking-widest">Entrega/Dia</span>
                                        </div>
                                        <div className="text-xs font-bold text-rose-500 tabular-nums">
                                            {formatNumber(dailyNeeded)}/dia
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Formats Table */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.22em]">Detalhamento por Formato</span>
                                    <span className="text-[10px] font-semibold text-zinc-300 uppercase">{campaign.formats.length} formatos</span>
                                </div>
                                
                                <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-zinc-50 border-b border-zinc-100 font-mono text-[9px] font-black text-zinc-400 uppercase tracking-widest">
                                                <th className="px-5 py-4">Formato/Site</th>
                                                <th className="px-5 py-4 text-right">Meta</th>
                                                <th className="px-5 py-4 text-right">Entrega</th>
                                                <th className="px-5 py-4 text-right">Pacing</th>
                                                <th className="px-5 py-4 text-right">View.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50 font-mono text-[11px]">
                                            {campaign.formats.map((f, fi) => (
                                                <tr key={fi} className="hover:bg-zinc-50/80 transition-colors group/row">
                                                    <td className="px-5 py-3.5 font-bold text-zinc-700 group-hover/row:text-zinc-900 transition-colors">
                                                        {f.name}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right text-zinc-400 font-medium">
                                                        {formatNumber(f.goal)}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right font-black text-zinc-900 uppercase group-hover/row:text-emerald-600 transition-colors">
                                                        {formatNumber(f.delivered)}
                                                    </td>
                                                    <td className={`px-5 py-3.5 text-right font-black ${f.pacing < 50 ? 'text-rose-600' : f.pacing < 90 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                                        {f.pacing.toFixed(1)}%
                                                    </td>
                                                    <td className="px-5 py-3.5 text-right font-bold text-zinc-400">
                                                        {f.viewability.toFixed(0)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
