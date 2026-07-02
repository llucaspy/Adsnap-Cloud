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
                            background: 'rgba(255,255,255,0.04)',
                            color: '#a3a3a3',
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
                        style={{ fontFamily: 'var(--font-display)', color: '#ffffff' }}
                    >
                        Central de Controle
                    </h1>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <p style={{ fontSize: 14, color: '#a3a3a3' }}>
                            Visão geral das capturas e status de campanhas do dia.
                        </p>
                        <Link
                            href="/adops"
                            className="btn-primary"
                            style={{ fontSize: 12, fontWeight: 700, padding: '10px 14px' }}
                        >
                            <LayoutGrid size={14} />
                            ABRIR ADOPS HUB
                            <ChevronRight size={14} />
                        </Link>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                <button
                    onClick={() => setActiveTab('overview')}
                    style={{
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: activeTab === 'overview' ? 600 : 500,
                        color: activeTab === 'overview' ? '#ffffff' : '#a3a3a3',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'overview' ? '2px solid #7c3aed' : '2px solid transparent',
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
                        color: activeTab === 'quarantine' ? '#ef4444' : '#a3a3a3',
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
                        <span style={{ padding: '1px 6px', background: '#ef4444', color: '#ffffff', fontSize: 10, borderRadius: 999, fontWeight: 700 }}>
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
                            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#ffffff', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                Últimas Capturas
                            </h2>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {recentCaptures.map((capture) => (
                                <div
                                    key={capture.id}
                                    className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1"
                                    style={{
                                        background: '#141414',
                                        border: '0.5px solid rgba(255,255,255,0.08)',
                                        borderRadius: 8,
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <div
                                        className="absolute inset-0 z-10 p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)' }}
                                    >
                                        <p className="text-[11px] font-bold truncate" style={{ color: '#ffffff' }}>
                                            {capture.campaign?.client || 'Untitled'}
                                        </p>
                                        <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
                                            {formatDate(new Date(capture.createdAt), "HH:mm '•' dd MMM", { locale: ptBR })}
                                        </p>
                                    </div>
                                    <div className={`relative ${capture.isAssembly ? 'aspect-video' : 'aspect-[3/4]'} overflow-hidden`}>
                                        <div className="absolute inset-0 bg-[#1a1a1a]">
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
                                    style={{ border: '0.5px dashed #525252', color: '#a3a3a3' }}
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
                background: danger ? 'rgba(239,68,68,0.06)' : highlight ? 'rgba(124,58,237,0.14)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${danger ? 'rgba(239,68,68,0.2)' : highlight ? 'rgba(124,58,237,0.35)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 12,
                boxShadow: 'rgba(0,0,0,0.30) 0px 8px 24px 0px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 6,
                    background: danger ? 'rgba(239,68,68,0.1)' : highlight ? 'rgba(124,58,237,0.20)' : 'rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <Icon size={15} style={{ color: danger ? '#ef4444' : highlight ? '#a78bfa' : '#a3a3a3' }} />
                </div>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: danger ? '#ef4444' : highlight ? '#a3a3a3' : '#a3a3a3' }}>
                    {label}
                </p>
            </div>
            <p style={{
                fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px',
                fontFamily: 'var(--font-display)',
                color: danger ? '#ef4444' : '#ffffff',
            }}>
                {value}
            </p>
        </div>
    )
}
