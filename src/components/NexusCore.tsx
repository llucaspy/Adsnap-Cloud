'use client'

import React from 'react'

interface NexusOrbProps {
    className?: string
    isTyping?: boolean
    showRays?: boolean
    particleCount?: number
    small?: boolean
}

function NexusOrb({ className = "", isTyping = false, showRays = true, particleCount = 8, small = false }: NexusOrbProps) {
    const [mounted, setMounted] = React.useState(false)
    const [particles, setParticles] = React.useState<any[]>([])

    React.useEffect(() => {
        setMounted(true)
        const newParticles = [...Array(particleCount)].map((_, i) => ({
            angle: (360 / particleCount) * i,
            size: Math.random() * 2 + 1,
            speed: 0.6 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            radius: i % 2 === 0 ? 40 : 33,
            delay: i * 0.4,
        }))
        setParticles(newParticles)
    }, [particleCount])

    return (
        <div className={`relative flex items-center justify-center ${className}`}>

            {/* === AMBIENT GLOW === */}
            <div
                className="absolute inset-[-18%] rounded-full pointer-events-none"
                style={{
                    background: isTyping
                        ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)'
                        : 'radial-gradient(ellipse at center, rgba(255,255,255,0.05) 0%, transparent 70%)',
                    animation: 'nexus-breathe 4s ease-in-out infinite',
                }}
            />

            {/* === RING 1 — slow outer === */}
            <div
                className="absolute inset-[2%] rounded-full pointer-events-none"
                style={{
                    border: '1px solid rgba(255,255,255,0.18)',
                    animation: `nexus-spin-cw ${isTyping ? 6 : 24}s linear infinite`,
                    boxShadow: '0 0 6px rgba(255,255,255,0.08)',
                }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80"
                    style={{ boxShadow: '0 0 6px 2px rgba(255,255,255,0.5)' }} />
            </div>

            {/* === RING 2 — counter-rotate dashed === */}
            <div
                className="absolute inset-[11%] rounded-full pointer-events-none"
                style={{
                    border: '1px dashed rgba(255,255,255,0.12)',
                    animation: `nexus-spin-ccw ${isTyping ? 4 : 16}s linear infinite`,
                    transform: 'rotateX(55deg)',
                }}
            >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-white/60"
                    style={{ boxShadow: '0 0 4px rgba(255,255,255,0.5)' }} />
            </div>

            {/* === RING 3 — rounded square === */}
            <div
                className="absolute inset-[21%] pointer-events-none"
                style={{
                    borderRadius: '30%',
                    border: '1.5px solid rgba(255,255,255,0.10)',
                    animation: `nexus-spin-cw ${isTyping ? 2.5 : 10}s linear infinite`,
                    filter: 'blur(0.4px)',
                }}
            />

            {/* === RING 4 — fastest inner === */}
            <div
                className="absolute inset-[30%] pointer-events-none"
                style={{
                    borderRadius: '40%',
                    border: '1px solid rgba(255,255,255,0.08)',
                    animation: `nexus-spin-ccw ${isTyping ? 1.8 : 7}s linear infinite`,
                }}
            />

            {/* === ORBITAL PARTICLES === */}
            {mounted && particles.map((p, i) => (
                <div
                    key={i}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        background: i % 4 === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(200,200,200,0.45)',
                        boxShadow: `0 0 ${p.size * 3}px rgba(255,255,255,0.4)`,
                        top: '50%',
                        left: '50%',
                        marginTop: '-0.5px',
                        marginLeft: '-0.5px',
                        animation: `${i % 2 === 0 ? 'nexus-orbit-out' : 'nexus-orbit-in'} ${(isTyping ? 2.5 : 7) / p.speed}s linear infinite ${p.delay}s`,
                    }}
                />
            ))}

            {/* === LIGHT RAYS === */}
            {showRays && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-full opacity-20"
                    style={{ animation: 'nexus-spin-cw 10s linear infinite' }}>
                    {[0, 72, 144, 216, 288].map((deg, i) => (
                        <div key={i} className="absolute top-0 left-1/2 h-full"
                            style={{
                                width: '1px',
                                background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent 45%, transparent 55%, rgba(255,255,255,0.3))',
                                transform: `translateX(-50%) rotate(${deg}deg)`,
                                transformOrigin: 'center',
                            }} />
                    ))}
                </div>
            )}

            {/* === PLASMA CORE === */}
            <div className="relative pointer-events-none" style={{ width: '28%', height: '28%' }}>

                {/* Outer glow */}
                <div className="absolute inset-0 rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.5) 0%, rgba(180,180,180,0.25) 40%, transparent 70%)',
                        animation: isTyping ? 'nexus-plasma-pulse 0.7s ease-in-out infinite alternate' : 'nexus-plasma 4.5s ease-in-out infinite alternate',
                        boxShadow: isTyping
                            ? '0 0 30px rgba(255,255,255,0.5), 0 0 70px rgba(255,255,255,0.2)'
                            : '0 0 18px rgba(255,255,255,0.3), 0 0 40px rgba(255,255,255,0.1)',
                    }}
                />

                {/* Core surface */}
                <div className="absolute inset-[8%] rounded-full"
                    style={{
                        background: 'radial-gradient(ellipse at 38% 32%, rgba(255,255,255,0.4) 0%, rgba(160,160,160,0.2) 40%, rgba(20,20,20,0.95) 100%)',
                        backdropFilter: 'blur(8px)',
                    }}
                />

                {/* Shimmer highlight */}
                <div className="absolute rounded-full"
                    style={{
                        top: '14%', left: '20%',
                        width: '28%', height: '18%',
                        background: 'rgba(255,255,255,0.55)',
                        filter: 'blur(3px)',
                        animation: 'nexus-shimmer 3.5s ease-in-out infinite',
                    }}
                />

                {/* Typing ping rings */}
                {isTyping && (
                    <>
                        <div className="absolute inset-[-40%] rounded-full border border-white/30"
                            style={{ animation: 'nexus-ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
                        <div className="absolute inset-[-80%] rounded-full border border-white/15"
                            style={{ animation: 'nexus-ping 1s cubic-bezier(0,0,0.2,1) infinite', animationDelay: '0.35s' }} />
                    </>
                )}
            </div>

            <style>{`
                @keyframes nexus-breathe {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.07); opacity: 0.8; }
                }
                @keyframes nexus-spin-cw {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes nexus-spin-ccw {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(-360deg); }
                }
                @keyframes nexus-orbit-out {
                    from { transform: rotate(0deg) translateX(42%) rotate(0deg); }
                    to   { transform: rotate(360deg) translateX(42%) rotate(-360deg); }
                }
                @keyframes nexus-orbit-in {
                    from { transform: rotate(0deg) translateX(34%) rotate(0deg); }
                    to   { transform: rotate(-360deg) translateX(34%) rotate(360deg); }
                }
                @keyframes nexus-plasma {
                    0%   { transform: scale(1) rotate(0deg); }
                    50%  { transform: scale(1.08) rotate(4deg); }
                    100% { transform: scale(0.96) rotate(-3deg); }
                }
                @keyframes nexus-plasma-pulse {
                    0%   { transform: scale(1.08); }
                    100% { transform: scale(1.22); }
                }
                @keyframes nexus-shimmer {
                    0%, 100% { opacity: 0.5; transform: translate(0, 0); }
                    50%      { opacity: 0.8; transform: translate(2px, -1px); }
                }
                @keyframes nexus-ping {
                    0%   { transform: scale(1); opacity: 0.5; }
                    100% { transform: scale(2); opacity: 0; }
                }
            `}</style>
        </div>
    )
}

export function NexusCore() {
    return <NexusOrb className="w-[300px] h-[300px] sm:w-[500px] sm:h-[500px]" particleCount={10} />
}

export function NexusSmallCore({ isTyping = false }: { isTyping?: boolean }) {
    return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <NexusOrb
                className="w-full h-full"
                isTyping={isTyping}
                showRays={true}
                particleCount={4}
                small={true}
            />
        </div>
    )
}
