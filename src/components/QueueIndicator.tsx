'use client'

import { useState, useEffect, useRef } from 'react'
import { Activity, Zap, Layers, CheckCircle2 } from 'lucide-react'
import { getQueueStatus, stopAllCaptures } from '@/app/actions'

export function QueueIndicator() {
    const [queue, setQueue] = useState<any[]>([])
    const [lastCompletedId, setLastCompletedId] = useState<string | null>(null)
    const [showCompleted, setShowCompleted] = useState(false)
    const prevQueueRef = useRef<any[]>([])

    // Cyberpunk Synth Sound using Web Audio API
    const playZapSound = () => {
        try {
            const context = new (window.AudioContext || (window as any).webkitAudioContext)()
            const oscillator = context.createOscillator()
            const gainNode = context.createGain()

            oscillator.type = 'sawtooth'
            oscillator.frequency.setValueAtTime(880, context.currentTime)
            oscillator.frequency.exponentialRampToValueAtTime(110, context.currentTime + 0.2)

            gainNode.gain.setValueAtTime(0.1, context.currentTime)
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2)

            oscillator.connect(gainNode)
            gainNode.connect(context.destination)

            oscillator.start()
            oscillator.stop(context.currentTime + 0.2)
        } catch (e) {
            console.error('Audio error:', e)
        }
    }

    useEffect(() => {
        const checkQueue = async () => {
            try {
                const currentQueue = await getQueueStatus()

                // Detection logic for sound
                // If a campaign that was in queue is now gone, it completed (or failed)
                const completed = prevQueueRef.current.find(prev =>
                    !currentQueue.find((curr: any) => curr.id === prev.id)
                )

                if (completed) {
                    setLastCompletedId(completed.id)
                    setShowCompleted(true)
                    playZapSound()
                    setTimeout(() => setShowCompleted(false), 5000)
                }

                setQueue(currentQueue)
                prevQueueRef.current = currentQueue
            } catch (error) {
                console.error('Queue poll error:', error)
            }
        }

        const interval = setInterval(checkQueue, 5000) // Poll every 5 seconds
        checkQueue()

        return () => clearInterval(interval)
    }, [])

    if (queue.length === 0 && !showCompleted) return null

    const processing = queue.find(c => c.status === 'PROCESSING')
    const queuedCount = queue.filter(c => c.status === 'QUEUED').length

    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
            <div
                className="px-6 py-4 rounded-2xl flex items-center gap-6 shadow-2xl backdrop-blur-xl border border-white/10"
                style={{ background: 'rgba(10, 10, 15, 0.9)', boxShadow: '0 0 40px rgba(168, 85, 247, 0.2)' }}
            >
                {processing ? (
                    <>
                        <div className="relative">
                            <Activity className="text-accent animate-pulse" size={24} />
                            <div className="absolute inset-0 bg-accent blur-md opacity-40 animate-pulse" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-accent-light">
                                Processando Agora
                            </span>
                            <span className="text-sm font-bold text-white max-w-[200px] truncate">
                                {processing.campaignName || processing.client}
                            </span>
                        </div>
                    </>
                ) : showCompleted ? (
                    <>
                        <CheckCircle2 className="text-secondary animate-bounce" size={24} />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-secondary">
                                Captura Concluída
                            </span>
                            <span className="text-sm font-bold text-white">
                                Sistema liberado
                            </span>
                        </div>
                    </>
                ) : null}

                {queuedCount > 0 && (
                    <div className="h-8 w-px bg-white/10" />
                )}

                {queuedCount > 0 && (
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Layers size={18} className="text-tertiary" />
                            <span className="text-sm font-bold text-tertiary-light">
                                {queuedCount} na fila
                            </span>
                        </div>

                        <button
                            onClick={async () => {
                                if (confirm('Deseja resetar a fila de capturas?')) {
                                    await stopAllCaptures()
                                }
                            }}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 transition-colors group"
                            title="Resetar Fila"
                        >
                            <Zap size={14} className="group-hover:animate-pulse" />
                        </button>
                    </div>
                )}

                {/* Cyberpunk "Zap" indicator */}
                <div className="flex items-center gap-1 ml-2">
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="w-1 h-3 rounded-full animate-shimmer"
                            style={{
                                background: 'var(--gradient-primary)',
                                animationDelay: `${i * 0.1}s`
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
