'use client'

import React, { useState } from 'react'
import { Calendar, Monitor, Smartphone, Globe, Camera, Sparkles, Trash2 } from 'lucide-react'
import { CaptureImage } from '@/components/CaptureImage'
import { ImageLightbox } from '@/components/ImageLightbox'
import { RunCaptureButton } from '@/components/RunCaptureButton'

interface Capture {
    id: string
    createdAt: Date
    screenshotPath: string
}

interface Campaign {
    id: string
    format: string
    formatLabel: string
    device: string
    url: string
    isScheduled: boolean
    scheduledTimes: string
    captures: Capture[]
}

export function BookCampaignList({ campaigns }: { campaigns: Campaign[] }) {
    const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null)
    const [selectedCampaignLabel, setSelectedCampaignLabel] = useState<string>('')

    const openLightbox = (capture: Capture, label: string) => {
        setSelectedCapture(capture)
        setSelectedCampaignLabel(label)
    }

    const closeLightbox = () => {
        setSelectedCapture(null)
    }

    return (
        <div className="grid grid-cols-1 gap-16">
            {campaigns.map((campaign) => (
                <section key={campaign.id} className="space-y-8">
                    {/* Header do Formato */}
                    <div
                        className="flex items-center justify-between pb-6"
                        style={{ borderBottom: '1px solid var(--border)' }}
                    >
                        <div className="flex items-center gap-4">
                            <div
                                className="w-14 h-14 rounded-2xl flex items-center justify-center relative group"
                                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                            >
                                {campaign.device === 'mobile' ? <Smartphone size={26} /> : <Monitor size={26} />}
                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-[var(--bg-primary)]" />
                            </div>
                            <div>
                                <h2
                                    className="text-2xl font-bold leading-none mb-2 flex items-center gap-3"
                                    style={{
                                        color: 'var(--text-primary)',
                                        fontFamily: 'var(--font-display)'
                                    }}
                                >
                                    {campaign.formatLabel}
                                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)]">
                                        {campaign.format}
                                    </span>
                                </h2>
                                <div
                                    className="flex items-center gap-2 text-sm"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    <Globe size={14} className="text-[var(--accent)]" />
                                    <a href={campaign.url} target="_blank" className="hover:text-white transition-colors">
                                        {new URL(campaign.url).hostname}
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium">
                            <RunCaptureButton id={campaign.id} />

                            {campaign.isScheduled && (
                                <span
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl"
                                    style={{
                                        background: 'var(--accent-muted)',
                                        color: 'var(--accent-light)'
                                    }}
                                >
                                    <Calendar size={16} />
                                    {(() => {
                                        try {
                                            const times = JSON.parse(campaign.scheduledTimes) as string[]
                                            if (times.length === 0) return 'Configurar'
                                            if (times.length === 1) return `${times[0]}`
                                            return `${times.length} horários`
                                        } catch {
                                            return 'Agendado'
                                        }
                                    })()}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Grid de Capturas */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {campaign.captures.map((capture) => (
                            <div key={capture.id} className="group relative">
                                <div
                                    className="aspect-[3/4] rounded-2xl overflow-hidden transition-all duration-500 hover:-translate-y-2 relative cursor-pointer"
                                    onClick={() => openLightbox(capture, campaign.formatLabel)}
                                    style={{
                                        background: 'var(--bg-secondary)',
                                        border: '1px solid var(--border)'
                                    }}
                                >
                                    <div
                                        className="w-full h-full relative"
                                        style={{ color: 'var(--text-muted)' }}
                                    >
                                        <CaptureImage
                                            src={`/api/captures/${capture.id}`}
                                            alt={`Capture ${capture.id}`}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    </div>

                                    {/* Overlay Hover */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end">
                                        <div className="absolute top-4 right-4 z-20 flex gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm('Tem certeza que deseja excluir esta evidência permanentemente?')) {
                                                        const { deleteCapture } = require('@/app/actions');
                                                        deleteCapture(capture.id).then((res: any) => {
                                                            if (!res.success) alert(res.error);
                                                        });
                                                    }
                                                }}
                                                className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all backdrop-blur-md"
                                                title="Excluir print"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                        <p
                                            className="text-sm font-bold mb-1"
                                            style={{ color: 'var(--text-primary)' }}
                                        >
                                            {new Date(capture.createdAt).toLocaleDateString('pt-BR')}
                                        </p>
                                        <p
                                            className="text-xs mb-4"
                                            style={{ color: 'var(--text-muted)' }}
                                        >
                                            {new Date(capture.createdAt).toLocaleTimeString('pt-BR')}
                                        </p>
                                        <button
                                            className="w-full py-3 text-xs font-bold rounded-xl uppercase tracking-widest transition-all text-white hover:scale-105 active:scale-95"
                                            style={{
                                                background: 'var(--gradient-primary)',
                                                boxShadow: '0 0 20px rgba(168, 85, 247, 0.4)'
                                            }}
                                        >
                                            <Sparkles size={14} className="inline mr-2" />
                                            Ampliar
                                        </button>
                                    </div>

                                    {/* Borda Gradiente */}
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
                            </div>
                        ))}

                        {/* Empty State */}
                        {campaign.captures.length === 0 && (
                            <div
                                className="col-span-full py-20 flex flex-col items-center justify-center rounded-2xl transition-colors hover:bg-white/[0.02]"
                                style={{
                                    border: '2px dashed var(--border)',
                                    color: 'var(--text-muted)'
                                }}
                            >
                                <Camera size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-medium opacity-60">Nenhuma captura disponível.</p>
                            </div>
                        )}
                    </div>
                </section>
            ))}

            {selectedCapture && (
                <ImageLightbox
                    isOpen={!!selectedCapture}
                    src={`/api/captures/${selectedCapture.id}`}
                    alt={selectedCampaignLabel}
                    date={selectedCapture.createdAt}
                    onClose={closeLightbox}
                />
            )}
        </div>
    )
}
