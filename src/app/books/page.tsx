import prisma from '@/lib/prisma'
import { Library, Download, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import fs from 'fs'
import Link from 'next/link'
import { BackToTopButton } from '@/components/BackToTopButton'
import { PIFolderCard } from '@/components/PIFolderCard'

export const dynamic = 'force-dynamic'

export default async function BooksPage() {
    // 1. Fetch all captures from non-archived campaigns
    const captures = await prisma.capture.findMany({
        where: {
            campaign: {
                isArchived: false
            }
        },
        include: {
            campaign: true
        },
        orderBy: {
            createdAt: 'desc'
        }
    })

    // 2. Group by day AND PI
    const groupedCaptures = captures.reduce((acc: any, capture: any) => {
        const dateKey = format(capture.createdAt, 'yyyy-MM-dd')

        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: capture.createdAt,
                label: format(capture.createdAt, "dd 'de' MMMM", { locale: ptBR }),
                fullDate: format(capture.createdAt, "dd/MM/yyyy"),
                piGroups: {}
            }
        }

        const pi = capture.campaign.pi
        if (!acc[dateKey].piGroups[pi]) {
            acc[dateKey].piGroups[pi] = {
                pi: pi,
                client: capture.campaign.client,
                campaignName: capture.campaign.campaignName,
                captures: [] // Still useful for counts and picking thumbnail
            }
        }

        acc[dateKey].piGroups[pi].captures.push(capture)
        return acc
    }, {})

    const timeline = Object.values(groupedCaptures).sort((a: any, b: any) =>
        b.date.getTime() - a.date.getTime()
    ) as any[]

    // Sort PI groups within each day
    timeline.forEach(day => {
        day.sortedPiGroups = Object.values(day.piGroups).sort((a: any, b: any) =>
            a.pi.localeCompare(b.pi)
        )
    })

    return (
        <div className="space-y-12 pb-20 animate-fade-in relative min-h-screen overflow-hidden">
            {/* Background Decorative Glows */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div
                    className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[150px] opacity-10 animate-pulse-glow"
                    style={{ background: 'var(--accent)' }}
                />
                <div
                    className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[150px] opacity-10"
                    style={{ background: 'var(--secondary)' }}
                />
                <div
                    className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full blur-[120px] opacity-5"
                    style={{ background: 'var(--tertiary)' }}
                />
            </div>

            <header className="relative z-10 p-8 rounded-[2rem] overflow-hidden border border-white/10 bg-gradient-to-br from-bg-secondary/80 to-bg-primary/90 shadow-2xl backdrop-blur-md">
                <div
                    className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[100px] opacity-20 pointer-events-none"
                    style={{ background: 'var(--accent)' }}
                />
                <div
                    className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full blur-[80px] opacity-10 pointer-events-none"
                    style={{ background: 'var(--secondary)' }}
                />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-secondary p-[1px] shadow-[0_0_30px_rgba(168,85,247,0.3)]">
                            <div className="w-full h-full rounded-[15px] bg-bg-secondary flex items-center justify-center text-white">
                                <Library size={28} />
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black tracking-tighter" style={{ fontFamily: 'var(--font-display)' }}>
                                BOOKS <span className="text-gradient font-black">CHRONOS</span>
                            </h1>
                            <p className="text-[10px] font-bold tracking-[0.4em] text-white/30 uppercase">Neural Intelligence Archive</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="bg-accent/5 border border-accent/20 px-5 py-2.5 rounded-xl flex items-center gap-3 shadow-lg shadow-accent/5 backdrop-blur-sm group hover:border-accent/40 transition-all">
                            <Library size={14} className="text-accent group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-black text-white/70">{captures.length} Prints</span>
                        </div>
                        <div className="bg-secondary/5 border border-secondary/20 px-5 py-2.5 rounded-xl flex items-center gap-3 shadow-lg shadow-secondary/5 backdrop-blur-sm group hover:border-secondary/40 transition-all">
                            <Clock size={14} className="text-secondary group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-black text-white/70">{timeline.length} Dias Ativos</span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Quick Navigation Sticky Bar */}
            {timeline.length > 1 && (
                <nav className="sticky top-4 z-50 bg-bg-primary/40 backdrop-blur-2xl border border-white/10 rounded-2xl p-2.5 mx-auto max-w-fit shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-fade-in hidden md:flex items-center gap-1">
                    <div className="px-4 border-r border-white/10 mr-2">
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Timeline</span>
                    </div>
                    <div className="flex items-center gap-1">
                        {timeline.slice(0, 8).map((group) => (
                            <a
                                key={group.fullDate}
                                href={`#section-${group.fullDate}`}
                                className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter text-white/40 hover:text-accent hover:bg-accent/10 transition-all border border-transparent hover:border-accent/20"
                            >
                                {group.fullDate.split('/')[0]}/{group.fullDate.split('/')[1]}
                            </a>
                        ))}
                    </div>
                </nav>
            )}

            <div className="space-y-32 relative z-10">
                {timeline.map((group, index) => {
                    const colors = ['var(--accent)', 'var(--secondary)', 'var(--tertiary)', 'var(--success)'];
                    const sectionColor = colors[index % colors.length];

                    return (
                        <section
                            key={group.fullDate}
                            id={`section-${group.fullDate}`}
                            className="relative animate-slide-up scroll-mt-32"
                        >
                            {/* Timeline Connector */}
                            <div
                                className="absolute left-0 top-0 bottom-[-128px] w-px hidden md:block opacity-20"
                                style={{ background: `linear-gradient(to b, ${sectionColor}, transparent)` }}
                            />

                            <div className="md:pl-10">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-3 h-3 rounded-full hidden md:block absolute left-[-6px] shadow-lg animate-pulse"
                                                style={{ background: sectionColor, boxShadow: `0 0 15px ${sectionColor}` }}
                                            />
                                            <h2 className="text-3xl font-black tracking-tight uppercase" style={{ fontFamily: 'var(--font-display)' }}>
                                                {group.label}
                                            </h2>
                                            <div
                                                className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest text-white/40 border border-white/5 bg-white/5"
                                            >
                                                {group.sortedPiGroups.length} Folders
                                            </div>
                                        </div>
                                        <p className="text-[11px] font-bold text-white/20 uppercase tracking-[0.3em] font-mono">{group.fullDate}</p>
                                    </div>

                                    <a
                                        href={`/api/books/download?date=${format(group.date, 'yyyy-MM-dd')}`}
                                        className="flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-white/20 text-white font-black text-[10px] uppercase tracking-widest transition-all group shadow-xl hover:translate-y-[-2px] active:translate-y-0"
                                    >
                                        <Download size={18} className="group-hover:scale-110 transition-transform text-accent" />
                                        Daily Archive ZIP
                                    </a>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {group.sortedPiGroups.map((piGroup: any) => (
                                        <PIFolderCard
                                            key={piGroup.pi}
                                            pi={piGroup.pi}
                                            client={piGroup.client}
                                            campaignName={piGroup.campaignName}
                                            captureCount={piGroup.captures.length}
                                            thumbnailId={piGroup.captures[0].id}
                                            accentColor={sectionColor}
                                        />
                                    ))}
                                </div>
                            </div>
                        </section>
                    );
                })}

                {timeline.length === 0 && (
                    <div className="py-40 text-center rounded-[3rem] border-2 border-dashed border-white/5 bg-white/[0.02] animate-fade-in relative z-10 backdrop-blur-md">
                        <Library size={64} className="mx-auto mb-6 text-accent/20 animate-pulse" />
                        <h2 className="text-2xl font-black mb-2 text-white/60 tracking-tight">The archive is empty</h2>
                        <p className="text-xs text-white/20 font-medium uppercase tracking-widest">Start monitoring to generate evidence.</p>
                        <Link
                            href="/monitoring"
                            className="mt-10 inline-block px-12 py-4 rounded-2xl bg-gradient-to-r from-accent to-secondary text-white font-black text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-[0_15px_40px_rgba(168,85,247,0.3)]"
                        >
                            Monitor Now
                        </Link>
                    </div>
                )}
            </div>

            <BackToTopButton />
        </div>
    )
}
