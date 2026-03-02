'use client'

import React from 'react'
import { Folder, ChevronRight, ImageIcon } from 'lucide-react'
import Link from 'next/link'

interface PIFolderCardProps {
    pi: string
    client: string
    campaignName: string
    captureCount: number
    thumbnailId: string
    date: string
    accentColor?: string
}

export function PIFolderCard({ pi, client, campaignName, captureCount, thumbnailId, date }: PIFolderCardProps) {
    return (
        <Link
            href={`/books/${pi}?date=${date}`}
            className="group relative flex flex-col bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden transition-all duration-300 hover:border-white/20 hover:bg-white/[0.05] hover:shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1"
        >
            {/* Thumbnail */}
            <div className="relative aspect-video overflow-hidden bg-white/[0.02]">
                <img
                    src={`/api/captures/${thumbnailId}`}
                    alt={client}
                    className="w-full h-full object-cover opacity-50 group-hover:opacity-80 transition-opacity duration-500 group-hover:scale-105 transform transition-transform"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none'
                    }}
                />

                {/* Fallback icon if no image */}
                <div className="absolute inset-0 flex items-center justify-center opacity-20 group-hover:opacity-0 transition-opacity">
                    <ImageIcon size={24} className="text-white/40" />
                </div>

                {/* Count badge */}
                <div className="absolute top-2.5 left-2.5">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[9px] font-black text-white/70 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        {captureCount}
                    </span>
                </div>

                {/* Folder icon */}
                <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
                    <Folder size={14} className="text-white/80" />
                </div>

                {/* Bottom gradient */}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />
            </div>

            {/* Info */}
            <div className="px-3.5 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">
                        PI {pi}
                    </p>
                    <h3 className="text-sm font-black text-white/85 leading-tight group-hover:text-white transition-colors truncate">
                        {client}
                    </h3>
                    <p className="text-[10px] text-white/25 truncate mt-0.5">
                        {campaignName}
                    </p>
                </div>

                <ChevronRight
                    size={14}
                    className="text-white/15 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all shrink-0 mt-1"
                />
            </div>
        </Link>
    )
}
