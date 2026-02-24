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
                if (data.length > 0) {
                    setLogs(data)
                    setIsIdle(false)
                } else {
                    setIsIdle(true)
                }
            } catch (err) {
                console.error("Failed to fetch nexus activity")
            }
        }

        const interval = setInterval(fetchActivity, 2000)
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
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                <div className="flex gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                </div>
                <div className="text-[10px] uppercase tracking-widest text-accent-light font-black">
                    Nexus Log stream
                </div>
            </div>

            {/* Feed */}
            <div
                ref={scrollRef}
                className="h-48 overflow-y-auto space-y-1.5 text-[11px] custom-scrollbar scroll-smooth"
            >
                {isIdle ? (
                    <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-60">
                        <div className="w-1.5 h-1.5 bg-accent rounded-full animate-ping" />
                        <div className="text-[10px] uppercase tracking-[0.4em] font-bold text-white/60">Nexus Standby: Awaiting Protocol</div>
                    </div>
                ) : (
                    logs.map((log, i) => (
                        <div
                            key={i}
                            className={`transition-all duration-300 ${i === logs.length - 1 ? 'text-accent-light font-bold bg-accent/5 py-0.5 px-2 rounded-sm' : 'text-white/60'}`}
                        >
                            <span className="opacity-50 mr-2 font-normal">
                                {mounted ? `[${new Date(log.timestamp).toLocaleTimeString()}]` : '[--:--:--]'}
                            </span>
                            {log.message}
                        </div>
                    ))
                )}
            </div>

            {/* Scanline Effect - Softened */}
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.05)_50%)] bg-[length:100%_4px] opacity-20 z-20" />
        </div>
    )
}
