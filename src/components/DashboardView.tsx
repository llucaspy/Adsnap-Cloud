'use client'

import React, { useState } from 'react'
import { Activity, TrendingUp, AlertCircle, Image as ImageIcon, Sparkles, ShieldCheck, Box, ChevronRight, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
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
        <div className="space-y-10 animate-slide-up">
            {/* Hero Header */}
            <header>
                <div className="space-y-2">
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#ede9e1',
                            color: '#a89f8c',
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: '0.07em',
                            padding: '2px 8px',
                            borderRadius: 4,
                            marginBottom: 8,
                        }}
                    >
                        <Sparkles size={10} />
                        Nexus Dashboard
                    </div>
                    <h1
                        className="text-3xl md:text-4xl font-extrabold tracking-tight"
                        style={{ fontFamily: 'var(--font-display)', color: '#1c1917' }}
                    >
                        Central de Controle
                    </h1>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <p style={{ fontSize: 14, color: '#a89f8c' }}>
                            Visão geral das capturas e status de campanhas do dia.
                        </p>
                        <Link
                            href="/adops"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1c1917] text-white text-xs font-bold hover:bg-black transition-colors"
                        >
                            <LayoutGrid size={14} />
                            ABRIR ADOPS HUB
                            <ChevronRight size={14} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid #e8e5df' }}>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: activeTab === 'overview' ? 600 : 500,
                        color: activeTab === 'overview' ? '#1c1917' : '#a89f8c',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'overview' ? '2px solid #1c1917' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        marginBottom: -1,
                    }}
                >
                    Resumo Geral
                </button>
                <button
                    onClick={() => setActiveTab('quarantine')}
                    style={{
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: activeTab === 'quarantine' ? 600 : 500,
                        color: activeTab === 'quarantine' ? '#ef4444' : '#a89f8c',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'quarantine' ? '2px solid #ef4444' : '2px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        marginBottom: -1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    Quarentena
                    {stats.quarantined > 0 && (
                        <span style={{ padding: '1px 6px', background: '#ef4444', color: '#faf9f7', fontSize: 10, borderRadius: 999, fontWeight: 700 }}>
                            {stats.quarantined}
                        </span>
                    )}
                </button>
            </div>

            {activeTab === 'overview' ? (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                        <StatCard label="PIs Ativos" value={stats.activePis} icon={ShieldCheck} />
                        <StatCard label="Campanhas Ativas" value={stats.activeCampaigns} icon={Activity} />
                        <StatCard label="Formatos Ativos" value={stats.totalFormats} icon={Box} />
                        <StatCard label="Taxa de Sucesso" value={`${stats.successRate}%`} icon={TrendingUp} highlight />
                        <StatCard label="Quarentena" value={stats.quarantined} icon={AlertCircle} danger={stats.quarantined > 0} />
                    </div>

                    {/* Recent Captures Gallery */}
                    <section className="space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#1c1917', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                Últimas Capturas
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {recentCaptures.map((capture) => (
                                <div
                                    key={capture.id}
                                    className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
                                    style={{
                                        background: '#faf9f7',
                                        border: '0.5px solid #e8e5df',
                                        borderRadius: 8,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 z-10 p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                        style={{ background: 'linear-gradient(to top, rgba(28,25,23,0.85) 0%, transparent 100%)' }}
                                    >
                                        <p className="text-[11px] font-bold truncate" style={{ color: '#faf9f7' }}>
                                            {capture.campaign?.client || 'Untitled'}
                                        </p>
                                        <p className="text-[10px]" style={{ color: 'rgba(250,249,247,0.6)' }}>
                                            {formatDate(new Date(capture.createdAt), "HH:mm '•' dd MMM", { locale: ptBR })}
                                        </p>
                                    </div>
                                    <div className={`relative ${capture.isAssembly ? 'aspect-video' : 'aspect-[3/4]'} overflow-hidden`}>
                                        <div className="absolute inset-0 bg-[#f3f0ea]">
                                            <CaptureImage
                                                src={`/api/captures/${capture.id}`}
                                                alt={capture.isAssembly ? "Montagem" : "Banner"}
                                                className={`w-full h-full ${capture.isAssembly ? 'object-contain' : 'object-cover'} group-hover:scale-105 transition-transform duration-700`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {recentCaptures.length === 0 && (
                                <div
                                    className="col-span-full py-20 flex flex-col items-center justify-center rounded-lg"
                                    style={{ border: '0.5px dashed #d4cfc7', color: '#a89f8c' }}
                                >
                                    <ImageIcon size={40} className="mb-3 opacity-30" />
                                    <p style={{ fontSize: 13, fontWeight: 500 }}>Nenhuma captura realizada hoje.</p>
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

function StatCard({ label, value, icon: Icon, highlight, danger }: any) {
    return (
        <div
            className="p-5 transition-all duration-300 hover:-translate-y-0.5"
            style={{
                background: danger ? 'rgba(239,68,68,0.04)' : highlight ? '#1c1917' : '#faf9f7',
                border: `0.5px solid ${danger ? 'rgba(239,68,68,0.2)' : highlight ? '#1c1917' : '#e8e5df'}`,
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: danger ? 'rgba(239,68,68,0.1)' : highlight ? 'rgba(250,249,247,0.1)' : '#ede9e1',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={15} style={{ color: danger ? '#ef4444' : highlight ? '#faf9f7' : '#a89f8c' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: danger ? '#ef4444' : highlight ? '#a89f8c' : '#a89f8c' }}>
                    {label}
                </p>
            </div>
            <p style={{
                fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px',
                fontFamily: 'var(--font-display)',
                color: danger ? '#ef4444' : highlight ? '#faf9f7' : '#1c1917',
            }}>
                {value}
            </p>
        </div>
    )
}
