'use client'

import React from 'react'

interface NexusOrbProps {
    className?: string
    isTyping?: boolean
    showRays?: boolean
    particleCount?: number
}

function NexusOrb({ className = "", isTyping = false, showRays = true, particleCount = 6 }: NexusOrbProps) {
    const [mounted, setMounted] = React.useState(false)
    const [particles, setParticles] = React.useState<any[]>([])

    React.useEffect(() => {
        setMounted(true)
        const newParticles = [...Array(particleCount)].map((_, i) => ({
            width: Math.random() * 4 + 2 + 'px',
            height: Math.random() * 4 + 2 + 'px',
            top: Math.random() * 100 + '%',
            left: Math.random() * 100 + '%',
            delay: i * 0.5 + 's',
            duration: 3 + Math.random() * 2 + 's'
        }))
        setParticles(newParticles)
    }, [particleCount])

    return (
        <div className={`relative flex items-center justify-center pointer-events-none ${className}`}>
            {/* Outer Ring */}
            <div className={`absolute inset-0 rounded-full border border-purple-500/10 ${isTyping ? 'animate-[spin_4s_linear_infinite]' : 'animate-[spin_20s_linear_infinite]'}`} />

            {/* Geometric Orbitals */}
            <div className={`absolute inset-[4%] rounded-[40%] border-[2px] border-accent/20 ${isTyping ? 'animate-[spin_3s_linear_infinite_reverse]' : 'animate-[spin_12s_linear_infinite_reverse]'} blur-[1px]`} />
            <div className={`absolute inset-[12%] rounded-[30%] border border-cyan-400/10 ${isTyping ? 'animate-[spin_2s_linear_infinite]' : 'animate-[spin_8s_linear_infinite]'}`} />

            {/* The Neural Hub (Glass Core) */}
            <div className="relative w-[32%] h-[32%] rounded-full flex items-center justify-center overflow-hidden">
                {/* Background Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-accent/40 via-purple-600/20 to-transparent blur-xl animate-pulse" />

                {/* Surface Reflection */}
                <div className="absolute inset-0 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-full shadow-[inset_0_0_40px_rgba(255,255,255,0.05)]" />

                {/* Floating "Neural" Particles */}
                <div className="absolute inset-0 opacity-50">
                    {mounted && particles.map((p, i) => (
                        <div
                            key={i}
                            className="absolute bg-white rounded-full animate-float"
                            style={{
                                width: p.width,
                                height: p.height,
                                top: p.top,
                                left: p.left,
                                animationDelay: p.delay,
                                animationDuration: p.duration
                            }}
                        />
                    ))}
                </div>

                {/* Core Icon */}
                <div className="relative z-10 w-[60%] h-[60%] rounded-[20%] bg-white/5 border border-white/10 flex items-center justify-center backdrop-blur-md shadow-2xl rotate-12">
                    <div className={`w-[60%] h-[60%] border-[2px] border-accent rounded-[20%] flex items-center justify-center ${isTyping ? 'animate-pulse' : ''}`}>
                        <div className="w-[40%] h-[40%] bg-accent rounded-[15%] shadow-[0_0_10px_var(--accent)]" />
                    </div>
                </div>
            </div>

            {/* Light Rays */}
            {showRays && (
                <>
                    <div className="absolute w-[120%] h-[0.5%] bg-gradient-to-r from-transparent via-accent/20 to-transparent rotate-45 blur-md" />
                    <div className="absolute w-[120%] h-[0.5%] bg-gradient-to-r from-transparent via-purple-500/10 to-transparent -rotate-45 blur-md" />
                </>
            )}
        </div>
    )
}

export function NexusCore() {
    return <NexusOrb className="w-[300px] h-[300px] sm:w-[500px] sm:h-[500px]" />
}

export function NexusSmallCore({ isTyping = false }: { isTyping?: boolean }) {
    return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <NexusOrb
                className="w-full h-full"
                isTyping={isTyping}
                showRays={true}
                particleCount={3}
            />
        </div>
    )
}
