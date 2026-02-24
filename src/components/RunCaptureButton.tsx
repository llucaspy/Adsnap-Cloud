'use client'

import { runCapture } from '@/app/actions'
import { useTransition } from 'react'
import { Play, Loader2, RefreshCw } from 'lucide-react'

export function RunCaptureButton({ id, variant = 'compact' }: { id: string, variant?: 'compact' | 'full' }) {
    const [isPending, startTransition] = useTransition()

    const handleClick = () => {
        startTransition(async () => {
            const result = await runCapture(id)
            if (result.success) {
                // Could show a toast here
            } else {
                alert('Erro: ' + result.error)
            }
        })
    }

    if (variant === 'compact') {
        return (
            <button
                onClick={handleClick}
                disabled={isPending}
                className="p-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center group"
                style={{
                    background: 'var(--gradient-primary)',
                    boxShadow: '0 0 20px rgba(168, 85, 247, 0.3)'
                }}
                title="Capturar Agora"
            >
                {isPending ? (
                    <Loader2 size={18} className="animate-spin text-white" />
                ) : (
                    <Play size={18} className="text-white group-hover:scale-110 transition-transform" />
                )}
            </button>
        )
    }

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition-all disabled:opacity-50 text-white"
            style={{
                background: 'var(--gradient-primary)',
                boxShadow: 'var(--shadow-glow)'
            }}
        >
            {isPending ? (
                <Loader2 size={16} className="animate-spin" />
            ) : (
                <RefreshCw size={16} />
            )}
            {isPending ? 'Processando...' : 'Regerar Print'}
        </button>
    )
}
