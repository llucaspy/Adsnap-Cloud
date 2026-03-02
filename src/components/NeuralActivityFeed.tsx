'use client'

import React, { useState, useEffect, useRef } from 'react'
import { getNexusActivity } from '@/app/actions'

export function NeuralActivityFeed() {
    const [logs, setLogs] = useState<{ message: string, type: string, timestamp: number }[]>([])
    const [isIdle, setIsIdle] = useState(true)
    const scrollRef = useRef<HTMLDivElement>(null)

    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
        const fetchActivity = async () => {
            try {
                const data = await getNexusActivity()
                if (data && data.length > 0) {
                    setLogs(data)
                    setIsIdle(false)
                } else {
                    setIsIdle(true)
                }
            } catch (err) {
                console.error("Failed to fetch nexus activity")
            }
        }

        fetchActivity()
        const interval = setInterval(fetchActivity, 3000)
        return () => clearInterval(interval)
    }, [])


    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [logs])

    return (
        <div className="w-full max-w-2xl mx-auto bg-black border border-white/10 rounded-2xl p-6 backdrop-blur-xl font-mono relative overflow-hidden group shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b border-white/8 pb-3">
                <div className="flex gap-2">
                    {/* Keep macOS traffic lights — these are UI metaphor dots, not brand colors */}
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/50 font-black">
                    Nexus Log stream
                </div>
            </div>

            {/* Feed */}
            <div
                ref={scrollRef}
                className="h-48 overflow-y-auto space-y-1.5 text-[11px] custom-scrollbar scroll-smooth"
            >
                {isIdle ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-50">
                        <div className="w-1.5 h-1.5 bg-white/60 rounded-full animate-ping" />
                        <div className="text-[10px] uppercase tracking-[0.4em] font-bold text-white/40">Nexus Standby: Awaiting Protocol</div>
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div key={i} className={`font-mono text-[9px] border-l-2 pl-3 py-1.5 transition-all animate-in fade-in slide-in-from-left-2 duration-300 ${i === logs.length - 1 ? 'border-white/50 bg-white/[0.03]' : 'border-white/10'}`}>
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[8px] font-black uppercase tracking-widest ${log.type === 'SUCCESS' ? 'text-green-400' :
                                        log.type === 'ERROR' ? 'text-red-400' :
                                            log.type === 'SYSTEM' ? 'text-gray-400' : 'text-white/60'
                                    }`}>
                                    [{log.type || 'INFO'}]
                                </span>
                                <span className="text-white/20 text-[7px] font-bold">
                                    {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <p className="text-white/65 leading-relaxed font-medium">{log.message}</p>
                        </div>
                    ))
                )}
            </div>

            {/* Scanline Effect */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.04)_50%)] bg-[length:100%_4px] opacity-15 z-20" />
        </div>
    )
}
