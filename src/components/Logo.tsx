import { Zap } from 'lucide-react'

export function Logo() {
    return (
        <div className="flex items-center gap-3">
            {/* Animated Logo Icon */}
            <div
                className="w-11 h-11 rounded-xl flex items-center justify-center relative overflow-hidden animate-float"
                style={{
                    background: 'var(--gradient-primary)',
                    boxShadow: 'var(--shadow-glow)'
                }}
            >
                <Zap size={22} strokeWidth={2.5} className="text-white" />
            </div>

            {/* Logo Text */}
            <div className="flex flex-col">
                <span
                    className="text-xl font-bold tracking-tight text-gradient"
                    style={{ fontFamily: 'var(--font-display)' }}
                >
                    Adsnap
                </span>
                <span
                    className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                    style={{ color: 'var(--text-muted)' }}
                >
                    V2.0 PRO
                </span>
            </div>
        </div>
    )
}
