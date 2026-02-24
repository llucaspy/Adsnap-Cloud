'use client'

import React from 'react'
import { Folder, ImageIcon, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface PIFolderCardProps {
    pi: string
    client: string
    campaignName: string
    captureCount: number
    thumbnailId: string
    accentColor: string
}

export function PIFolderCard({ pi, client, campaignName, captureCount, thumbnailId, accentColor }: PIFolderCardProps) {
    return (
        <Link
            href={`/books/${pi}`}
            className="group relative block bg-white/[0.03] border border-white/10 rounded-[2rem] overflow-hidden transition-all duration-500 hover:border-accent/40 hover:shadow-[0_20px_50px_rgba(168,85,247,0.15)] hover:translate-y-[-4px]"
        >
            {/* Hover Glow Effect */}
            <div
                className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none"
                style={{ background: `linear-gradient(to br, ${accentColor}, var(--secondary))` }}
            />

            <div className="aspect-[16/10] relative overflow-hidden bg-bg-tertiary">
                {/* Stack Effect Backgrounds */}
                <div className="absolute inset-0 translate-x-2 translate-y-2 bg-white/5 rounded-[2rem] scale-[0.98]" />
                <div className="absolute inset-0 translate-x-1 translate-y-1 bg-white/5 rounded-[2rem] scale-[0.99]" />

                <img
                    src={`/api/captures/${thumbnailId}`}
                    alt={campaignName}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-60 group-hover:opacity-100"
                />

                {/* Folder Icon Overlay */}
                <div className="absolute top-4 right-4 z-10">
                    <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/80 group-hover:text-white group-hover:scale-110 transition-all">
                        <Folder size={20} />
                    </div>
                </div>

                {/* Badge */}
                <div className="absolute top-4 left-4 z-10">
                    <div className="px-3 py-1 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        <span className="text-[8px] font-black text-white/80 uppercase tracking-widest">{captureCount} Prints</span>
                    </div>
                </div>

                <div className="absolute inset-0 bg-gradient-to-t from-bg-primary via-transparent to-transparent opacity-80" />
            </div>

            <div className="p-6 space-y-3 relative">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div
                            className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]"
                            style={{ color: accentColor }}
                        />
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">
                            PI {pi}
                        </span>
                    </div>
                    <ChevronRight size={16} className="text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>

                <div className="space-y-1">
                    <h3 className="font-black text-white/90 text-sm tracking-tight line-clamp-1 group-hover:text-accent transition-colors">
                        {client}
                    </h3>
                    <p className="text-[10px] text-white/20 font-black uppercase tracking-widest truncate">
                        {campaignName}
                    </p>
                </div>

                {/* Visual Decorative bits */}
                <div className="pt-2 flex items-center gap-2">
                    <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
                    <div className="w-1 h-1 rounded-full bg-white/10" />
                    <div className="w-20 rounded-full h-px bg-white/5" />
                </div>
            </div>
        </Link>
    )
}
