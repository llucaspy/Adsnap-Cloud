'use client'

import React from 'react'
import { CaptureImage } from './CaptureImage'
import { ExternalLink } from 'lucide-react'

export function CaptureSpotlight({ captures }: { captures: any[] }) {
    if (captures.length === 0) return null

    return (
        <div className="w-full overflow-hidden py-10 relative">
            <div className="flex gap-6 animate-scroll px-6">
                {/* Double the list for seamless loop */}
                {[...captures, ...captures].map((capture, i) => (
                    <div
                        key={`${capture.id}-${i}`}
                        className="flex-shrink-0 w-64 group relative perspective-1000"
                    >
                        <div className="relative aspect-[3/4] rounded-2xl overflow-hidden transition-all duration-500 transform-gpu group-hover:rotate-y-12 group-hover:scale-105 border border-white/5 group-hover:border-white/30 shadow-2xl">
                            <CaptureImage
                                src={`/api/captures/${capture.id}`}
                                alt={capture.campaign.client}
                                className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                            />

                            {/* Glass Overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />

                            {/* Content */}
                            <div className="absolute inset-0 p-6 flex flex-col justify-end translate-z-10">
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Recent Flow</p>
                                <h4 className="text-white font-bold truncate">{capture.campaign.client}</h4>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Fades */}
            <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-bg-primary to-transparent z-10 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-bg-primary to-transparent z-10 pointer-events-none" />
        </div>
    )
}
