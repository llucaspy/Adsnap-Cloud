'use client'

import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react'

type NetStatus = 'checking' | 'stable' | 'slow' | 'unstable'

const CONFIG: Record<Exclude<NetStatus, 'checking'>, { color: string; bg: string; icon: any; pulseColor: string }> = {
    stable: {
        color: '#22c55e',
        bg: 'rgba(34,197,94,0.12)',
        icon: Wifi,
        pulseColor: 'rgba(34,197,94,0.5)',
    },
    slow: {
        color: '#f59e0b',
        bg: 'rgba(245,158,11,0.12)',
        icon: AlertTriangle,
        pulseColor: 'rgba(245,158,11,0.5)',
    },
    unstable: {
        color: '#ef4444',
        bg: 'rgba(239,68,68,0.12)',
        icon: WifiOff,
        pulseColor: 'rgba(239,68,68,0.5)',
    },
}

export function NetworkIndicator() {
    const [status, setStatus] = useState<NetStatus>('checking')
    const [label, setLabel] = useState('Verificando...')
    const [latency, setLatency] = useState<number | null>(null)

    const check = useCallback(async () => {
        try {
            const res = await fetch('/api/network-check', { cache: 'no-store' })
            const data = await res.json()
            setStatus(data.status)
            setLabel(data.label)
            setLatency(data.latency)
        } catch {
            setStatus('unstable')
            setLabel('Offline')
            setLatency(null)
        }
    }, [])

    useEffect(() => {
        check()
        const interval = setInterval(check, 30000) // Poll every 30s
        return () => clearInterval(interval)
    }, [check])

    if (status === 'checking') {
        return (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white/[0.05] border border-white/5">
                <div className="w-2 h-2 rounded-full bg-white/20 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">
                    Rede...
                </span>
            </div>
        )
    }

    const cfg = CONFIG[status]
    const Icon = cfg.icon

    return (
        <button
            onClick={check}
            title={`Latência: ${latency !== null ? latency + 'ms' : '—'} • Clique para re-testar`}
            className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer group"
            style={{
                background: cfg.bg,
                borderColor: `${cfg.color}33`,
            }}
        >
            <div className="relative flex items-center justify-center">
                <div
                    className="absolute w-3 h-3 rounded-full animate-ping opacity-40"
                    style={{ background: cfg.pulseColor }}
                />
                <div
                    className="w-2.5 h-2.5 rounded-full shadow-lg"
                    style={{ background: cfg.color, boxShadow: `0 0 10px ${cfg.pulseColor}` }}
                />
            </div>
            <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                    <Icon size={11} style={{ color: cfg.color }} />
                    <span
                        className="text-[10px] font-black uppercase tracking-[0.15em]"
                        style={{ color: cfg.color }}
                    >
                        {label}
                    </span>
                </div>
                {latency !== null && (
                    <span className="text-[8px] font-bold text-white/20 tracking-wider">
                        {latency}ms
                    </span>
                )}
            </div>
        </button>
    )
}
