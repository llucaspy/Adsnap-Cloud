import prisma from '@/lib/prisma'
import { Library, Download, Clock, Calendar, FolderOpen } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { BackToTopButton } from '@/components/BackToTopButton'
import { PIFolderCard } from '@/components/PIFolderCard'

export const dynamic = 'force-dynamic'

export default async function BooksPage() {
    const captures = await prisma.capture.findMany({
        where: {
            status: 'SUCCESS',
            campaign: { isArchived: false }
        },
        include: { campaign: true },
        orderBy: { createdAt: 'desc' }
    })

    // Group by day + PI (BRT)
    const groupedCaptures = captures.reduce((acc: any, capture: any) => {
        const brtTime = new Date(capture.createdAt.getTime() - (3 * 60 * 60 * 1000))
        const dateKey = brtTime.toISOString().split('T')[0]

        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: brtTime,
                dateKey,
                label: format(brtTime, "dd 'de' MMMM", { locale: ptBR }),
                weekDay: format(brtTime, 'EEEE', { locale: ptBR }),
                fullDate: `${brtTime.getUTCDate().toString().padStart(2, '0')}/${(brtTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${brtTime.getUTCFullYear()}`,
                piGroups: {}
            }
        }

        const pi = capture.campaign.pi
        if (!acc[dateKey].piGroups[pi]) {
            acc[dateKey].piGroups[pi] = {
                pi,
                client: capture.campaign.client,
                campaignName: capture.campaign.campaignName,
                captures: []
            }
        }

        acc[dateKey].piGroups[pi].captures.push(capture)
        return acc
    }, {})

    const timeline = Object.values(groupedCaptures)
        .sort((a: any, b: any) => b.date.getTime() - a.date.getTime()) as any[]

    timeline.forEach((day: any) => {
        day.sortedPiGroups = Object.values(day.piGroups).sort(
            (a: any, b: any) => a.pi.localeCompare(b.pi)
        )
    })

    const totalFolders = timeline.reduce((sum: number, g: any) => sum + g.sortedPiGroups.length, 0)

    return (
        <div className="pb-24 animate-fade-in">

            {/* ── HEADER ─────────────────────────────────────────── */}
            <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div>
                    <p className="text-[10px] font-bold tracking-[0.4em] text-white/30 uppercase mb-2">
                        Neural Intelligence Archive
                    </p>
                    <h1
                        className="text-4xl md:text-5xl font-black tracking-tighter leading-none"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        BOOKS<span className="text-white/25 mx-2">/</span>CHRONOS
                    </h1>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/8">
                        <Library size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{captures.length} prints</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/8">
                        <FolderOpen size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{totalFolders} pastas</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/8">
                        <Calendar size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{timeline.length} dias</span>
                    </div>
                </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-white/10 via-white/5 to-transparent mb-10" />

            {/* ── STICKY DATE NAV ───────────────────────────────── */}
            {timeline.length > 1 && (
                <nav className="sticky top-3 z-50 mb-8 hidden md:flex">
                    <div className="flex items-center gap-1 bg-black/70 backdrop-blur-xl border border-white/8 rounded-2xl px-3 py-2 shadow-2xl">
                        <span className="text-[9px] font-black text-white/25 uppercase tracking-widest pr-3 border-r border-white/8">
                            Ir para
                        </span>
                        <div className="flex items-center gap-0.5 pl-2">
                            {timeline.slice(0, 10).map((group: any) => (
                                <a
                                    key={group.fullDate}
                                    href={`#day-${group.dateKey}`}
                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold text-white/35 hover:text-white hover:bg-white/8 transition-all"
                                >
                                    {group.fullDate.split('/')[0]}/{group.fullDate.split('/')[1]}
                                </a>
                            ))}
                        </div>
                    </div>
                </nav>
            )}

            {/* ── TIMELINE ──────────────────────────────────────── */}
            {timeline.length === 0 ? (
                <div className="py-40 text-center rounded-3xl border border-dashed border-white/8 bg-white/[0.015]">
                    <Library size={48} className="mx-auto mb-5 text-white/10" />
                    <h2 className="text-xl font-black text-white/40 mb-2">Arquivo vazio</h2>
                    <p className="text-xs text-white/20 uppercase tracking-widest mb-8">
                        Inicie o monitoramento para gerar evidências.
                    </p>
                    <Link
                        href="/monitoring"
                        className="inline-block px-10 py-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
                    >
                        Monitorar Agora
                    </Link>
                </div>
            ) : (
                <div className="space-y-16">
                    {timeline.map((group: any) => (
                        <section
                            key={group.dateKey}
                            id={`day-${group.dateKey}`}
                            className="scroll-mt-24"
                        >
                            {/* ─ Section header ─ */}
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/6">
                                <div className="flex items-center gap-5">
                                    {/* Date block */}
                                    <div className="text-center w-12 shrink-0">
                                        <p className="text-3xl font-black text-white leading-none">
                                            {group.fullDate.split('/')[0]}
                                        </p>
                                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                                            {format(group.date, 'MMM', { locale: ptBR })}
                                        </p>
                                    </div>

                                    <div className="w-px h-10 bg-white/10" />

                                    <div>
                                        <h2
                                            className="text-lg font-black text-white capitalize"
                                            style={{ fontFamily: 'var(--font-display)' }}
                                        >
                                            {group.weekDay}
                                        </h2>
                                        <p className="text-[11px] text-white/30 font-mono">{group.fullDate}</p>
                                    </div>

                                    <span className="ml-2 px-2.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-[9px] font-black text-white/35 uppercase tracking-widest">
                                        {group.sortedPiGroups.length} pasta{group.sortedPiGroups.length > 1 ? 's' : ''}
                                    </span>
                                </div>

                                {/* Download ZIP */}
                                <a
                                    href={`/api/books/download?date=${format(group.date, 'yyyy-MM-dd')}`}
                                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/8 hover:border-white/18 hover:bg-white/[0.06] text-white/50 hover:text-white font-bold text-[10px] uppercase tracking-widest transition-all group"
                                >
                                    <Download size={14} className="group-hover:scale-110 transition-transform" />
                                    ZIP do dia
                                </a>
                            </div>

                            {/* ─ Folder grid ─ */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {group.sortedPiGroups.map((piGroup: any) => (
                                    <PIFolderCard
                                        key={`${group.dateKey}-${piGroup.pi}`}
                                        pi={piGroup.pi}
                                        client={piGroup.client}
                                        campaignName={piGroup.campaignName}
                                        captureCount={piGroup.captures.length}
                                        thumbnailId={piGroup.captures[0].id}
                                        date={group.dateKey}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <BackToTopButton />
        </div>
    )
}
