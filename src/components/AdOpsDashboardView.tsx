'use client'

import React, { useState, useEffect, useSyncExternalStore } from 'react'
import { 
    Activity, 
    Calendar, 
    Target, 
    Eye, 
    TrendingUp, 
    ChevronDown,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    X,
    Bell,
    Zap,
    Layout,
    HelpCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

// --- Constants ---
const REFRESH_INTERVAL = 120000 // 2 minutes
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
    campaignName?: string
    startDate: string
    endDate: string
    goalImpressions: number
    deliveredImpressions: number
    pacing: number // Real-time pacing (0-2)
    pacingPercent: number
    viewability: number
    status: 'on-track' | 'warning' | 'critical' | 'over'
    formats: Format[]
    projection: {
        completion: number
        completionPercent: number
        total: number
        dailyRate: number
    }
    requiredDaily: number
    currentDaily: number
    pressure: number
    timeProgress: number
    deliveryProgress: number
    isDelayedButHealthy: boolean
    diagnostics: string[]
    pi: string
    manualDashboardUrl: string | null
    smartAlert: string | null
    score: number
    apiAvailable?: boolean
    fetchedAt?: string | null
    bi: {
        trend: 'up' | 'down' | 'neutral'
        deliveredToday: number
        recommendations: string[]
        history: { date: string, value: number }[]
    }
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
    return Math.round(n).toLocaleString('pt-BR')
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

export default function AdOpsDashboardView({ stats, campaigns }: { stats: AdOpsStats, campaigns: Campaign[] }) {
    const router = useRouter()
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Auto-refresh every 2 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh()
        }, REFRESH_INTERVAL)
        return () => clearInterval(interval)
    }, [router])

    const handleManualRefresh = () => {
        setIsRefreshing(true)
        router.refresh()
        setTimeout(() => setIsRefreshing(false), 2000)
    }

    return (
        <ToastProvider>
            <DashboardContent 
                stats={stats} 
                campaigns={campaigns} 
                onRefresh={handleManualRefresh}
                isRefreshing={isRefreshing}
            />
        </ToastProvider>
    )
}

function DashboardContent({ stats, campaigns, onRefresh, isRefreshing }: { stats: AdOpsStats, campaigns: Campaign[], onRefresh: () => void, isRefreshing: boolean }) {
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
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-black text-white tracking-tighter">Visão Geral de Entrega</h1>
                        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 group/live cursor-default">
                           <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Vivo (2m)</span>
                        </div>
                    </div>
                    <p className="text-xs text-white/40 mt-1 font-medium">
                        {stats.atRiskCount} campanhas requerem atenção imediata.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                    {isRefreshing ? 'Atualizando...' : 'Atualizar Agora'}
                  </button>
                  <div className="flex items-center gap-3 bg-zinc-900/50 border border-white/5 px-4 py-2 rounded-xl backdrop-blur-md">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Status Global:</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Saudável</span>
                    </div>
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
    const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
    const { addToast } = useToast()
    const lastStatus = React.useRef(campaign.status)
    
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
    const isFakeHealthy = campaign.status === 'on-track' && (campaign.projection?.completionPercent || 0) < 95

    const { text, bg, border, label, ring, shadow, glow } = STATUS_STYLES[campaign.status]

    const [mousePos, setMousePos] = useState({ x: 50, y: 50 })
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        setMousePos({
            x: ((e.clientX - rect.left) / rect.width) * 100,
            y: ((e.clientY - rect.top) / rect.height) * 100
        })
    }
    
    const [showPacingHelp, setShowPacingHelp] = useState(false)

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

    const formatLastUpdate = (iso: string | null | undefined) => {
        if (!iso) return 'Desconhecido'
        try {
            return format(new Date(iso), "HH:mm 'de' dd/MM", { locale: ptBR })
        } catch {
            return 'Erro no formato'
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
                             <div className="text-xs font-black text-zinc-400 truncate uppercase tracking-[0.35em] group-hover:text-zinc-500 transition-colors">
                                {campaign.advertiser} • PI {campaign.pi}
                             </div>
                             {campaign.projection && (
                                <div className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${campaign.projection.completionPercent < 95 ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'}`}>
                                    PROJEÇÃO: {campaign.projection.completionPercent.toFixed(1)}%
                                </div>
                             )}
                             <div className={`px-2 py-0.5 rounded-md text-[9px] font-black border ${campaign.score < 80 ? 'bg-rose-500/10 border-rose-500/20 text-rose-500' : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-500'}`}>
                                BI SCORE: {campaign.score}/100
                             </div>
                             {campaign.apiAvailable === false && (
                                <div className="px-2 py-0.5 rounded-md text-[9px] font-black bg-rose-500 text-white animate-pulse">
                                    🔌 API OFF
                                </div>
                             )}
                             {campaign.fetchedAt && (
                                <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">
                                    Atualizado: {formatLastUpdate(campaign.fetchedAt)}
                                </div>
                             )}
                        </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                        {campaign.manualDashboardUrl && (
                            <a 
                                href={campaign.manualDashboardUrl as string}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:bg-indigo-500/20 transition-all"
                            >
                                <Layout size={12} />
                                Dashboard
                            </a>
                        )}
                        <div className="flex items-center gap-2">
                            <div className={`px-5 py-2.5 rounded-2xl text-[10px] font-black tracking-[0.25em] border backdrop-blur-sm transition-all duration-500 shadow-sm group-hover:shadow-md ${bg} ${text} ${border}`}>
                                {label}
                            </div>
                            <div className="px-4 py-2.5 rounded-2xl bg-zinc-900 text-zinc-50 text-[10px] font-black uppercase tracking-widest border border-zinc-800 shadow-xl group-hover:bg-emerald-600 transition-colors duration-500">
                                Projeção: {campaign.projection.completionPercent.toFixed(1)}%
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 group-hover:bg-zinc-900 group-hover:text-white transition-all duration-500">
                            <ChevronDown className={`w-5 h-5 transition-transform duration-700 cubic-bezier(0.4, 0, 0.2, 1) ${expanded ? 'rotate-180' : ''}`} />
                        </div>
                    </div>
                </div>

                {/* Alerta de Saúde (Fake Healthy) */}
                {isFakeHealthy && (
                    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                        <AlertTriangle size={14} className="text-amber-500" />
                        Atenção: Campanha parece saudável mas está com projeção baixa
                    </div>
                )}

                {/* Smart Alert (PROMINENT BI INSIGHT) */}
                {campaign.smartAlert && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[11px] font-black uppercase tracking-wider flex items-start gap-3 shadow-[0_0_20px_rgba(245,158,11,0.05)]"
                    >
                        <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
                        {campaign.smartAlert}
                    </motion.div>
                )}

                {/* Intelligent Insights / Diagnostics */}
                {campaign.diagnostics && campaign.diagnostics.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {campaign.diagnostics.map((d, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-100/50 border border-zinc-200 text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                                <AlertCircle size={10} className={d.includes('Risco') || d.includes('Atraso') ? 'text-rose-600' : 'text-orange-600'} />
                                {d}
                            </div>
                        ))}
                    </div>
                )}

                {/* BI Agent Recommendations */}
                {campaign.bi?.recommendations && campaign.bi.recommendations.length > 0 && (
                    <div className="space-y-2 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50 block">
                        <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">
                            <Zap size={10} className="fill-indigo-500" />
                            Insight do Agente BI
                        </div>
                        {campaign.bi.recommendations.map((rec, i) => (
                            <div key={i} className="text-xs font-bold text-indigo-900 border-l-2 border-indigo-200 pl-3 py-0.5 leading-relaxed">
                                {rec}
                            </div>
                        ))}
                    </div>
                )}

                {/* Pacing Info Box */}
                <AnimatePresence>
                    {showPacingHelp && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0, scale: 0.95 }}
                            animate={{ opacity: 1, height: 'auto', scale: 1 }}
                            exit={{ opacity: 0, height: 0, scale: 0.95 }}
                            className="bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-100 p-4 rounded-3xl mb-4 leading-relaxed relative overflow-hidden shadow-2xl z-20"
                        >
                            <div className="font-bold mb-2 flex items-center gap-2 text-zinc-100">
                                <HelpCircle size={14} className="text-emerald-400" />
                                Como ler esta métrica?
                            </div>
                            <p className="mb-2 text-zinc-400">
                                Esta barra mostra o <strong>Pacing Ratio</strong>: o quanto você entregou comparado ao que era esperado para o tempo decorrido.
                            </p>
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" /> <span>95-105%: No prazo</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]" /> <span>80-95%: Atenção</span></div>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" /> <span>&lt; 80%: Crítico</span></div>
                                    <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" /> <span>&gt; 105%: Over</span></div>
                                </div>
                            </div>
                            <p className="mt-3 pt-3 border-t border-zinc-800 text-[10px] text-zinc-500 italic">
                                A <strong>linha branca</strong> vertical indica o progresso do cronograma hoje.
                            </p>
                            <button 
                                onClick={() => setShowPacingHelp(false)}
                                className="absolute top-3 right-3 p-1 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500"
                            >
                                <X size={14} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Pacing Indicator */}
                <div className="space-y-4 bg-zinc-50/50 p-6 rounded-3xl border border-zinc-100/50 relative group/pacing overflow-hidden transition-all duration-500 hover:bg-zinc-50 hover:border-zinc-200">
                    <div className="flex justify-between items-center text-[10px] font-black tracking-[0.2em] uppercase mb-1 relative z-10">
                        <span className="text-zinc-400 flex items-center gap-1.5">
                            Progresso vs Tempo
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPacingHelp(!showPacingHelp);
                                }}
                                className="p-1.5 hover:bg-zinc-200 rounded-full transition-colors"
                                title="O que é isso?"
                            >
                                <HelpCircle size={24} className="text-zinc-500" />
                            </button>
                        </span>
                        <div className="flex items-center gap-2">
                             <TrendingUp size={14} className={text} />
                            <span className={`${text} font-black text-xl tabular-nums`}>{campaign.timeProgress.toFixed(1)}%</span>
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
                                className={`h-full rounded-full transition-all duration-2500 cubic-bezier(0.16, 1, 0.3, 1) relative z-10 shadow-[inner_0_2px_8px_rgba(0,0,0,0.1)] ${
                                    campaign.status === 'on-track' ? 'bg-linear-to-r from-emerald-400 via-emerald-500 to-emerald-600' : 
                                    campaign.status === 'over' ? 'bg-linear-to-r from-blue-400 via-blue-500 to-blue-600' :
                                    campaign.status === 'critical' ? 'bg-linear-to-r from-rose-400 via-rose-500 to-rose-600' : 
                                    'bg-linear-to-r from-orange-400 via-orange-500 to-orange-600'
                                }`}
                                style={{ width: `${Math.min(campaign.deliveryProgress, 100)}%` }}
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
                                        <Activity size={14} />
                                        <span className="text-[10px] uppercase tracking-widest">Pressão</span>
                                    </div>
                                    <div className={`text-sm font-black ${campaign.pressure > 1.2 ? 'text-rose-600' : campaign.pressure > 1.15 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                        {campaign.pressure.toFixed(2)}x
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                        <Clock size={14} />
                                        <span className="text-[10px] uppercase tracking-widest">Tempo</span>
                                    </div>
                                    <div className="text-xs font-semibold text-zinc-600">{mounted ? getDaysRemaining(campaign.endDate) : '--'} dias restantes</div>
                                </div>
                                {campaign.requiredDaily > 0 && margin >= 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                            <Target size={14} />
                                            <span className="text-[10px] uppercase tracking-widest">Meta/Dia</span>
                                        </div>
                                        <div className="text-xs font-bold text-zinc-900 tabular-nums">
                                            {formatNumber(campaign.requiredDaily)}/dia
                                        </div>
                                    </div>
                                )}

                                {campaign.bi && (
                                    <div className="space-y-2 col-span-2 pt-2 border-t border-zinc-100">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-zinc-400 font-bold">
                                                <TrendingUp size={14} className={campaign.bi.trend === 'up' ? 'text-emerald-500' : campaign.bi.trend === 'down' ? 'text-rose-500' : 'text-zinc-400'} />
                                                <span className="text-[10px] uppercase tracking-widest">Entrega Hoje</span>
                                            </div>
                                            <div className="text-xs font-black text-zinc-900">
                                                {formatNumber(campaign.bi.deliveredToday)}
                                                <span className={`ml-1 text-[9px] ${campaign.bi.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {campaign.bi.trend === 'up' ? '▲ Alta' : campaign.bi.trend === 'down' ? '▼ Baixa' : '— Estável'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Recovery Plan Section */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-[10px] font-black text-zinc-900 uppercase tracking-[0.25em] flex items-center gap-2">
                                        <Zap size={12} className="text-emerald-500 fill-emerald-500" />
                                        Plano de Recuperação & Velocidade
                                    </span>
                                    <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase tracking-widest border border-emerald-100">BI Insight</span>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Ritmo Atual */}
                                    <div className="p-4 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:shadow-md transition-shadow group/v">
                                        <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 group-hover/v:text-zinc-600 transition-colors">Ritmo Real (Média)</div>
                                        <div className="text-xl font-black text-zinc-900 tabular-nums">{formatNumber(campaign.currentDaily)}</div>
                                        <div className="text-[9px] text-zinc-400 font-medium mt-1">impres./dia registrados</div>
                                    </div>

                                    {/* Requisito para Meta */}
                                    <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-xl relative overflow-hidden group/v">
                                        <div className="absolute top-0 right-0 p-2 opacity-10">
                                            <Target size={32} className="text-white" />
                                        </div>
                                        <div className="relative z-10">
                                            <div className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-1">Requisito Meta Final</div>
                                            <div className="text-xl font-black text-white tabular-nums">{formatNumber(campaign.requiredDaily)}</div>
                                            <div className="text-[9px] text-white/40 font-medium mt-1">mínimo diário necessário</div>
                                        </div>
                                    </div>

                                    {/* Esforço/Pressão */}
                                    <div className={`p-4 rounded-2xl border shadow-sm transition-all group/v ${
                                        campaign.pressure > 1.2 ? 'bg-rose-50 border-rose-100' : 
                                        campaign.pressure > 1.05 ? 'bg-orange-50 border-orange-100' : 
                                        'bg-emerald-50 border-emerald-100'
                                    }`}>
                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                                            campaign.pressure > 1.2 ? 'text-rose-400' : 
                                            campaign.pressure > 1.05 ? 'text-orange-400' : 
                                            'text-emerald-400'
                                        }`}>Esforço de Entrega</div>
                                        <div className={`text-xl font-black tabular-nums ${
                                            campaign.pressure > 1.2 ? 'text-rose-600' : 
                                            campaign.pressure > 1.05 ? 'text-orange-600' : 
                                            'text-emerald-600'
                                        }`}>
                                            {campaign.pressure.toFixed(2)}x
                                        </div>
                                        <div className={`text-[9px] font-medium mt-1 ${
                                            campaign.pressure > 1.2 ? 'text-rose-400/80' : 
                                            campaign.pressure > 1.05 ? 'text-orange-400/80' : 
                                            'text-emerald-400/80'
                                        }`}>
                                            {campaign.pressure > 1.0 ? 'necessário acelerar entrega' : 'ritmo atual é suficiente'}
                                        </div>
                                    </div>
                                </div>

                                {/* Smart Recommendation Bar */}
                                <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-start gap-3">
                                    <div className={`p-2 rounded-xl shrink-0 ${
                                        campaign.pressure > 1.2 ? 'bg-rose-500 text-white' : 
                                        campaign.pressure > 1.05 ? 'bg-orange-500 text-white' : 
                                        'bg-emerald-500 text-white'
                                    }`}>
                                        <AlertCircle size={16} />
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black text-zinc-900 uppercase tracking-widest mb-0.5">Diagnóstico de Velocidade</div>
                                        <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                                            {campaign.pressure > 1.2 
                                                ? `A campanha está severamente atrasada. É necessário aumentar a entrega diária em ${( (campaign.pressure - 1) * 100 ).toFixed(0)}% imediatamente para evitar sub-entrega.` 
                                                : campaign.pressure > 1.0 
                                                ? `A entrega está ligeiramente abaixo do ideal. Um ajuste de ${( (campaign.pressure - 1) * 100 ).toFixed(0)}% na velocidade diária garante o atingimento da meta.`
                                                : `Campanha com vitalidade excelente. O ritmo atual de ${formatNumber(campaign.currentDaily)}/dia supera o requisito de ${formatNumber(campaign.requiredDaily)}/dia.`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}
