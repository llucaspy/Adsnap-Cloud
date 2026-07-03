'use client'

import {
    Archive,
    Database,
    Landmark,
    LayoutDashboard,
    Library,
    LogOut,
    Menu,
    Settings,
    ShieldCheck,
    X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getStorageUsage } from '@/app/actions'

type MenuItem = {
    icon: typeof LayoutDashboard
    label: string
    href: string
}

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
    const tone = isCriticalUsage ? '#d93025' : isHighUsage ? '#f9ab00' : '#188038'

    return (
        <div className="hidden xl:flex min-w-[180px] items-center gap-3 rounded-[8px] border border-[#e8eaed] bg-[#f8fafd] px-3 py-2">
            <Database size={15} style={{ color: tone }} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#5f6368]">Storage</span>
                    <span className="text-[11px] font-bold text-[#3c4043]">{usage.percentage.toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#e8eaed]">
                    <div className="h-full transition-all duration-700" style={{ width: `${usage.percentage}%`, background: tone }} />
                </div>
            </div>
        </div>
    )
}

function isActivePath(pathname: string, href: string) {
    if (href === '/') return pathname === '/'
    if (href === '/books') return pathname === '/books' || /^\/books\/(?!governo).+/.test(pathname)
    return pathname === href || pathname.startsWith(`${href}/`)
}

function NavLink({ item, active, onClick }: { item: MenuItem; active: boolean; onClick?: () => void }) {
    const Icon = item.icon

    return (
        <Link
            href={item.href}
            onClick={onClick}
            className="group inline-flex h-10 items-center gap-2 rounded-[8px] px-3 text-[13px] font-bold transition-all"
            style={{
                background: active ? '#e8f0fe' : 'transparent',
                color: active ? '#1a73e8' : '#3c4043',
                border: active ? '1px solid #d2e3fc' : '1px solid transparent',
            }}
        >
            <Icon size={16} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
            {item.label}
        </Link>
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

    const baseMenuItems: MenuItem[] = [
        { icon: LayoutDashboard, label: 'Home', href: '/' },
        { icon: Library, label: 'Books', href: '/books' },
        { icon: Landmark, label: 'Gov Federal', href: '/books/governo' },
        { icon: Archive, label: 'Arquivado', href: '/archive' },
    ]

    const menuItems = user?.role === 'admin'
        ? [
            ...baseMenuItems,
            { icon: ShieldCheck, label: 'Admin', href: '/admin' },
        ]
        : baseMenuItems

    return (
        <header
            className="sticky top-0 z-70 border-b border-[#e8eaed] bg-white/95 backdrop-blur-xl"
            style={{ boxShadow: 'rgba(60,64,67,0.10) 0px 1px 2px 0px' }}
        >
            <div className="flex min-h-[72px] items-center gap-4 px-4 md:px-8">
                <Link href="/" className="flex min-w-0 items-center gap-3 no-underline" onClick={() => setIsOpen(false)}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-[#d2e3fc] bg-[#e8f0fe] text-[#1a73e8]">
                        <LayoutDashboard size={18} />
                    </div>
                    <div className="min-w-0">
                        <p className="m-0 text-[10px] font-black uppercase tracking-[0.24em] text-[#5f6368]">Adsnap Cloud</p>
                        <p className="m-0 truncate text-[14px] font-extrabold text-[#202124]">Metropoles Workspace</p>
                    </div>
                </Link>

                <nav className="ml-2 hidden flex-1 items-center gap-1 lg:flex">
                    {menuItems.map(item => (
                        <NavLink
                            key={item.href}
                            item={item}
                            active={isActivePath(pathname, item.href)}
                        />
                    ))}
                </nav>

                <div className="ml-auto hidden items-center gap-2 lg:flex">
                    {user?.role === 'admin' && <StorageMonitor />}
                    <Link
                        href="/settings"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#e8eaed] bg-white text-[#5f6368] transition-colors hover:bg-[#f8fafd] hover:text-[#202124]"
                        aria-label="Configuracoes"
                    >
                        <Settings size={17} />
                    </Link>
                    <button
                        onClick={handleLogout}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#e8eaed] bg-white text-[#5f6368] transition-colors hover:bg-[#fce8e6] hover:text-[#d93025]"
                        aria-label="Sair"
                    >
                        <LogOut size={17} />
                    </button>
                </div>

                <button
                    onClick={() => setIsOpen(open => !open)}
                    className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[#e8eaed] bg-white text-[#202124] lg:hidden"
                    aria-label="Menu"
                >
                    {isOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {isOpen && (
                <div className="border-t border-[#e8eaed] bg-white px-4 py-3 lg:hidden">
                    <nav className="grid gap-1">
                        {menuItems.map(item => (
                            <NavLink
                                key={item.href}
                                item={item}
                                active={isActivePath(pathname, item.href)}
                                onClick={() => setIsOpen(false)}
                            />
                        ))}
                        <Link
                            href="/settings"
                            onClick={() => setIsOpen(false)}
                            className="inline-flex h-10 items-center gap-2 rounded-[8px] px-3 text-[13px] font-bold text-[#3c4043] no-underline"
                        >
                            <Settings size={16} />
                            Configuracoes
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="inline-flex h-10 items-center gap-2 rounded-[8px] px-3 text-left text-[13px] font-bold text-[#d93025]"
                        >
                            <LogOut size={16} />
                            Sair
                        </button>
                    </nav>
                </div>
            )}
        </header>
    )
}
