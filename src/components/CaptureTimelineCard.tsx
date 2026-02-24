'use client'

import React, { useTransition, useState } from 'react'
import { Clock, Trash2, Link as LinkIcon, ExternalLink, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { deleteCapture } from '@/app/actions'

interface CaptureTimelineCardProps {
    capture: any
}

export function CaptureTimelineCard({ capture }: CaptureTimelineCardProps) {
    const [isPending, startTransition] = useTransition()
    const [showConfirm, setShowConfirm] = useState(false)

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteCapture(capture.id)
            if (!result.success) {
                alert(`Erro ao excluir: ${result.error}`)
            }
        })
    }

    return (
        <div className="group relative bg-white/[0.03] border border-white/10 rounded-[2rem] overflow-hidden transition-all duration-500 hover:border-accent/40 hover:shadow-[0_20px_50px_rgba(168,85,247,0.15)] hover:translate-y-[-4px]">
            {/* Hover Glow Effect */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity bg-gradient-to-br from-accent via-secondary to-tertiary pointer-events-none" />

            {/* Top Toolbar (Overlay) */}
            <div className="absolute top-4 right-4 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-all translate-y-[-10px] group-hover:translate-y-0">
                {!showConfirm ? (
                    <button
                        onClick={() => setShowConfirm(true)}
                        className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-xl backdrop-blur-md"
                        title="Excluir print"
                    >
                        <Trash2 size={18} />
                    </button>
                ) : (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4">
                        <button
                            onClick={handleDelete}
                            disabled={isPending}
                            className="px-4 py-2 rounded-xl bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg flex items-center gap-2"
                        >
                            {isPending ? <Loader2 size={12} className="animate-spin" /> : 'Confirmar'}
                        </button>
                        <button
                            onClick={() => setShowConfirm(false)}
                            disabled={isPending}
                            className="px-4 py-2 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                        >
                            Cancelar
                        </button>
                    </div>
                )}
            </div>

            <div className="aspect-[16/10] relative overflow-hidden bg-bg-tertiary">
                <img
                    src={`/api/captures/${capture.id}`}
                    alt={capture.campaign.campaignName}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />

                {/* Status Indicator Chip */}
                <div className="absolute top-4 left-4 z-10">
                    <div className="px-3 py-1 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        <span className="text-[8px] font-black text-white/80 uppercase tracking-widest">Verificado</span>
                    </div>
                </div>

                {/* Deleting Overlay */}
                {isPending && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-30">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
                            <Trash2 size={24} className="absolute inset-0 m-auto text-accent" />
                        </div>
                        <span className="text-[10px] font-black text-white/60 tracking-[0.2em] uppercase">Expurgando Dados...</span>
                    </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

                <div className="absolute bottom-4 left-4 right-4 md:translate-y-4 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 transition-all duration-500 opacity-100 translate-y-0">
                    <Link
                        href={`/books/${capture.campaign.pi}`}
                        className="w-full py-3 rounded-xl bg-black/60 hover:bg-accent border border-white/20 hover:border-accent text-center text-[10px] font-black uppercase tracking-widest text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all block backdrop-blur-md"
                    >
                        Inspecionar Detalhes
                    </Link>
                </div>
            </div>

            <div className="p-6 space-y-4 relative">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                            PI {capture.campaign.pi}
                        </span>
                    </div>
                    <div className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/5 flex items-center gap-1.5">
                        <Clock size={10} className="text-white/20" />
                        <span className="text-[9px] font-bold text-white/30">
                            {format(new Date(capture.createdAt), 'HH:mm')}
                        </span>
                    </div>
                </div>

                <div className="space-y-1">
                    <h3 className="font-black text-white/90 text-sm tracking-tight line-clamp-1 group-hover:text-accent transition-colors">
                        {capture.campaign.client}
                    </h3>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-widest truncate">
                        {capture.campaign.campaignName}
                    </p>
                </div>

                {/* Decorative bits */}
                <div className="pt-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <div className="w-1 h-1 rounded-full bg-white/5" />
                </div>
            </div>
        </div>
    )
}
