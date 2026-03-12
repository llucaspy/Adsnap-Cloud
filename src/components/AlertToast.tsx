'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react'

interface Alert {
    id: string
    type: 'error' | 'warning' | 'info' | 'success'
    title: string
    message: string
    campaignId?: string
    createdAt: number
}

const ICON_MAP = {
    error:   { Icon: AlertCircle,   bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171' },
    warning: { Icon: AlertTriangle, bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)',  color: '#fbbf24' },
    info:    { Icon: Info,          bg: 'rgba(96,165,250,0.15)',   border: 'rgba(96,165,250,0.3)',  color: '#60a5fa' },
    success: { Icon: CheckCircle,   bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)',   color: '#4ade80' },
}

export function AlertToast() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [dismissed, setDismissed] = useState<Set<string>>(new Set())

    const fetchAlerts = useCallback(async () => {
        try {
            const res = await fetch('/api/alerts')
            if (res.ok) {
                const data = await res.json()
                setAlerts(data.alerts || [])
            }
        } catch { /* silent */ }
    }, [])

    // Poll every 10s
    useEffect(() => {
        fetchAlerts()
        const interval = setInterval(fetchAlerts, 10000)
        return () => clearInterval(interval)
    }, [fetchAlerts])

    const dismiss = async (id: string) => {
        setDismissed(prev => new Set(prev).add(id))
        try {
            await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' })
        } catch { /* silent */ }
    }

    const visible = alerts.filter(a => !dismissed.has(a.id))
    if (visible.length === 0) return null

    return (
        <div style={{
            position: 'fixed', bottom: 20, right: 20, zIndex: 99999,
            display: 'flex', flexDirection: 'column', gap: 10,
            maxWidth: 420, maxHeight: '60vh', overflowY: 'auto',
            pointerEvents: 'auto',
        }}>
            {visible.slice(-5).map((alert) => {
                const config = ICON_MAP[alert.type] || ICON_MAP.error
                const { Icon } = config
                const age = Date.now() - alert.createdAt
                const timeStr = age < 60000 ? 'agora' :
                    age < 3600000 ? `${Math.floor(age / 60000)}m atrás` :
                        `${Math.floor(age / 3600000)}h atrás`

                return (
                    <div
                        key={alert.id}
                        style={{
                            background: config.bg,
                            border: `1px solid ${config.border}`,
                            borderRadius: 12,
                            padding: '14px 16px',
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            animation: 'slideInRight 0.3s ease-out',
                            display: 'flex',
                            gap: 12,
                            alignItems: 'flex-start',
                        }}
                    >
                        <Icon size={20} color={config.color} style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: config.color }}>
                                    {alert.title}
                                </span>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                                    {timeStr}
                                </span>
                            </div>
                            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 1.4, wordBreak: 'break-word' }}>
                                {alert.message}
                            </p>
                            {alert.campaignId && (
                                <span style={{
                                    display: 'inline-block', marginTop: 6, fontSize: 10,
                                    padding: '2px 8px', borderRadius: 6,
                                    background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)',
                                    fontFamily: "'JetBrains Mono', monospace",
                                }}>
                                    ID: {alert.campaignId}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => dismiss(alert.id)}
                            style={{
                                background: 'none', border: 'none', padding: 4,
                                color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                                flexShrink: 0, marginTop: 0,
                                transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )
            })}

            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(60px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </div>
    )
}
