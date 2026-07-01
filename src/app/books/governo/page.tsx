import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { Calendar, FolderOpen, Landmark, Library } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Link from 'next/link'
import { BackToTopButton } from '@/components/BackToTopButton'
import { PIFolderCard } from '@/components/PIFolderCard'

export const revalidate = 30

type BookCapture = Prisma.CaptureGetPayload<{
    select: {
        id: true
        createdAt: true
        screenshotPath: true
        campaign: {
            select: {
                pi: true
                client: true
                campaignName: true
            }
        }
    }
}>

type PiCaptureGroup = {
    pi: string
    client: string
    campaignName: string
    captures: BookCapture[]
}

type TimelineDayDraft = {
    date: Date
    dateKey: string
    weekDay: string
    fullDate: string
    piGroups: Record<string, PiCaptureGroup>
}

type TimelineDay = TimelineDayDraft & {
    sortedPiGroups: PiCaptureGroup[]
}

export default async function FederalBooksPage() {
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    const captures = await prisma.capture.findMany({
        where: {
            status: 'SUCCESS',
            screenshotPath: { not: '' },
            createdAt: { gte: sixtyDaysAgo },
            campaign: {
                isArchived: false,
                segmentation: 'GOV_FEDERAL',
            },
        },
        select: {
            id: true,
            createdAt: true,
            screenshotPath: true,
            campaign: {
                select: {
                    pi: true,
                    client: true,
                    campaignName: true,
                },
            },
        },
        orderBy: { createdAt: 'desc' },
    })

    const groupedCaptures = captures.reduce<Record<string, TimelineDayDraft>>((acc, capture) => {
        const brtTime = new Date(capture.createdAt.getTime() - (3 * 60 * 60 * 1000))
        const dateKey = brtTime.toISOString().split('T')[0]

        if (!acc[dateKey]) {
            acc[dateKey] = {
                date: brtTime,
                dateKey,
                weekDay: format(brtTime, 'EEEE', { locale: ptBR }),
                fullDate: `${brtTime.getUTCDate().toString().padStart(2, '0')}/${(brtTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${brtTime.getUTCFullYear()}`,
                piGroups: {},
            }
        }

        const pi = capture.campaign.pi
        if (!acc[dateKey].piGroups[pi]) {
            acc[dateKey].piGroups[pi] = {
                pi,
                client: capture.campaign.client,
                campaignName: capture.campaign.campaignName,
                captures: [],
            }
        }

        acc[dateKey].piGroups[pi].captures.push(capture)
        return acc
    }, {})

    const timeline = Object.values(groupedCaptures)
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((day): TimelineDay => ({
            ...day,
            sortedPiGroups: Object.values(day.piGroups).sort((a, b) => a.pi.localeCompare(b.pi)),
        }))

    const totalFolders = timeline.reduce((sum, day) => sum + day.sortedPiGroups.length, 0)
    const totalPis = new Set(captures.map(capture => capture.campaign.pi)).size

    return (
        <div className="pb-24 page-enter">
            <header className="mb-10 flex flex-col gap-6 border-b border-white/8 pb-8 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <Link
                        href="/books"
                        className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/55 transition-[background,border-color,color,transform] duration-200 hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
                    >
                        <Library size={14} />
                        Books
                    </Link>
                    <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.4em] text-white/30">
                        <Landmark size={13} />
                        Governo Federal
                    </p>
                    <h1
                        className="text-4xl font-black leading-none tracking-tighter text-white md:text-5xl"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        BOOKS<span className="mx-2 text-white/25">/</span>GOV
                    </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2">
                        <Library size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{captures.length} prints</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2">
                        <FolderOpen size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{totalFolders} pastas</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2">
                        <Landmark size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{totalPis} PIs</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-4 py-2">
                        <Calendar size={13} className="text-white/40" />
                        <span className="text-xs font-bold text-white/60">{timeline.length} dias</span>
                    </div>
                </div>
            </header>

            {timeline.length > 1 && (
                <nav className="sticky top-3 z-50 mb-8 hidden md:flex">
                    <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-black/70 px-3 py-2 shadow-2xl backdrop-blur-xl">
                        <span className="border-r border-white/8 pr-3 text-[9px] font-black uppercase tracking-widest text-white/25">
                            Ir para
                        </span>
                        <div className="flex items-center gap-0.5 pl-2">
                            {timeline.slice(0, 12).map(day => (
                                <a
                                    key={day.fullDate}
                                    href={`#day-${day.dateKey}`}
                                    className="rounded-lg px-3 py-1.5 text-[10px] font-bold text-white/35 transition-all hover:bg-white/8 hover:text-white"
                                >
                                    {day.fullDate.split('/')[0]}/{day.fullDate.split('/')[1]}
                                </a>
                            ))}
                        </div>
                    </div>
                </nav>
            )}

            {timeline.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/8 bg-white/[0.015] px-6 py-28 text-center">
                    <Landmark size={44} className="mx-auto mb-5 text-white/10" />
                    <h2 className="mb-2 text-xl font-black text-white/45">Nenhum print de Governo Federal</h2>
                    <p className="text-xs font-bold uppercase tracking-widest text-white/20">
                        Os prints GOV_FEDERAL aparecem aqui quando forem capturados.
                    </p>
                </div>
            ) : (
                <div className="space-y-16">
                    {timeline.map(day => (
                        <section key={day.dateKey} id={`day-${day.dateKey}`} className="scroll-mt-24">
                            <div className="mb-6 flex items-center justify-between border-b border-white/6 pb-4">
                                <div className="flex items-center gap-5">
                                    <div className="w-12 shrink-0 text-center">
                                        <p className="text-3xl font-black leading-none text-white">
                                            {day.fullDate.split('/')[0]}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-white/30">
                                            {format(day.date, 'MMM', { locale: ptBR })}
                                        </p>
                                    </div>

                                    <div className="h-10 w-px bg-white/10" />

                                    <div>
                                        <h2
                                            className="text-lg font-black capitalize text-white"
                                            style={{ fontFamily: 'var(--font-display)' }}
                                        >
                                            {day.weekDay}
                                        </h2>
                                        <p className="font-mono text-[11px] text-white/30">{day.fullDate}</p>
                                    </div>

                                    <span className="ml-2 rounded-full border border-white/8 bg-white/5 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white/35">
                                        {day.sortedPiGroups.length} pasta{day.sortedPiGroups.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                                {day.sortedPiGroups.map(piGroup => (
                                    <PIFolderCard
                                        key={`${day.dateKey}-${piGroup.pi}`}
                                        pi={piGroup.pi}
                                        client={piGroup.client}
                                        campaignName={piGroup.campaignName}
                                        captureCount={piGroup.captures.length}
                                        thumbnailId={piGroup.captures[0].id}
                                        thumbnailUrl={piGroup.captures[0].screenshotPath}
                                        date={day.dateKey}
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
