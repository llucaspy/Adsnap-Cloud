'use client'

import { LayoutDashboard, Activity, PlusCircle, Library, Archive, Settings, Sparkles, Instagram, Linkedin, Github, ShieldCheck, LogOut, Database, MessageCircle, Menu, X, ServerCog } from 'lucide-react'
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
        <div className="px-4 py-4 rounded-xl space-y-3" style={{ background: '#ede9e1' }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Database size={14} className={isCriticalUsage ? 'text-red-500' : isHighUsage ? 'text-orange-500' : 'text-[#a89f8c]'} />
                    <span className="text-[10px] uppercase tracking-widest text-[#a89f8c]" style={{fontWeight: 600}}>Storage</span>
                </div>
                <span className="text-[10px] font-bold text-[#1c1917]">{usage.percentage.toFixed(1)}%</span>
            </div>

            <div className="h-1 w-full rounded-[2px] overflow-hidden" style={{ background: '#e8e5df' }}>
                <div
                    className={`h-full transition-all duration-1000 ${isCriticalUsage ? 'bg-red-500' : isHighUsage ? 'bg-orange-500' : 'bg-[#1c1917]'}`}
                    style={{ width: `${usage.percentage}%` }}
                />
            </div>

            <p className="text-[9px] font-medium text-[#a89f8c] text-center">
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
                className={`w-72 flex flex-col h-screen fixed inset-y-0 left-0 z-70 transition-transform duration-500 lg:sticky lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
                style={{
                    background: '#f3f0ea',
                    borderRight: '0.5px solid #e8e5df'
                }}
            >
                {/* Logo Area */}
                <div
                    className="p-6 space-y-5"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    {/* Header with Close Button for Mobile */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center px-1">
                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-[#1c1917]">
                                Adsnap <span className="text-[#a89f8c]">Cloud</span>
                            </span>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="lg:hidden p-2 text-[#a89f8c] hover:text-[#1c1917] transition-colors"
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

                        <div className="bg-transparent py-4 flex flex-col items-center justify-center">
                            <span className="text-[11px] font-[600] tracking-[0.07em] uppercase text-[#a89f8c]">
                                ADSNAP CLOUD
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
                                className="flex items-center gap-3 px-4 py-3.5 transition-all duration-300 group relative overflow-hidden rounded-lg hover:bg-[#ede9e1]"
                                style={{
                                    background: isActive ? '#e8e4dd' : 'transparent',
                                }}
                            >
                                <item.icon
                                    size={16}
                                    style={{ color: '#a89f8c' }}
                                    className="relative z-10 transition-transform duration-300 group-hover:-translate-y-0.5"
                                />
                                <span
                                    className="text-[13px] transition-colors duration-300 relative z-10"
                                    style={{
                                        color: '#1c1917',
                                        fontFamily: 'var(--font-body)',
                                        fontWeight: isActive ? 600 : 500
                                    }}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        )
                    })}
                </nav>

                {/* Footer */}
                    <div
                        className="p-3"
                        style={{ borderTop: '0.5px solid #e8e5df' }}
                    >
                    <Link
                        href="/settings"
                        onClick={() => setIsOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-all group hover:bg-[#ede9e1]"
                        style={{
                            color: pathname === '/settings' ? '#1c1917' : '#a89f8c',
                            background: pathname === '/settings' ? '#e8e4dd' : 'transparent',
                            fontWeight: pathname === '/settings' ? 600 : 500
                        }}
                    >
                        <Settings size={16} className="group-hover:rotate-90 transition-transform duration-500" />
                        <span className="text-[13px]">Configurações</span>
                    </Link>

                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg transition-all group mt-1 hover:bg-[#ede9e1]"
                        style={{ color: '#a89f8c' }}
                    >
                        <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
                        <span className="text-[13px] font-[500]">Sair</span>
                    </button>

                    {user?.role === 'admin' && <StorageMonitor />}

                    {/* Developer Credits - Lucas Paim */}
                    <div className="mt-4 hidden lg:block px-2 pb-4">
                        <div className="p-[10px] rounded-[8px] flex flex-col gap-3" style={{ background: '#ede9e1' }}>
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full overflow-hidden">
                                    <img
                                        src="https://images.metroimg.com/2026/02/foto-lucas-paim.png"
                                        alt="Lucas Paim"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-[#a89f8c] mb-0" style={{fontFamily: 'var(--font-body)', fontWeight: 600}}>DEVELOPER</p>
                                    <p className="text-[13px] font-[600] text-[#1c1917]">Lucas Paim</p>
                                </div>
                            </div>


                            {/* Social Links Grid */}
                            <div className="flex items-center justify-around mt-2">
                                <a href="https://github.com/llucaspy" target="_blank" rel="noopener noreferrer" className="text-[#a89f8c] hover:text-[#1c1917] transition-colors">
                                    <Github size={16} />
                                </a>
                                <a href="https://www.linkedin.com/in/lucas-mendon%C3%A7a-1296412b8" target="_blank" rel="noopener noreferrer" className="text-[#a89f8c] hover:text-[#1c1917] transition-colors">
                                    <Linkedin size={16} />
                                </a>
                                <a href="https://wa.me/556191761606" target="_blank" rel="noopener noreferrer" className="text-[#a89f8c] hover:text-[#1c1917] transition-colors">
                                    <MessageCircle size={16} />
                                </a>
                                <a href="https://www.instagram.com/llucas.py/" target="_blank" rel="noopener noreferrer" className="text-[#a89f8c] hover:text-[#1c1917] transition-colors">
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
