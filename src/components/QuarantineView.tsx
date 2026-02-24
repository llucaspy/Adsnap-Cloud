'use client'

import React, { useState, useEffect } from 'react'
import { AlertCircle, RotateCcw, CheckCircle2, Trash2, XCircle } from 'lucide-react'
import { CaptureImage } from './CaptureImage'
import { runCapture } from '@/app/actions'

export function QuarantineView() {
    const [items, setItems] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const fetchQuarantine = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/campaigns?status=QUARANTINE')
            const data = await res.json()
            setItems(data)
        } catch (error) {
            console.error('Failed to fetch quarantine:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchQuarantine()
    }, [])

    const handleRetry = async (id: string) => {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'PROCESSING' } : item))
        try {
            await runCapture(id)
            await fetchQuarantine()
        } catch (error) {
            console.error('Retry failed:', error)
        }
    }

    if (loading) return <div className="p-8 text-center animate-pulse text-white/50">Carregando quarentena...</div>

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-center border-2 border-dashed border-white/5 rounded-3xl">
                <CheckCircle2 className="w-12 h-12 text-accent mb-4 opacity-20" />
                <h3 className="text-xl font-bold text-white/40">Nexus está limpo</h3>
                <p className="text-white/20 text-sm">Nenhuma captura em quarentena detectada.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-500/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Quarentena de Capturas</h2>
                    <p className="text-white/40 text-sm">Nexus barrou estas capturas por inconsistências visuais.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item) => (
                    <div key={item.id} className="glass-panel group relative flex flex-col overflow-hidden bg-white/5 hover:bg-white/10 transition-all border border-white/10 rounded-2xl">
                        {/* Status Badge */}
                        <div className="absolute top-4 right-4 z-20 px-3 py-1 bg-red-500/80 text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-xl">
                            Falha Visual
                        </div>

                        {/* Image Preview */}
                        <div className="aspect-video relative overflow-hidden bg-black/40">
                            {item.captures?.[0] ? (
                                <CaptureImage
                                    src={`/api/captures/${item.captures[0].id}`}
                                    alt={item.client}
                                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center opacity-20">
                                    <XCircle className="w-12 h-12" />
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="p-5 flex-1 flex flex-col">
                            <h4 className="font-bold text-white mb-1">{item.client}</h4>
                            <p className="text-xs text-white/40 mb-4 truncate">{item.url}</p>

                            <div className="mt-auto flex items-center gap-2">
                                <button
                                    onClick={() => handleRetry(item.id)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent-light text-bg-primary rounded-xl font-bold text-xs transition-all"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Tentar Novamente
                                </button>
                                <button className="p-2.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-red-400 rounded-xl transition-all">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
