'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, ArrowRight, Github, Linkedin, Instagram } from 'lucide-react'

// =============================================================================
// NEXUS TERMINAL - Animated AI boot sequence
// =============================================================================

const TERMINAL_LINES = [
    { type: 'system', text: '[NEXUS AI] Initializing neural core...' },
    { type: 'system', text: '[NEXUS AI] Loading automation modules...' },
    { type: 'progress', text: '██████████████████████████ 100%' },
    { type: 'success', text: '✓ Neural engine online' },
    { type: 'success', text: '✓ Ad optimization layer active' },
    { type: 'success', text: '✓ Audience targeting synced' },
    { type: 'system', text: '[NEXUS AI] Running diagnostics...' },
    { type: 'data', text: '→ Active campaigns: 47' },
    { type: 'data', text: '→ Conversions (24h): 1,283' },
    { type: 'data', text: '→ ROAS: 4.7x' },
    { type: 'data', text: '→ Budget utilization: 92.3%' },
    { type: 'success', text: '✓ All systems nominal' },
    { type: 'system', text: '[NEXUS AI] Awaiting operator authentication...' },
    { type: 'prompt', text: 'nexus@adsnap-v2:~$ _' },
]

function NexusTerminal() {
    const [visibleLines, setVisibleLines] = useState(0)
    const terminalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (visibleLines < TERMINAL_LINES.length) {
            const line = TERMINAL_LINES[visibleLines]
            const delay = line?.type === 'progress' ? 800 : line?.type === 'system' ? 600 : 300
            const timer = setTimeout(() => setVisibleLines(prev => prev + 1), delay)
            return () => clearTimeout(timer)
        } else {
            const timer = setTimeout(() => setVisibleLines(0), 4000)
            return () => clearTimeout(timer)
        }
    }, [visibleLines])

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight
        }
    }, [visibleLines])

    const getLineColor = (type: string) => {
        switch (type) {
            case 'system': return 'var(--text-muted)'
            case 'success': return 'var(--accent)'
            case 'data': return 'var(--text-secondary)'
            case 'progress': return 'var(--accent)'
            case 'prompt': return 'var(--accent)'
            default: return 'var(--text-primary)'
        }
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            style={{ width: 420, flexShrink: 0, perspective: 1200 }}
        >
            {/* Nexus AI Logo */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: 20,
                }}
            >
                {/* Animated eye icon */}
                <motion.div
                    animate={{ scale: [1, 1.08, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: 'var(--accent-muted)',
                        border: '1px solid var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 20px var(--accent-glow)',
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                </motion.div>
                <div>
                    <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        letterSpacing: '0.05em',
                        lineHeight: 1.2,
                    }}>
                        NEXUS <span style={{ color: 'var(--accent)' }}>AI</span>
                    </div>
                    <div style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        letterSpacing: '0.15em',
                    }}>
                        NEURAL ENGINE
                    </div>
                </div>
            </motion.div>

            {/* Terminal with 3D tilt */}
            <div style={{ transform: 'rotateY(-6deg) rotateX(2deg)', transformOrigin: 'center center' }}>
                <div
                    style={{
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-glass)',
                        backdropFilter: 'blur(8px)',
                        overflow: 'hidden',
                        boxShadow: '0 0 20px var(--accent-muted), 0 0 60px rgba(0,0,0,0.3)',
                        height: 420,
                        display: 'flex',
                        flexDirection: 'column' as const,
                    }}
                >
                    {/* Title bar */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--border)',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        <div style={{ display: 'flex', gap: 6 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.7)' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.7)' }} />
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(150, 150, 150, 0.6)' }} />
                        </div>
                        <span
                            style={{
                                fontFamily: "'JetBrains Mono', 'Space Grotesk', monospace",
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                marginLeft: 8,
                            }}
                        >
                            nexus-ai — neural_core v3.2.1
                        </span>
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <div
                                className="animate-pulse-glow"
                                style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: '50%',
                                    background: 'var(--accent)',
                                }}
                            />
                            <span
                                style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: 10,
                                    color: 'var(--accent-dark)',
                                }}
                            >
                                LIVE
                            </span>
                        </div>
                    </div>

                    {/* Terminal body */}
                    <div
                        ref={terminalRef}
                        style={{
                            padding: 16,
                            flex: 1,
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
                                <motion.div
                                    key={`${i}-${visibleLines > i ? 'v' : 'h'}`}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.15 }}
                                    style={{
                                        fontFamily: "'JetBrains Mono', 'Space Grotesk', monospace",
                                        fontSize: 12,
                                        lineHeight: 1.8,
                                        color: getLineColor(line.type),
                                        fontWeight: line.type === 'prompt' ? 600 : 400,
                                    }}
                                >
                                    {line.text}
                                    {line.type === 'prompt' && (
                                        <span
                                            style={{
                                                display: 'inline-block',
                                                width: 8,
                                                height: 14,
                                                background: 'var(--accent)',
                                                marginLeft: 2,
                                                marginBottom: -2,
                                                animation: 'blink-cursor 1s step-end infinite',
                                            }}
                                        />
                                    )}
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Status bar */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 16px',
                            borderTop: '1px solid var(--border)',
                            background: 'var(--bg-tertiary)',
                        }}
                    >
                        <span
                            style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 10,
                                color: 'var(--accent-dark)',
                            }}
                        >
                            NEXUS AI ENGINE
                        </span>
                        <span
                            style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: 10,
                                color: 'var(--text-muted)',
                            }}
                        >
                            {visibleLines}/{TERMINAL_LINES.length} tasks
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// =============================================================================
// LOGIN PAGE
// =============================================================================

export default function LoginPage() {
    const [showPassword, setShowPassword] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Erro ao realizar login')
            }

            if (data.user.role === 'admin') {
                window.location.href = '/admin'
            } else {
                window.location.href = '/'
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden"
            style={{ background: 'var(--bg-primary)' }}
        >
            {/* CSS for terminal cursor blink */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
                @keyframes blink-cursor {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>

            {/* Background glow effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div
                    className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px]"
                    style={{ background: 'var(--accent-muted)' }}
                />
                <div
                    className="absolute bottom-0 left-1/4 w-[400px] h-[400px] rounded-full blur-[100px]"
                    style={{ background: 'var(--secondary-muted, rgba(236, 72, 153, 0.08))' }}
                />
            </div>

            {/* Grid pattern overlay */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    backgroundImage: `linear-gradient(var(--text-muted) 1px, transparent 1px), linear-gradient(90deg, var(--text-muted) 1px, transparent 1px)`,
                    backgroundSize: '60px 60px',
                    opacity: 0.03,
                }}
            />

            {/* Main two-column layout */}
            <div
                className="relative z-10 flex w-full items-center justify-center gap-12 px-6"
                style={{ maxWidth: 1000 }}
            >
                {/* Left column: Logo + Login */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
                    style={{ width: '100%', maxWidth: 420 }}
                >
                    {/* Logo area */}
                    <div className="text-center mb-10">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.6 }}
                            className="flex flex-col items-center mb-6"
                        >
                            {/* Premium Logo Badge */}
                            <div className="relative group">
                                <div className="absolute -inset-4 bg-white/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition duration-1000"></div>
                                <div className="relative bg-white p-6 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center min-w-[220px]">
                                    <img
                                        src="/logo.png"
                                        alt="Adsnap"
                                        className="h-10 w-auto object-contain"
                                    />
                                </div>
                            </div>
                        </motion.div>

                        <p
                            className="mt-3 text-sm"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            Acesse sua central de controle e automação
                        </p>
                    </div>

                    {/* Login card */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3, duration: 0.6 }}
                        className="glass rounded-2xl p-8 space-y-6"
                    >
                        {error && (
                            <div
                                className="p-3 rounded-lg text-xs font-medium text-center animate-fade-in"
                                style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                            >
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                {/* Email */}
                                <div className="space-y-2">
                                    <label
                                        className="text-sm font-medium"
                                        style={{ color: 'rgba(255,255,255,0.8)' }}
                                    >
                                        Usuário ou E-mail
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Digite seu e-mail"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full h-12 px-4 rounded-xl text-sm outline-none transition-all"
                                        required
                                        style={{
                                            background: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--text-primary)',
                                            fontFamily: 'var(--font-body)',
                                        }}
                                        onFocus={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--accent)'
                                            e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-muted)'
                                        }}
                                        onBlur={(e) => {
                                            e.currentTarget.style.borderColor = 'var(--border)'
                                            e.currentTarget.style.boxShadow = 'none'
                                        }}
                                    />
                                </div>

                                {/* Password */}
                                <div className="space-y-2">
                                    <label
                                        className="text-sm font-medium"
                                        style={{ color: 'rgba(255,255,255,0.8)' }}
                                    >
                                        Senha
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full h-12 px-4 pr-12 rounded-xl text-sm outline-none transition-all"
                                            required
                                            style={{
                                                background: 'var(--bg-tertiary)',
                                                border: '1px solid var(--border)',
                                                color: 'var(--text-primary)',
                                                fontFamily: 'var(--font-body)',
                                            }}
                                            onFocus={(e) => {
                                                e.currentTarget.style.borderColor = 'var(--accent)'
                                                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-muted)'
                                            }}
                                            onBlur={(e) => {
                                                e.currentTarget.style.borderColor = 'var(--border)'
                                                e.currentTarget.style.boxShadow = 'none'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                                            style={{ color: 'var(--text-muted)' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-4 h-4" />
                                            ) : (
                                                <Eye className="w-4 h-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Remember me / Forgot password */}
                            <div className="flex items-center justify-between text-sm">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="w-4 h-4 rounded"
                                        style={{
                                            accentColor: 'var(--accent)',
                                            background: 'var(--bg-tertiary)',
                                            border: '1px solid var(--border)',
                                        }}
                                    />
                                    <span style={{ color: 'var(--text-muted)' }}>Lembrar-me</span>
                                </label>
                                <a
                                    href="#"
                                    className="transition-colors"
                                    style={{ color: 'var(--accent)' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-light)' }}
                                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                                >
                                    Esqueci a senha
                                </a>
                            </div>

                            {/* Primary CTA */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-glow w-full h-12 rounded-xl font-semibold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                style={{
                                    color: 'white',
                                    border: 'none',
                                    fontFamily: 'var(--font-body)',
                                }}
                            >
                                {loading ? 'Autenticando...' : (
                                    <>
                                        Acessar Central
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div
                                    className="w-full"
                                    style={{ borderTop: '1px solid var(--border)' }}
                                />
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span
                                    className="px-3"
                                    style={{
                                        background: 'var(--bg-glass)',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    ou
                                </span>
                            </div>
                        </div>

                        {/* Secondary CTA */}
                        <button
                            className="w-full h-12 rounded-xl font-medium flex items-center justify-center transition-all cursor-pointer"
                            style={{
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                color: 'var(--text-secondary)',
                                fontFamily: 'var(--font-body)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--accent)'
                                e.currentTarget.style.color = 'var(--text-primary)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)'
                                e.currentTarget.style.color = 'var(--text-secondary)'
                            }}
                        >
                            Solicitar acesso
                        </button>
                    </motion.div>

                    {/* Developer section */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="mt-10 text-center space-y-3"
                    >
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Desenvolvido por{' '}
                            <span className="font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                Lucas Paim
                            </span>{' '}
                            — Dev Full Stack &amp; Automação
                        </p>
                        <div className="flex items-center justify-center gap-4">
                            <a
                                href="https://github.com/llucaspy"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                                <Github className="w-4 h-4" />
                            </a>
                            <a
                                href="https://www.linkedin.com/in/lucas-mendon%C3%A7a-1296412b8"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                                <Linkedin className="w-4 h-4" />
                            </a>
                            <a
                                href="https://www.instagram.com/llucas.py/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                            >
                                <Instagram className="w-4 h-4" />
                            </a>
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                            Adsnap V2 PRO © 2026 — Automação neural de mídia
                        </p>
                    </motion.div>
                </motion.div>

                {/* Right column: Nexus AI Terminal (desktop only) */}
                <div className="hidden lg:block" style={{ paddingTop: 64 }}>
                    <NexusTerminal />
                </div>
            </div>
        </div>
    )
}
