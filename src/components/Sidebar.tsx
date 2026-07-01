'use client'

import { LayoutDashboard, Activity, PlusCircle, Library, Archive, Settings, Sparkles, Instagram, Linkedin, Github, ShieldCheck, LogOut, Database, MessageCircle, Menu, X, ServerCog, Landmark } from 'lucide-react'
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
        <div className="px-4 py-4 rounded-2xl bg-white/3 border border-white/8 space-y-3">
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
    const [isOpen, setIsOpen] = useState(false)

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
        { icon: ServerCog, label: 'Workers', href: '/workers' },
        { icon: PlusCircle, label: 'Novo Setup', href: '/campaigns' },
        { icon: Library, label: 'Books', href: '/books' },
        { icon: Landmark, label: 'Gov Federal', href: '/books/governo' },
        { icon: Archive, label: 'Arquivado', href: '/archive' },
    ]

    const menuItems = user?.role === 'admin'
        ? [
            ...baseMenuItems,
            { icon: ShieldCheck, label: 'Admin', href: '/admin' }
        ]
        : baseMenuItems

    return (
        <>
            {/* Mobile Menu Toggle Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="lg:hidden fixed top-6 left-6 z-50 p-3 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-xl text-white hover:bg-white/10 transition-all shadow-2xl"
            >
                <Menu size={24} />
            </button>

            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-60 lg:hidden animate-fade-in"
                    onClick={() => setIsOpen(false)}
                />
            )}

            <aside
                className={`w-72 flex flex-col h-screen fixed inset-y-0 left-0 z-70 glass transition-transform duration-500 lg:sticky lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                style={{
                    background: '#111111',
                    borderRight: '1px solid rgba(255,255,255,0.07)'
                }}
            >
                {/* Logo Area */}
                <div
                    className="p-6 space-y-5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
                >
                    {/* Header with Close Button for Mobile */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center px-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-white/50">
                                Adsnap <span className="text-white/20">Cloud</span>
                            </span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="lg:hidden p-2 text-white/30 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Workspace Card */}
                    <div className="relative pt-4">
                        {/* Floating Badge for Workplace Identification */}
                        <div
                            className="absolute -top-1 left-4 px-3 py-1 bg-white border border-gray-200 rounded-full text-[8px] font-black uppercase text-gray-800 tracking-[0.2em] z-20 shadow-xl flex items-center gap-2"
                            style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                        >
                            <div className="w-1.5 h-1.5 rounded-full bg-[#ff0000] animate-pulse" />
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
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-300 group relative overflow-hidden"
                                style={{
                                    background: isActive ? 'rgba(255,255,255,0.07)' : 'transparent',
                                }}
                            >
                                <div
                                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                                    style={{ background: 'var(--gradient-glow)' }}
                                />

                                <item.icon
                                    size={20}
                                    style={{
                                        color: isActive ? '#ffffff' : '#525252',
                                    }}
                                    className="relative z-10 group-hover:scale-110 transition-transform duration-300"
                                />
                                <span
                                    className="relative z-10 text-sm font-semibold transition-colors duration-300"
                                    style={{
                                        color: isActive ? '#ffffff' : '#a3a3a3',
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
                    className="p-4 space-y-3 mt-auto"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                >
                    <Link
                        href="/settings"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-xl transition-all group"
                        style={{
                            color: pathname === '/settings' ? '#ffffff' : '#525252',
                            background: pathname === '/settings' ? 'rgba(255,255,255,0.07)' : 'transparent'
                        }}
                    >
                        <Settings size={18} className="group-hover:rotate-90 transition-transform duration-500" />
                        <span className="text-[13px]">Configurações</span>
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
                    <div className="mt-6 p-px rounded-2xl relative overflow-hidden group transition-all duration-500 hover:shadow-[0_0_30px_rgba(255,255,255,0.08)] hidden lg:block">
                        <div className="relative z-10 p-4 rounded-2xl bg-[#0a0a0a]/95 backdrop-blur-xl flex flex-col gap-4 border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="relative w-12 h-12 rounded-xl overflow-hidden group-hover:scale-105 transition-transform duration-500 shadow-2xl border border-white/10">
                                    <img
                                        src="https://images.metroimg.com/2026/02/foto-lucas-paim.png"
                                        alt="Lucas Paim"
                                        className="w-full h-full object-cover filter grayscale brightness-110 hover:grayscale-0 transition-all duration-700"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/50 px-1.5 py-0.5 bg-white/5 rounded-sm">Desenvolvedor:</p>
                                    <p className="text-base font-black truncate text-white tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>LUCAS PAIM</p>
                                </div>
                            </div>


                            {/* Social Links Grid */}
                            <div className="grid grid-cols-4 gap-2">
                                <a href="https://github.com/llucaspy" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-white/40 hover:text-white transition-all duration-300 shadow-lg">
                                    <Github size={16} />
                                </a>
                                <a href="https://www.linkedin.com/in/lucas-mendon%C3%A7a-1296412b8" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-blue-500/10 hover:border-blue-500/30 text-white/40 hover:text-blue-400 transition-all duration-300 shadow-lg">
                                    <Linkedin size={16} />
                                </a>
                                <a href="https://wa.me/556191761606" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2.5 rounded-lg bg-green-500/5 border border-white/10 hover:bg-green-500/10 hover:border-green-500/30 text-white/40 hover:text-green-400 transition-all duration-300 shadow-lg">
                                    <MessageCircle size={16} />
                                </a>
                                <a href="https://www.instagram.com/llucas.py/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center p-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/25 text-white/40 hover:text-white transition-all duration-300 shadow-lg">
                                    <Instagram size={16} />
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    )
}
