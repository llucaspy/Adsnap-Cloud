'use client'

import React, { useState } from 'react'
import { CheckCircle2, Activity, TrendingUp, AlertCircle, Image as ImageIcon, Sparkles, ShieldCheck, Box } from 'lucide-react'
import { format as formatDate } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CaptureImage } from './CaptureImage'
import { QuarantineView } from './QuarantineView'

interface DashboardStats {
    totalCapturesToday: number
    activePis: number
    activeCampaigns: number
    totalFormats: number
    successRate: number
    failedToday: number
    quarantined: number
}

export function DashboardView({ stats, recentCaptures }: { stats: DashboardStats, recentCaptures: any[] }) {
    const [activeTab, setActiveTab] = useState<'overview' | 'quarantine'>('overview')

    return (
        <div className="space-y-12 animate-slide-up">
            {/* Hero Header */}
            <header className="relative">
                <div
                    className="absolute -top-20 -left-20 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
                    style={{ background: 'var(--gradient-primary)' }}
                />

                <div className="relative space-y-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="px-4 py-2 rounded-full text-xs font-bold tracking-wide uppercase flex items-center gap-2"
                            style={{
                                background: 'var(--accent-muted)',
                                color: 'var(--accent-light)',
                            }}
                        >
                            <Sparkles size={14} />
                            Nexus Dashboard
                        </div>
                    </div>
                    <h1
                        className="text-5xl font-extrabold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        <span className="text-gradient">Central de</span>
                        <span style={{ color: 'var(--text-primary)' }}> Controle</span>
                    </h1>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="flex gap-4 border-b border-white/5 pb-px">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeTab === 'overview' ? 'text-accent' : 'text-white/40 hover:text-white/60'}`}
                >
                    Resumo Geral
                    {activeTab === 'overview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent shadow-[0_0_10px_var(--accent)]" />}
                </button>
                <button
                    onClick={() => setActiveTab('quarantine')}
                    className={`pb-4 px-2 text-sm font-bold transition-all relative flex items-center gap-2 ${activeTab === 'quarantine' ? 'text-red-400' : 'text-white/40 hover:text-white/60'}`}
                >
                    Quarentena
                    {stats.quarantined > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full animate-pulse">
                            {stats.quarantined}
                        </span>
                    )}
                    {activeTab === 'quarantine' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />}
                </button>
            </div>

            {activeTab === 'overview' ? (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
                        <StatCard
                            label="PIs Ativos"
                            value={stats.activePis}
                            icon={ShieldCheck}
                            gradient="var(--gradient-primary)"
                        />
                        <StatCard
                            label="Campanhas Ativas"
                            value={stats.activeCampaigns}
                            icon={Activity}
                            gradient="var(--gradient-secondary)"
                        />
                        <StatCard
                            label="Formatos Ativos"
                            value={stats.totalFormats}
                            icon={Box}
                            color="var(--accent-light)"
                        />
                        <StatCard
                            label="Taxa de Sucesso"
                            value={`${stats.successRate}%`}
                            icon={TrendingUp}
                            color="var(--success)"
                        />
                        <StatCard
                            label="Quarentena"
                            value={stats.quarantined}
                            icon={AlertCircle}
                            color={stats.quarantined > 0 ? "var(--destructive)" : "var(--text-muted)"}
                        />
                    </div>

                    {/* Recent Captures Gallery */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h2
                                className="text-lg font-bold"
                                style={{ color: 'var(--text-primary)' }}
                            >
                                Últimas Capturas
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {recentCaptures.map((capture) => (
                                <div
                                    key={capture.id}
                                    className="group relative aspect-[3/4] rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-lg"
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)'
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 p-4 flex flex-col justify-end"
                                    >
                                        <p
                                            className="text-sm font-bold truncate"
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            {capture.campaign.client}
                                        </p>
                                        <p
                                            className="text-xs"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            {formatDate(new Date(capture.createdAt), "HH:mm '•' dd MMM", { locale: ptBR })}
                                        </p>
                                    </div>

                                    <div className="absolute inset-0 z-0">
                                        <CaptureImage
                                            src={`/api/captures/${capture.id}`}
                                            alt={capture.campaign.client}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                    </div>

                                    {/* Gradient border on hover */}
                                    <div
                                        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                        style={{
                                            background: 'var(--gradient-primary)',
                                            padding: '2px',
                                            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                                            maskComposite: 'exclude',
                                            WebkitMaskComposite: 'xor'
                                        }}
                                    />
                                </div>
                            ))}
                            {recentCaptures.length === 0 && (
                                <div
                                    className="col-span-full py-20 flex flex-col items-center justify-center rounded-2xl"
                                    style={{
                                        border: '2px dashed var(--border)',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    <ImageIcon size={56} className="mb-4 opacity-20" />
                                    <p className="font-medium">Nenhuma captura realizada hoje.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </>
            ) : (
                <QuarantineView />
            )}
        </div>
    )
}

function StatCard({ label, value, icon: Icon, gradient, color }: any) {
    return (
        <div
            className="p-6 rounded-2xl flex items-center gap-5 transition-all duration-300 hover:-translate-y-1 group relative overflow-hidden"
            style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)'
            }}
        >
            {/* Hover glow */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: gradient ? `${gradient.replace('135deg', '180deg')}` : `radial-gradient(circle at center, ${color}20 0%, transparent 70%)` }}
            />

            <div
                className="w-14 h-14 rounded-xl flex items-center justify-center relative z-10"
                style={{
                    background: gradient || `${color}20`,
                    boxShadow: gradient ? 'var(--shadow-glow)' : `0 0 30px ${color}30`
                }}
            >
                <Icon size={26} strokeWidth={1.5} style={{ color: gradient ? 'white' : color }} />
            </div>
            <div className="relative z-10">
                <p
                    className="text-xs font-medium uppercase tracking-wider mb-1"
                    style={{ color: 'var(--text-muted)' }}
                >
                    {label}
                </p>
                <p
                    className="text-3xl font-bold tracking-tight"
                    style={{
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-display)'
                    }}
                >
                    {value}
                </p>
            </div>
        </div>
    )
}
