'use client'

import { LayoutDashboard, Activity, PlusCircle, Library, Archive, Settings, Sparkles, Zap, Instagram, Linkedin, Github, ShieldCheck, LogOut, Database, MessageCircle } from 'lucide-react'
import { Logo } from './Logo'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getStorageUsage } from '@/app/actions'

function StorageMonitor() {
    const [usage, setUsage] = useState<{ used: number; limit: number; percentage: number; formattedUsed: string } | null>(null)

    useEffect(() => {
        getStorageUsage().then(setUsage)
        const interval = setInterval(() => {
            getStorageUsage().then(setUsage)
        }, 1000 * 60 * 5)
        return () => clearInterval(interval)
    }, [])

    if (!usage) return null

    const isHighUsage = usage.percentage > 85
    const isCriticalUsage = usage.percentage > 95

    return (
        <div className="px-4 py-4 rounded-2xl bg-white/[0.03] border border-white/8 space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Database size={14} className={isCriticalUsage ? 'text-red-500' : isHighUsage ? 'text-orange-500' : 'text-white/50'} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Storage</span>
                </div>
                <span className="text-[10px] font-bold text-white/50">{usage.percentage.toFixed(1)}%</span>
            </div>

            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                    className={`h-full transition-all duration-1000 ${isCriticalUsage ? 'bg-red-500' : isHighUsage ? 'bg-orange-500' : 'bg-white/60'}`}
                    style={{ width: `${usage.percentage}%` }}
                />
            </div>

            <p className="text-[9px] font-medium text-white/25 text-center">
                {usage.formattedUsed} de 1024 MB usados
            </p>
        </div>
    )
}

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [user, setUser] = useState<{ role: string } | null>(null)

    useEffect(() => {
        fetch('/api/auth/me')
            .then(res => res.json())
            .then(data => {
                if (data.authenticated) {
                    setUser(data.user)
                }
            })
            .catch(() => setUser(null))
    }, [])

    const handleLogout = async () => {
        try {
            await fetch('/api/auth', { method: 'DELETE' })
            setUser(null)
            router.push('/login')
        } catch (error) {
            console.error('Logout error:', error)
        }
    }

    const baseMenuItems = [
        { icon: Sparkles, label: 'Nexus Zero', href: '/' },
        { icon: LayoutDashboard, label: 'Resumo', href: '/dashboard' },
        { icon: Activity, label: 'Monitoramento', href: '/monitoring' },
        { icon: PlusCircle, label: 'Novo Setup', href: '/campaigns' },
        { icon: Library, label: 'Books', href: '/books' },
        { icon: Archive, label: 'Arquivado', href: '/archive' },
    ]

    const menuItems = user?.role === 'admin'
        ? [
            ...baseMenuItems,
            { icon: Sparkles, label: 'Montagem de Prints', href: '/admin/assembly' },
            { icon: ShieldCheck, label: 'Admin', href: '/admin' }
        ]
        : baseMenuItems

    return (
        <aside
            className="w-72 flex flex-col h-screen sticky top-0 glass"
            style={{
                background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border)'
            }}
        >
            {/* Logo Area */}
            <div
                className="p-6 space-y-6"
                style={{ borderBottom: '1px solid var(--border)' }}
            >
                {/* System ID */}
                <div className="flex items-center gap-2 ml-1">
                    <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center shadow-lg">
                        <Zap size={14} className="text-white" />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">Adsnap</span>
                </div>

                {/* Workspace Card */}
                <div className="relative pt-3">
                    <div className="absolute -top-2 left-4 px-2 py-0.5 bg-white/8 border border-white/15 rounded text-[7px] font-black uppercase text-white/60 tracking-[0.2em] z-10 backdrop-blur-sm">
                        Client Workplace
                    </div>
                    <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5 flex flex-col items-center gap-3">
                        <img
                            src="https://assets.metroimg.com/images/logo-maisacessado.gif"
                            alt="Metrópoles"
                            className="h-10 w-auto object-contain"
                        />
                        <div className="h-px w-8 bg-gray-100" />
                        <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-900">
                            Metrópoles
                        </span>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-1">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden"
                            style={{
                                background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                            }}
                        >
                            {/* Subtle hover overlay */}
                            <div
                                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                style={{ background: 'var(--gradient-glow)' }}
                            />

                            <item.icon
                                size={20}
                                style={{
                                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                                }}
                                className="relative z-10 group-hover:scale-110 transition-transform duration-300"
                            />
                            <span
                                className="relative z-10 text-sm font-semibold transition-colors duration-300"
                                style={{
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    fontFamily: 'var(--font-body)'
                                }}
                            >
                                {item.label}
                            </span>
                            {isActive && (
                                <div
                                    className="ml-auto w-2 h-2 rounded-full animate-pulse-glow relative z-10"
                                    style={{ background: 'rgba(255,255,255,0.7)' }}
                                />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div
                className="p-4 space-y-3"
                style={{ borderTop: '1px solid var(--border)' }}
            >
                <Link
                    href="/settings"
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-all group"
                    style={{
                        color: pathname === '/settings' ? '#ffffff' : 'var(--text-muted)',
                        background: pathname === '/settings' ? 'rgba(255,255,255,0.07)' : 'transparent'
                    }}
                >
                    <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                    <span className="text-sm font-medium">Configurações</span>
                </Link>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-all group hover:bg-red-500/10 text-white/30 hover:text-red-400"
                    style={{ background: 'transparent' }}
                >
                    <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Sair</span>
                </button>

                {user?.role === 'admin' && <StorageMonitor />}

                {/* Developer Credits - Lucas Paim */}
                <div
                    className="mt-6 p-[1px] rounded-2xl relative overflow-hidden group transition-all duration-500 hover:shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                >
                    {/* Animated Border — white conic gradient */}
                    <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent_0%,rgba(255,255,255,0.6)_20%,transparent_40%)] animate-[spin_4s_linear_infinite] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                    <div className="relative z-10 p-4 rounded-2xl bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col gap-4 border border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-xl overflow-hidden group-hover:scale-105 transition-transform duration-500 shadow-2xl border border-white/10">
                                <img
                                    src="https://images.metroimg.com/2026/02/foto-lucas-paim.png"
                                    alt="Lucas Paim"
                                    className="w-full h-full object-cover filter grayscale brightness-110 hover:grayscale-0 transition-all duration-700"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-60" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <div className="w-1 h-1 rounded-full bg-white/50 animate-pulse" />
                                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50 px-1.5 py-0.5 bg-white/5 rounded-sm">Desenvolvedor do Sistema:</p>
                                </div>
                                <p
                                    className="text-base font-black truncate text-white tracking-tighter"
                                    style={{ fontFamily: 'var(--font-display)' }}
                                >
                                    LUCAS PAIM
                                </p>
                            </div>
                        </div>

                        {/* Social Links Grid */}
                        <div className="grid grid-cols-4 gap-2">
                            <a
                                href="https://github.com/llucaspy"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="GitHub"
                                className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-white/40 hover:text-white transition-all duration-300 shadow-lg"
                            >
                                <Github size={16} />
                            </a>
                            <a
                                href="https://www.linkedin.com/in/lucas-mendon%C3%A7a-1296412b8?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=android_app"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="LinkedIn"
                                className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 text-white/40 hover:text-blue-400 transition-all duration-300 shadow-lg"
                            >
                                <Linkedin size={16} />
                            </a>
                            <a
                                href="https://wa.me/556191761606"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                                className="flex items-center justify-center p-2.5 rounded-lg bg-green-500/5 border border-white/10 hover:bg-green-500/10 hover:border-green-500/30 text-white/40 hover:text-green-400 transition-all duration-300 shadow-lg"
                            >
                                <MessageCircle size={16} />
                            </a>
                            <a
                                href="https://www.instagram.com/llucas.py/"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Instagram"
                                className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-white/40 hover:text-white transition-all duration-300 shadow-lg"
                            >
                                <Instagram size={14} />
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    )
}
